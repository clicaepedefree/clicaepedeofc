"""Opt-in real Docker/filesystem freshness proof on disposable GitHub Linux CI.

Requires KAN140_FRESHNESS_INTEGRATION=true, GITHUB_ACTIONS=true and Linux root.
CI must provision /var/lib/clicaepede/kan133 as root:root 0700, with trusted
parents, and exclusively own the local daemon. Existing managed names are fatal.
No SSH, application data, containers, helpers, pulls, prune or production writes.
Run via unittest discovery with this exact filename. Never run on a shared host.
"""
import copy
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
import time
import unittest
import uuid


HERE = Path(__file__).resolve().parent
BASE = Path('/var/lib/clicaepede/kan133')
LABEL = 'clicaepede.kan140.freshness-native-fixture'
MARKER = 'synthetic-freshness-marker'
OLD = b'synthetic-current-v1'
NEW = b'synthetic-current-v2'
OPT_IN = (os.environ.get('KAN140_FRESHNESS_INTEGRATION') == 'true' and
          os.environ.get('GITHUB_ACTIONS') == 'true' and sys.platform == 'linux' and
          getattr(os, 'geteuid', lambda: -1)() == 0)
ENV = {'PATH': '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
       'LANG': 'C', 'LC_ALL': 'C', 'PYTHONDONTWRITEBYTECODE': '1'}


def require(value, code):
    if not value:
        raise AssertionError(code)


def trusted(path):
    require(path.is_absolute() and path.resolve() == path, 'fixture_path_not_canonical')
    for parent in (*reversed(path.parents), path):
        info = parent.lstat()
        require(stat.S_ISDIR(info.st_mode) and info.st_uid == info.st_gid == 0 and
                not info.st_mode & 0o022, 'fixture_untrusted_parent')


def command(args, end):
    left = end - time.monotonic()
    require(left > 0, 'fixture_deadline')
    try:
        result = subprocess.run(args, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                stderr=subprocess.DEVNULL, env=ENV,
                                timeout=min(3, left), check=False)
    except (OSError, subprocess.TimeoutExpired):
        raise AssertionError('fixture_command_unavailable_or_timeout') from None
    require(result.returncode == 0 and len(result.stdout) <= 1024 * 1024,
            'fixture_command_failed')
    return result.stdout


class PreparationDocker:
    """Separate CLI for setup/cleanup; no collector capability is shared."""
    def __init__(self, config, names, end):
        self.prefix = ['docker', '--host', 'unix:///var/run/docker.sock',
                       '--config', str(config)]
        self.names, self.end = tuple(names), end

    def run(self, *args):
        return command(self.prefix + list(args), self.end)

    def exists(self, name):
        require(name in self.names, 'fixture_unmanaged_name')
        rows = self.run('volume', 'ls', '--filter', 'name=^' + name + '$',
                        '--format', '{{.Name}}').decode('ascii').splitlines()
        require(rows in ([], [name]), 'fixture_name_collision')
        return bool(rows)

    def owned(self, name, token, docker_root):
        require(name in self.names, 'fixture_unmanaged_name')
        rows = json.loads(self.run('volume', 'inspect', name))
        require(type(rows) is list and len(rows) == 1, 'fixture_inspect_shape')
        row = rows[0]
        path = docker_root / 'volumes' / name / '_data'
        require(row.get('Name') == name and row.get('Driver') == 'local' and
                row.get('Scope') == 'local' and row.get('Options') in (None, {}) and
                row.get('Labels') == {LABEL: token} and
                row.get('Mountpoint') == str(path), 'fixture_ownership_rejected')
        trusted(path.parent)
        info = path.lstat()
        require(stat.S_ISDIR(info.st_mode) and path.resolve() == path,
                'fixture_data_not_directory')
        return path


class ReadOnlyDocker:
    """Wrap the real DockerProcess and reject every non-collector operation."""
    def __init__(self, process, names):
        self.process, self.names, self.calls = process, tuple(names), []

    def execute(self, args, deadline):
        args = tuple(args)
        require(args == ('info', '--format', '{{.DockerRootDir}}') or
                (len(args) == 3 and args[:2] == ('volume', 'inspect') and
                 args[2] in self.names), 'fixture_collector_attempted_write')
        self.calls.append(args)
        return self.process.execute(args, deadline)


