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
import ctypes
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
TARGET_VOLUMES = dict(zip(managed.ROLES, ('kan140_rollback_postgres_data',
                                         'kan140_rollback_redis_data',
                                         'kan140_rollback_evolution_instances')))


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


class _StatxTimestamp(ctypes.Structure):
    _fields_ = [('sec', ctypes.c_int64), ('nsec', ctypes.c_uint32),
                ('reserved', ctypes.c_int32)]


class _Statx(ctypes.Structure):
    # Linux UAPI: fixed 256-byte buffer, btime at 0x50, device IDs at 0x88.
    # Reserve all fields beyond 0x90; newer kernels may fill them without
    # changing the ABI. Never substitute platform-dependent struct stat.
    _fields_ = [('mask', ctypes.c_uint32), ('blksize', ctypes.c_uint32),
                ('attributes', ctypes.c_uint64), ('nlink', ctypes.c_uint32),
                ('uid', ctypes.c_uint32), ('gid', ctypes.c_uint32),
                ('mode', ctypes.c_uint16), ('spare0', ctypes.c_uint16),
                ('ino', ctypes.c_uint64), ('size', ctypes.c_uint64),
                ('blocks', ctypes.c_uint64), ('attributes_mask', ctypes.c_uint64),
                ('atime', _StatxTimestamp), ('btime', _StatxTimestamp),
                ('ctime', _StatxTimestamp), ('mtime', _StatxTimestamp),
                ('rdev_major', ctypes.c_uint32), ('rdev_minor', ctypes.c_uint32),
                ('dev_major', ctypes.c_uint32), ('dev_minor', ctypes.c_uint32),
                ('reserved', ctypes.c_uint64 * 14)]


def _libc_statx():
    try:
        _require(ctypes.sizeof(_Statx) == 256 and _Statx.btime.offset == 80 and
                 _Statx.dev_major.offset == 136, 'freshness-target-btime-unavailable')
        function = ctypes.CDLL(None, use_errno=True).statx
        function.argtypes = (ctypes.c_int, ctypes.c_char_p, ctypes.c_int,
                             ctypes.c_uint, ctypes.POINTER(_Statx))
        function.restype = ctypes.c_int
        return function
    except Exception:
        raise FreshnessError('freshness-target-btime-unavailable') from None


def _birth_identity(fd, deadline):
    """Mandatory descriptor statx birth time; independent of mutable data metadata."""
    _tick(deadline)
    before = os.fstat(fd)
    result = _Statx()
    function = _libc_statx()
    # AT_EMPTY_PATH on our already no-follow-opened directory, STATX_BASIC_STATS
    # | STATX_BTIME. No pathname or architecture-specific raw syscall fallback.
    status = function(fd, b'', 0x1000, 0x0fff, ctypes.byref(result))
    _tick(deadline)
    _require(status == 0 and result.mask & 0x0901 == 0x0901 and
             0 <= result.btime.nsec < 1_000_000_000 and result.btime.sec >= 0 and
             result.btime.sec * 1_000_000_000 + result.btime.nsec > 0,
             'freshness-target-btime-unavailable')
    after = os.fstat(fd)
    _require(stat.S_ISDIR(before.st_mode) and stat.S_ISDIR(after.st_mode) and
             stat.S_ISDIR(result.mode) and before.st_dev == after.st_dev and
             before.st_ino == after.st_ino == result.ino and
             os.major(before.st_dev) == result.dev_major and
             os.minor(before.st_dev) == result.dev_minor,
             'freshness-target-changed')
    return {'device': before.st_dev, 'inode': result.ino,
            'birth_ns': result.btime.sec * 1_000_000_000 + result.btime.nsec}


@contextmanager
def _target_data(parent, deadline):
    """Check immutable identity and the name binding; allow chmod/chown/writes."""
    _tick(deadline)
    before = os.stat('_data', dir_fd=parent, follow_symlinks=False)
    _require(stat.S_ISDIR(before.st_mode), 'freshness-type')
    flags = os.O_PATH | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
    fd = os.open('_data', flags, dir_fd=parent)
    try:
        identity = _birth_identity(fd, deadline)
        _require((before.st_dev, before.st_ino) ==
                 (identity['device'], identity['inode']), 'freshness-target-changed')
        yield fd, identity
        _require(_birth_identity(fd, deadline) == identity, 'freshness-target-changed')
        # Reopen the directory entry, not merely the potentially unlinked old FD.
        current = os.stat('_data', dir_fd=parent, follow_symlinks=False)
        _require(stat.S_ISDIR(current.st_mode), 'freshness-type')
        rebound = os.open('_data', flags, dir_fd=parent)
        try:
            _require(_birth_identity(rebound, deadline) == identity and
                     (current.st_dev, current.st_ino) ==
                     (identity['device'], identity['inode']), 'freshness-target-changed')
        finally:
            os.close(rebound)
    finally:
        os.close(fd)


