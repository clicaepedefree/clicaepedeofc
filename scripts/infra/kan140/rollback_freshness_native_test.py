"""Opt-in source freshness and rollback target continuity on disposable CI.

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
    def __init__(self, config, labels, end):
        self.prefix = ['docker', '--host', 'unix:///var/run/docker.sock',
                       '--config', str(config)]
        self.labels, self.end = labels, end
        self.names = tuple(labels)

    def run(self, *args):
        return command(self.prefix + list(args), self.end)

    def exists(self, name):
        require(name in self.names, 'fixture_unmanaged_name')
        rows = self.run('volume', 'ls', '--filter', 'name=^' + name + '$',
                        '--format', '{{.Name}}').decode('ascii').splitlines()
        require(rows in ([], [name]), 'fixture_name_collision')
        return bool(rows)

    def owned(self, name, docker_root):
        require(name in self.names, 'fixture_unmanaged_name')
        rows = json.loads(self.run('volume', 'inspect', name))
        require(type(rows) is list and len(rows) == 1, 'fixture_inspect_shape')
        row = rows[0]
        path = docker_root / 'volumes' / name / '_data'
        require(row.get('Name') == name and row.get('Driver') == 'local' and
                row.get('Scope') == 'local' and row.get('Options') in (None, {}) and
                row.get('Labels') == self.labels[name] and
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
        sources = tuple(freshness.VOLUMES.values())
        targets = tuple(runtime.SWARM_VOLUMES[role] for role in freshness.VOLUMES)
        names = sources + targets
        self.assertEqual(len(set(names)), 6)
        trusted(BASE)
        self.assertEqual(stat.S_IMODE(BASE.lstat().st_mode), 0o700)
        require(shutil.rmtree.avoids_symlink_attacks, 'fixture_safe_rmtree_required')
        start = time.monotonic()
        work_end, cleanup_end = start + 55, start + 88
        previous_umask = os.umask(0o077)
        root = None
        docker = None
        intended = []
        attempts = []
        token = uuid.uuid4().hex
        labels = {name: {LABEL: token} for name in sources}
        labels.update({name: {volume_transfer.OWNER_LABEL: token,
                              volume_transfer.PHASE_LABEL: 'rollback'} for name in targets})
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
            docker = PreparationDocker(root, labels, work_end)
            raw_root = docker.run('info', '--format', '{{.DockerRootDir}}').decode('utf-8')
            require(raw_root.endswith('\n') and raw_root.count('\n') == 1 and
                    '\r' not in raw_root, 'fixture_invalid_docker_root')
            docker_root = Path(raw_root[:-1])
            trusted(docker_root)
            trusted(docker_root / 'volumes')
            self.assertIn(b'GNU tar', command(['tar', '--version'], work_end))

            # Evaluate ALL names before ANY create; a collision never enters intent.
            existing = [docker.exists(name) for name in names]
            self.assertEqual(existing, [False] * 6, 'fixture_managed_name_exists')

            def create_seeded(name):
                require(not docker.exists(name), 'fixture_name_appeared_before_create')
                if name not in intended:
                    intended.append(name)
                attempts.append(name)  # Record even a timeout/unknown create exit.
                with (root / 'create-intent.json').open('w', encoding='ascii') as journal:
                    json.dump({'token': token, 'names': intended, 'attempts': attempts,
                               'labels': labels}, journal)
                    journal.flush()
                    os.fsync(journal.fileno())
                label_args = [arg for key, value in labels[name].items()
                              for arg in ('--label', key + '=' + value)]
                self.assertEqual(docker.run('volume', 'create', '--driver', 'local',
                                           *label_args, name).strip(),
                                 name.encode('ascii'))
                path = docker.owned(name, docker_root)
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
                return path

            all_paths = [create_seeded(name) for name in names]
            paths, target_paths = all_paths[:3], all_paths[3:]

            expected = tuple(volume_transfer.tar_manifest(io.BytesIO(command(
                ['tar', '--format=gnu', '-C', str(path), '-cf', '-', '.'], work_end)),
                work_end) for path in paths)
            self.assertTrue(all(row['entries'] == 2 and row['bytes'] == len(OLD)
                                for row in expected))
            target_expected = tuple(volume_transfer.tar_manifest(io.BytesIO(command(
                ['tar', '--format=gnu', '-C', str(path), '-cf', '-', '.'], work_end)),
                work_end) for path in target_paths)
            self.assertEqual(target_expected, expected)
            readonly = ReadOnlyDocker(volume_transfer.DockerProcess(root), names)
            collector = freshness.RollbackFreshness(readonly, runtime, timeout=45)
            saved = copy.deepcopy(expected)
            before = snapshot(paths)
            self.assertEqual(collector(expected, deadline=work_end), expected)
            self.assertEqual(snapshot(paths), before, 'fixture_collector_wrote_data')
            allowed_call = [('info', '--format', '{{.DockerRootDir}}')] + [
                ('volume', 'inspect', name) for name in sources]
            self.assertEqual(readonly.calls, allowed_call)

            # Equal-length bytes make this a content proof, not a size-only check.
            self.assertEqual(len(OLD), len(NEW))
            docker.owned(sources[0], docker_root)
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

            # Target continuity is independent of source freshness and uses its
            # own audited transport. Capture must prove the original copied bytes.
            target_readonly = ReadOnlyDocker(volume_transfer.DockerProcess(root), names)
            continuity = freshness.RollbackTargets(target_readonly, runtime, timeout=45)
            before_capture = snapshot(all_paths)
            pins = continuity.capture(expected, deadline=work_end)
            self.assertIs(type(pins), tuple)
            self.assertEqual(len(pins), 3)
            original_pins = copy.deepcopy(pins)
            self.assertEqual(snapshot(all_paths), before_capture, 'fixture_capture_wrote_data')
            self.assertIs(continuity.verify(pins, deadline=work_end), True)
            self.assertEqual(snapshot(all_paths), before_capture, 'fixture_verify_wrote_data')

            docker.owned(targets[0], docker_root)
            fd = os.open(target_paths[0] / MARKER, os.O_WRONLY | os.O_NOFOLLOW)
            with os.fdopen(fd, 'wb') as output:
                output.write(NEW)
            after_child_write = snapshot(all_paths)
            self.assertIs(continuity.verify(pins, deadline=work_end), True)
            self.assertEqual(snapshot(all_paths), after_child_write,
                             'fixture_continuity_repaired_legitimate_write')
            self.assertEqual(after_child_write[str(target_paths[0] / MARKER) + ':bytes'], NEW)

            # No delay or altered labels: inode reuse and Docker CreatedAt's
            # second precision must not let a same-name replacement retain pins.
            docker.owned(targets[0], docker_root)
            docker.run('volume', 'rm', targets[0])
            self.assertFalse(docker.exists(targets[0]), 'fixture_target_remove_failed')
            target_paths[0] = create_seeded(targets[0])
            all_paths = paths + target_paths
            replacement_receipt = volume_transfer.tar_manifest(io.BytesIO(command(
                ['tar', '--format=gnu', '-C', str(target_paths[0]), '-cf', '-', '.'], work_end)),
                work_end)
            self.assertEqual(replacement_receipt, expected[0])
            before_rejection = snapshot(all_paths)
            with self.assertRaises(freshness.FreshnessError):
                continuity.verify(pins, deadline=work_end)
            self.assertEqual(snapshot(all_paths), before_rejection,
                             'fixture_continuity_changed_replacement')
            replacement_pins = continuity.capture(expected, deadline=work_end)
            self.assertNotEqual(replacement_pins, original_pins)
            self.assertIs(continuity.verify(replacement_pins, deadline=work_end), True)
            self.assertEqual(snapshot(all_paths), before_rejection,
                             'fixture_replacement_capture_wrote_data')
            self.assertEqual(pins, original_pins, 'fixture_target_pins_mutated')
            self.assertEqual(expected, saved, 'fixture_target_receipt_mutated')
            inspected = {args[2] for args in target_readonly.calls
                         if args[:2] == ('volume', 'inspect')}
            self.assertEqual(inspected, set(targets))
            self.assertTrue(target_readonly.calls)
            self.assertEqual(readonly.calls, allowed_call * 2)
        finally:
            if docker is not None:
                docker.end = cleanup_end
                for name in reversed(intended):
                    try:
                        if docker.exists(name):
                            docker.owned(name, docker_root)
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
