"""Read-only CURRENT managed-volume evidence, not permission to copy or resume.

API: RollbackFreshness(docker, runtime, timeout=120)(expected_copy, *,
deadline=None) -> tuple of
three {digest, entries, bytes} dictionaries in managed.ROLES order. The injected
docker.execute(args, deadline) MUST use the host's local Unix Docker endpoint.
Only info and exact fixed-name volume inspections are issued; no CLI is built.
Every call recollects and compares evidence; None or unproven receipts fail closed.
The coordinator must hold backup.lock and exclude ALL writers/daemon mutators
across both calls, service changes and publication. This is not an atomic snapshot
and cannot defeat an adversarial root administrator or writes after return.
No fallback, helpers, containers, copies, creates, logs, or filesystem writes.
"""
from contextlib import contextmanager
import hashlib
import json
import math
import os
import re
import stat
import sys
import time

import managed_cutover as managed
import volume_transfer


MAX_BYTES = volume_transfer.MAX_BYTES
MAX_ENTRIES = volume_transfer.MAX_ENTRIES
MAX_CONTROL = 2 * 1024 ** 2
VOLUMES = dict(zip(managed.ROLES, ('kan140_qa_postgres_data',
                                  'kan140_qa_redis_data',
                                  'kan140_qa_evolution_instances')))


class FreshnessError(Exception):
    """Fixed public codes only; never filesystem paths or Docker diagnostics."""


def _require(value, code):
    if not value:
        raise FreshnessError(code)


def _linux():
    _require(sys.platform == 'linux' and all(hasattr(os, name) for name in
             ('O_DIRECTORY', 'O_NOFOLLOW', 'O_NOATIME', 'O_PATH')) and
             os.open in os.supports_dir_fd and os.stat in os.supports_dir_fd and
             os.scandir in os.supports_fd, 'freshness-linux-required')


def _tick(deadline):
    _require(time.monotonic() < deadline, 'freshness-deadline')


def _deadline(value):
    _require(type(value) in (int, float) and math.isfinite(value) and
             0 < value - time.monotonic() <= 120, 'freshness-deadline')


def _policy(max_bytes, max_entries):
    _require(type(max_bytes) is int and 0 < max_bytes <= MAX_BYTES and
             type(max_entries) is int and 0 < max_entries <= MAX_ENTRIES,
             'freshness-policy')


def _signature(info):
    # atime is intentionally excluded; ctime catches restored mtime/size writes.
    return (info.st_dev, info.st_ino, info.st_mode, info.st_uid, info.st_gid,
            info.st_nlink, info.st_size, info.st_mtime_ns, info.st_ctime_ns)


def _same(left, right):
    _require(_signature(left) == _signature(right), 'freshness-changed')


def _trusted(info):
    _require(stat.S_ISDIR(info.st_mode) and info.st_uid == 0 and
             not info.st_mode & 0o022, 'freshness-untrusted-root')


def _dir_flags():
    return os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_NOATIME | os.O_CLOEXEC