def signature(path):
    info = path.lstat()
    return (info.st_dev, info.st_ino, info.st_mode, info.st_uid, info.st_gid,
            info.st_nlink, info.st_size, info.st_atime_ns, info.st_mtime_ns,
            info.st_ctime_ns)


def snapshot(paths):
    """Include atime: the native collector must really use O_NOATIME."""
    result = {}
    for path in paths:
        fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_NOATIME)
        try:
            require(os.listdir(fd) == [MARKER], 'fixture_unexpected_data')
        finally:
            os.close(fd)
        result[str(path)] = signature(path)
        marker = path / MARKER
        result[str(marker)] = signature(marker)
        fd = os.open(marker, os.O_RDONLY | os.O_NOFOLLOW | os.O_NOATIME)
        try:
            result[str(marker) + ':bytes'] = os.read(fd, 1024)
        finally:
            os.close(fd)
    return result


@unittest.skipUnless(OPT_IN, 'requires opt-in disposable GitHub Actions Linux/root CI')
class RollbackFreshnessNativeTests(unittest.TestCase):
    def test_actual_current_hash_and_later_write_rejected_without_repair(self):
        sys.path.insert(0, str(HERE))
        try:
            import rollback_freshness as freshness
            import volume_transfer
            spec = importlib.util.spec_from_file_location(
                '_kan140_freshness_native_runtime', HERE.parent / 'kan133/runtime.py')
            runtime = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(runtime)
        finally:
            sys.path.pop(0)

        self.assertEqual(runtime.VOLUMES, freshness.VOLUMES)
        names = tuple(freshness.VOLUMES.values())
        self.assertEqual(len(set(names)), 3)
        trusted(BASE)
        self.assertEqual(stat.S_IMODE(BASE.lstat().st_mode), 0o700)
        require(shutil.rmtree.avoids_symlink_attacks, 'fixture_safe_rmtree_required')
        start = time.monotonic()
        work_end, cleanup_end = start + 55, start + 88
        previous_umask = os.umask(0o077)
        root = None
        docker = None
        intended = []
        token = uuid.uuid4().hex
        failures = []
        # The outer alarm bounds Python filesystem operations too. Cleanup gets
        # the remaining budget; subprocess calls reserve time for reaping.
        def expired(signum, frame):
            raise AssertionError('fixture_total_deadline')
        previous_alarm = signal.signal(signal.SIGALRM, expired)
        signal.setitimer(signal.ITIMER_REAL, 90)
        try:
            root = Path(tempfile.mkdtemp(prefix='kan140-freshness-native-', dir=BASE))
            trusted(root)
            self.assertEqual(stat.S_IMODE(root.lstat().st_mode), 0o700)
            docker = PreparationDocker(root, names, work_end)
            raw_root = docker.run('info', '--format', '{{.DockerRootDir}}').decode('utf-8')
            require(raw_root.endswith('\n') and raw_root.count('\n') == 1 and
                    '\r' not in raw_root, 'fixture_invalid_docker_root')
            docker_root = Path(raw_root[:-1])
            trusted(docker_root)
            trusted(docker_root / 'volumes')
            self.assertIn(b'GNU tar', command(['tar', '--version'], work_end))

            # Evaluate ALL names before ANY create; a collision never enters intent.
            existing = [docker.exists(name) for name in names]
            self.assertEqual(existing, [False, False, False], 'fixture_managed_name_exists')
            paths = []
            for name in names:
                require(not docker.exists(name), 'fixture_name_appeared_before_create')
                intended.append(name)  # Record even a timeout/unknown create exit.
                with (root / 'create-intent.json').open('w', encoding='ascii') as journal:
                    json.dump({'token': token, 'names': intended}, journal)
                    journal.flush()
                    os.fsync(journal.fileno())
                self.assertEqual(docker.run('volume', 'create', '--driver', 'local',
                                           '--label', LABEL + '=' + token, name).strip(),
                                 name.encode('ascii'))
                path = docker.owned(name, token, docker_root)
                self.assertEqual(list(path.iterdir()), [], 'fixture_volume_not_fresh')
                # Only newly created, labelled, empty native directories are written.
                os.chown(path, 999, 999)
                os.chmod(path, 0o700)
                marker = path / MARKER
                fd = os.open(marker, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                             0o600)
                with os.fdopen(fd, 'wb') as output:
                    output.write(OLD)
                os.chown(marker, 999, 999)
                self.assertEqual(path.lstat().st_uid, 999)
                self.assertEqual(path.parent.lstat().st_uid, 0)
                paths.append(path)

            expected = tuple(volume_transfer.tar_manifest(io.BytesIO(command(
                ['tar', '--format=gnu', '-C', str(path), '-cf', '-', '.'], work_end)),
                work_end) for path in paths)
            self.assertTrue(all(row['entries'] == 2 and row['bytes'] == len(OLD)
                                for row in expected))
            readonly = ReadOnlyDocker(volume_transfer.DockerProcess(root), names)
            collector = freshness.RollbackFreshness(readonly, runtime, timeout=45)
            saved = copy.deepcopy(expected)
            before = snapshot(paths)
            self.assertEqual(collector(expected, deadline=work_end), expected)
            self.assertEqual(snapshot(paths), before, 'fixture_collector_wrote_data')
            allowed_call = [('info', '--format', '{{.DockerRootDir}}')] + [
                ('volume', 'inspect', name) for name in names]
            self.assertEqual(readonly.calls, allowed_call)

            # Equal-length bytes make this a content proof, not a size-only check.
            self.assertEqual(len(OLD), len(NEW))
            docker.owned(names[0], token, docker_root)
            fd = os.open(paths[0] / MARKER, os.O_WRONLY | os.O_NOFOLLOW)
            with os.fdopen(fd, 'wb') as output:
                output.write(NEW)
            new_receipt = volume_transfer.tar_manifest(io.BytesIO(command(
                ['tar', '--format=gnu', '-C', str(paths[0]), '-cf', '-', '.'], work_end)),
                work_end)
            self.assertNotEqual(new_receipt['digest'], expected[0]['digest'])
            self.assertEqual(new_receipt['entries'], expected[0]['entries'])
            self.assertEqual(new_receipt['bytes'], expected[0]['bytes'])
            changed = snapshot(paths)
            with self.assertRaises(freshness.FreshnessError) as caught:
                collector(expected, deadline=work_end)
            self.assertEqual(str(caught.exception), 'freshness-mismatch')
            self.assertEqual(snapshot(paths), changed, 'fixture_collector_repaired_data')
            self.assertEqual(changed[str(paths[0] / MARKER) + ':bytes'], NEW)
            self.assertEqual(expected, saved, 'fixture_receipt_mutated')
            self.assertEqual(readonly.calls, allowed_call * 2)
        finally:
            if docker is not None:
                docker.end = cleanup_end
                for name in reversed(intended):
                    try:
                        if docker.exists(name):
                            docker.owned(name, token, docker_root)
                            docker.run('volume', 'rm', name)
                        require(not docker.exists(name), 'fixture_cleanup_volume_remains')
                    except Exception:
                        failures.append(name)
            try:
                if root is not None and not failures:
                    require(root.parent == BASE, 'fixture_cleanup_root_rejected')
                    trusted(root)
                    require(stat.S_IMODE(root.lstat().st_mode) == 0o700,
                            'fixture_cleanup_root_mode')
                    shutil.rmtree(root)
            finally:
                signal.setitimer(signal.ITIMER_REAL, 0)
                signal.signal(signal.SIGALRM, previous_alarm)
                os.umask(previous_umask)
            require(not failures, 'fixture_cleanup_failed_resources_retained')
            require(time.monotonic() - start < 90, 'fixture_total_deadline')


if __name__ == '__main__':
    unittest.main()