def _target_pins(value):
    _require(type(value) in (tuple, list) and len(value) == 3,
             'freshness-target-unproven')
    pins = []
    for role, pin in zip(managed.ROLES, value):
        _require(type(pin) is dict and set(pin) ==
                 {'schema', 'name', 'metadata_digest', 'device', 'inode', 'birth_ns'},
                 'freshness-target-unproven')
        _require(type(pin['schema']) is int and pin['schema'] == 1 and
                 type(pin['name']) is str and pin['name'] == TARGET_VOLUMES[role] and
                 type(pin['metadata_digest']) is str and
                 re.fullmatch('[a-f0-9]{64}', pin['metadata_digest']) is not None and
                 all(type(pin[key]) is int and 0 <= pin[key] < 2 ** 64
                     for key in ('device', 'inode')) and pin['inode'] > 0 and
                 type(pin['birth_ns']) is int and
                 0 < pin['birth_ns'] < 2 ** 63 * 1_000_000_000,
                 'freshness-target-unproven')
        pins.append(dict(pin))
    return tuple(pins)


class RollbackTargets:
    """Durable target continuity, not data freshness after writers resume.

    capture(expected_copy, *, deadline=None) -> three opaque JSON-safe dict pins.
    Call immediately after a complete copy under exclusive backup.lock, before
    any rebind/resume, and durably store ALL pins. Missing pins are manual-only.
    verify(pins, *, deadline=None) -> True; metadata only, allowing child writes
    and _data ownership/mode changes. No pins are ever used as filesystem paths.
    Requires libc.statx and filesystem STATX_BTIME; absence is a hard rejection.
    """
    def __init__(self, docker, runtime, *, timeout=120):
        _require(type(timeout) in (int, float) and math.isfinite(timeout) and
                 0 < timeout <= 120, 'freshness-policy')
        self.docker, self.runtime, self.timeout = docker, runtime, timeout

    def capture(self, expected_copy, *, deadline=None):
        try:
            return self._collect(_receipts(expected_copy), None, deadline)
        except FreshnessError:
            raise
        except Exception:
            raise FreshnessError('freshness-target-unavailable') from None

    def verify(self, pins, *, deadline=None):
        try:
            self._collect(None, _target_pins(pins), deadline)
            return True
        except FreshnessError:
            raise
        except Exception:
            raise FreshnessError('freshness-target-unavailable') from None

    def _collect(self, expected, pins, deadline):
        _linux()
        _require(os.geteuid() == 0, 'freshness-root-required')
        _require(type(self.runtime.SWARM_VOLUMES) is dict and
                 self.runtime.SWARM_VOLUMES == TARGET_VOLUMES, 'freshness-target-policy')
        now = time.monotonic()
        if deadline is not None:
            _require(type(deadline) in (int, float) and math.isfinite(deadline) and
                     deadline > now, 'freshness-deadline')
        end = min(now + self.timeout, deadline) if deadline is not None else now + self.timeout

        def execute(args):
            _tick(end)
            output = self.docker.execute(args, end)
            _tick(end)
            _require(type(output) is bytes and len(output) <= MAX_CONTROL,
                     'freshness-docker-response')
            return output

        root_path = execute(('info', '--format', '{{.DockerRootDir}}')).decode('utf-8', 'strict')
        if root_path.endswith('\n'):
            root_path = root_path[:-1]
        _require('\n' not in root_path and '\r' not in root_path, 'freshness-root-path')

        def metadata(name):
            rows = json.loads(execute(('volume', 'inspect', name)))
            _require(type(rows) is list and len(rows) == 1 and type(rows[0]) is dict,
                     'freshness-volume-inspect')
            volume = rows[0]
            labels = volume.get('Labels')
            _require(volume.get('Name') == name and volume.get('Driver') == 'local' and
                     volume.get('Scope') == 'local' and 'Options' in volume and
                     volume['Options'] in (None, {}) and
                     volume.get('Mountpoint') == root_path + '/volumes/' + name + '/_data' and
                     type(volume.get('CreatedAt')) is str and
                     0 < len(volume['CreatedAt']) <= 128 and
                     type(labels) is dict and set(labels) ==
                     {volume_transfer.OWNER_LABEL, volume_transfer.PHASE_LABEL} and
                     type(labels[volume_transfer.OWNER_LABEL]) is str and
                     re.fullmatch('[a-f0-9]{32}', labels[volume_transfer.OWNER_LABEL]) is not None and
                     labels[volume_transfer.PHASE_LABEL] == 'rollback',
                     'freshness-target-policy')
            immutable = {key: volume[key] for key in
                         ('Name', 'Driver', 'Scope', 'Options', 'Mountpoint', 'CreatedAt', 'Labels')}
            digest = hashlib.sha256(json.dumps(immutable, sort_keys=True, ensure_ascii=True,
                                               separators=(',', ':'), allow_nan=False).encode()).hexdigest()
            return digest

        current = []
        with _absolute(root_path, end, trusted=True) as docker_root:
            with _child(docker_root, 'volumes', end, trusted=True) as volumes:
                for index, role in enumerate(managed.ROLES):
                    name = TARGET_VOLUMES[role]
                    digest = metadata(name)
                    with _child(volumes, name, end, trusted=True) as named:
                        with _target_data(named, end) as (data, identity):
                            pin = {'schema': 1, 'name': name, 'metadata_digest': digest, **identity}
                            if expected is not None:
                                _require(_manifest(data, end, MAX_BYTES, MAX_ENTRIES) == expected[index],
                                         'freshness-target-mismatch')
                            else:
                                _require(pin == pins[index], 'freshness-target-changed')
                        _require(metadata(name) == digest, 'freshness-target-changed')
                    current.append(pin)
        _tick(end)
        return tuple(current)