@contextmanager
def _child(parent, name, deadline, *, trusted=False, path_only=False):
    _tick(deadline)
    before = os.stat(name, dir_fd=parent, follow_symlinks=False)
    _require(stat.S_ISDIR(before.st_mode), 'freshness-type')
    flags = ((os.O_PATH | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
             if path_only else _dir_flags())
    fd = os.open(name, flags, dir_fd=parent)
    try:
        _same(before, os.fstat(fd))
        if trusted:
            _trusted(before)
        yield fd
        _tick(deadline)
        _same(before, os.fstat(fd))
        _same(before, os.stat(name, dir_fd=parent, follow_symlinks=False))
    finally:
        os.close(fd)


@contextmanager
def _absolute(path, deadline, *, trusted=False):
    # O_PATH opens ancestors without reading them or changing their access times.
    _require(type(path) is str and path.startswith('/') and path != '/' and
             len(os.fsencode(path)) <= 4096 and '\x00' not in path and
             all(p not in ('', '.', '..') for p in path[1:].split('/')),
             'freshness-root-path')
    from contextlib import ExitStack
    with ExitStack() as stack:
        fd = os.open('/', os.O_PATH | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
        stack.callback(os.close, fd)
        if trusted:
            _trusted(os.fstat(fd))
        for part in path[1:].split('/'):
            fd = stack.enter_context(_child(fd, part, deadline, trusted=trusted,
                                            path_only=True))
        yield fd


def _scan(root, deadline, max_bytes, max_entries, expected=None):
    """Iterative descriptor walk; second pass verifies every recorded identity."""
    rows, snapshots, total = [], {}, 0
    root_info = os.fstat(root)
    device = root_info.st_dev
    stack = []

    def record(name, info):
        _tick(deadline)
        _require(len(os.fsencode('.' if name == '.' else './' + name)) <= 4096,
                 'freshness-name')
        _require(info.st_dev == device, 'freshness-device')
        _require(stat.S_ISDIR(info.st_mode) or stat.S_ISREG(info.st_mode),
                 'freshness-type')
        _require(not stat.S_ISREG(info.st_mode) or info.st_nlink == 1,
                 'freshness-hardlink')
        _require(name not in snapshots and len(snapshots) < max_entries,
                 'freshness-entry-limit')
        snapshots[name] = _signature(info)
        if expected is not None:
            _require(expected.get(name) == snapshots[name], 'freshness-changed')

    def descend(fd, name, info):
        iterator = os.scandir(fd)
        stack.append((fd, name, info, iterator))

    try:
        record('.', root_info)
        # Own a distinct open description so directory iteration starts at zero.
        start = os.open('.', _dir_flags(), dir_fd=root)
        try:
            _same(root_info, os.fstat(start))
            descend(start, '.', root_info)
        except BaseException:
            os.close(start)
            raise
        if expected is None:
            rows.append(('.', 'd', root_info.st_uid, root_info.st_gid,
                         root_info.st_mode & 0o7777, 0, hashlib.sha256().hexdigest()))
        while stack:
            _tick(deadline)
            parent, relative, before, iterator = stack[-1]
            item = next(iterator, None)
            if item is None:
                _same(before, os.fstat(parent))
                iterator.close()
                os.close(parent)
                stack.pop()
                continue
            leaf = item.name
            _require(leaf not in ('', '.', '..') and '/' not in leaf and '\x00' not in leaf,
                     'freshness-name')
            name = leaf if relative == '.' else relative + '/' + leaf
            info = os.stat(leaf, dir_fd=parent, follow_symlinks=False)
            record(name, info)
            directory = stat.S_ISDIR(info.st_mode)
            size = 0 if directory else info.st_size
            _require(0 <= size <= max_bytes and total + size <= max_bytes,
                     'freshness-byte-limit')
            total += size
            flags = _dir_flags() if directory else (
                os.O_RDONLY | os.O_NOFOLLOW | os.O_NOATIME | os.O_CLOEXEC | os.O_NONBLOCK)
            fd = os.open(leaf, flags, dir_fd=parent)
            try:
                _same(info, os.fstat(fd))
                digest = hashlib.sha256()
                if not directory and expected is None:
                    remaining = size
                    while remaining:
                        _tick(deadline)
                        data = os.read(fd, min(65536, remaining))
                        _require(bool(data), 'freshness-changed')
                        digest.update(data)
                        remaining -= len(data)
                    _tick(deadline)
                    _require(not os.read(fd, 1), 'freshness-changed')
                _same(info, os.fstat(fd))
                _same(info, os.stat(leaf, dir_fd=parent, follow_symlinks=False))
                if expected is None:
                    rows.append((name, 'd' if directory else 'f', info.st_uid,
                                 info.st_gid, info.st_mode & 0o7777, size,
                                 digest.hexdigest()))
                if directory:
                    descend(fd, name, info)
                    fd = None
            finally:
                if fd is not None:
                    os.close(fd)
        _same(root_info, os.fstat(root))
        if expected is not None:
            _require(snapshots == expected, 'freshness-changed')
        return rows, snapshots, total
    finally:
        for fd, _, _, iterator in reversed(stack):
            iterator.close()
            os.close(fd)


def _manifest(root, deadline, max_bytes, max_entries):
    rows, snapshots, total = _scan(root, deadline, max_bytes, max_entries)
    _scan(root, deadline, max_bytes, max_entries, expected=snapshots)
    digest = hashlib.sha256()
    for row in sorted(rows):
        _tick(deadline)
        digest.update(json.dumps(row, ensure_ascii=True, separators=(',', ':')).encode())
        digest.update(b'\n')
    return {'digest': digest.hexdigest(), 'entries': len(rows), 'bytes': total}


def filesystem_manifest(path, deadline, *, max_bytes=MAX_BYTES, max_entries=MAX_ENTRIES):
    """Pure Linux helper for owned temporary trees; no root ownership requirement.

    O_NOATIME is mandatory (no retry without it). File owners can test non-root.
    Production uses trusted Docker ancestors instead, never this path entrypoint.
    """
    try:
        _linux()
        _deadline(deadline)
        _policy(max_bytes, max_entries)
        with _absolute(os.fspath(path), deadline) as parent:
            with _child(parent, '.', deadline) as root:
                return _manifest(root, deadline, max_bytes, max_entries)
    except FreshnessError:
        raise
    except Exception:
        raise FreshnessError('freshness-filesystem') from None


def _receipts(value):
    _require(type(value) in (tuple, list) and len(value) == 3,
             'freshness-copy-unproven')
    for row in value:
        _require(type(row) is dict and set(row) == {'digest', 'entries', 'bytes'},
                 'freshness-copy-unproven')
        _require(type(row['digest']) is str and
                 re.fullmatch('[a-f0-9]{64}', row['digest']) is not None and
                 type(row['entries']) is int and 1 <= row['entries'] <= MAX_ENTRIES and
                 type(row['bytes']) is int and 0 <= row['bytes'] <= MAX_BYTES,
                 'freshness-copy-unproven')
    return tuple(dict(row) for row in value)


class RollbackFreshness:
    """Reusable callback; per-call shared <=120s deadline, per-volume limits."""
    def __init__(self, docker, runtime, *, timeout=120):
        _require(type(timeout) in (int, float) and math.isfinite(timeout) and
                 0 < timeout <= 120, 'freshness-policy')
        self.docker, self.runtime, self.timeout = docker, runtime, timeout

    def __call__(self, expected_copy, *, deadline=None):
        try:
            expected = _receipts(expected_copy)
            _linux()
            _require(os.geteuid() == 0, 'freshness-root-required')
            _require(type(self.runtime.VOLUMES) is dict and self.runtime.VOLUMES == VOLUMES,
                     'freshness-volume-policy')
            now = time.monotonic()
            if deadline is not None:
                _require(type(deadline) in (int, float) and math.isfinite(deadline)
                         and deadline > now, 'freshness-deadline')
            deadline = min(now + self.timeout, deadline) if deadline is not None else now + self.timeout

            def execute(args):
                _tick(deadline)
                output = self.docker.execute(args, deadline)
                _tick(deadline)
                _require(type(output) is bytes and len(output) <= MAX_CONTROL,
                         'freshness-docker-response')
                return output

            output = execute(('info', '--format', '{{.DockerRootDir}}'))
            root_path = output.decode('utf-8', 'strict')
            # Accept exactly the CLI's one line, not whitespace-normalized paths.
            if root_path.endswith('\n'):
                root_path = root_path[:-1]
            _require('\n' not in root_path and '\r' not in root_path,
                     'freshness-root-path')
            current = []
            with _absolute(root_path, deadline, trusted=True) as docker_root:
                with _child(docker_root, 'volumes', deadline, trusted=True) as volumes:
                    for role in managed.ROLES:
                        name = VOLUMES[role]
                        rows = json.loads(execute(('volume', 'inspect', name)))
                        _require(type(rows) is list and len(rows) == 1 and
                                 type(rows[0]) is dict, 'freshness-volume-inspect')
                        volume = rows[0]
                        _require(volume.get('Name') == name and
                                 volume.get('Driver') == 'local' and
                                 volume.get('Scope') == 'local' and
                                 'Options' in volume and volume['Options'] in (None, {}) and
                                 volume.get('Mountpoint') == root_path + '/volumes/' + name + '/_data',
                                 'freshness-volume-policy')
                        with _child(volumes, name, deadline, trusted=True) as named:
                            # _data can legitimately be UID 999, including its root.
                            with _child(named, '_data', deadline) as data:
                                current.append(_manifest(data, deadline, MAX_BYTES, MAX_ENTRIES))
            _tick(deadline)
            _require(tuple(current) == expected, 'freshness-mismatch')
            return tuple(current)
        except FreshnessError:
            raise
        except Exception:
            raise FreshnessError('freshness-unavailable') from None
