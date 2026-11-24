"""Offline contracts and Linux temporary-tree tests. Never execute Docker/SSH."""
from contextlib import contextmanager
import copy
import ctypes
import io
import json
import os
from pathlib import Path
import stat
import sys
import tarfile
import tempfile
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import rollback_freshness as freshness
import volume_transfer


LINUX = (sys.platform == 'linux' and hasattr(os, 'O_NOATIME') and
         hasattr(os, 'O_PATH') and os.open in os.supports_dir_fd and
         os.scandir in os.supports_fd)
ROOT = LINUX and os.geteuid() == 0


def receipt(byte=0):
    return {'digest': str(byte) * 64, 'entries': 2, 'bytes': byte}


def receipts():
    return tuple(receipt(i) for i in range(3))


class ReadOnlyDocker:
    def __init__(self, root='/var/lib/docker'):
        self.root, self.calls, self.deadlines = root, [], []
        self.change = None

    def execute(self, args, deadline):
        args = tuple(args)
        self.calls.append(args)
        self.deadlines.append(deadline)
        if args == ('info', '--format', '{{.DockerRootDir}}'):
            return (self.root + '\n').encode()
        if (len(args) == 3 and args[:2] == ('volume', 'inspect') and
                args[2] in freshness.VOLUMES.values()):
            name = args[2]
            row = {'Name': name, 'Driver': 'local', 'Scope': 'local',
                   'Options': None, 'Mountpoint': self.root + '/volumes/' + name + '/_data'}
            if self.change:
                self.change(row)
            return json.dumps([row]).encode()
        raise AssertionError('non-readonly-command')


@contextmanager
def fake_directory(*args, **kwargs):
    yield 7


class CallbackContracts(unittest.TestCase):
    def setUp(self):
        self.docker = ReadOnlyDocker()
        self.runtime = SimpleNamespace(VOLUMES=dict(freshness.VOLUMES))
        self.verifier = freshness.RollbackFreshness(self.docker, self.runtime)

    @contextmanager
    def collector(self, values=None):
        with patch.object(freshness, '_linux'), \
                patch.object(freshness.os, 'geteuid', return_value=0, create=True), \
                patch.object(freshness, '_absolute', fake_directory), \
                patch.object(freshness, '_child', fake_directory), \
                patch.object(freshness, '_manifest', side_effect=values or receipts()) as manifest:
            yield manifest

    def test_exact_fixed_commands_order_and_current_receipts(self):
        with self.collector() as manifest:
            result = self.verifier(list(receipts()))
        self.assertEqual(result, receipts())
        self.assertEqual(manifest.call_count, 3)
        self.assertEqual(self.docker.calls, [('info', '--format', '{{.DockerRootDir}}')] +
                         [('volume', 'inspect', freshness.VOLUMES[r]) for r in freshness.managed.ROLES])
        self.assertEqual(len(set(self.docker.deadlines)), 1)

    def test_every_invocation_recollects_stopped_then_written_data(self):
        with self.collector(list(receipts()) + [receipt(9), receipt(1), receipt(2)]) as manifest:
            self.verifier(receipts())
            with self.assertRaisesRegex(freshness.FreshnessError, '^freshness-mismatch$'):
                self.verifier(receipts())
        self.assertEqual(manifest.call_count, 6)

    def test_none_and_malformed_receipts_block_before_any_io(self):
        bad = [None, True, [], [receipt()], list(receipts()) + [receipt()],
               {'postgres': receipt()}, [True] * 3]
        for key, values in [('digest', [None, 'A' * 64, 'f' * 63, 'private-path']),
                            ('entries', [True, 0, -1, 50001, 1.0]),
                            ('bytes', [True, -1, 1024 ** 3 + 1, 0.0])]:
            for value in values:
                rows = list(receipts())
                rows[0][key] = value
                bad.append(rows)
        extra = list(receipts())
        extra[0]['private'] = 'not-evidence'
        bad.append(extra)
        for value in bad:
            with self.subTest(value=value):
                with self.assertRaisesRegex(freshness.FreshnessError, '^freshness-copy-unproven$'):
                    self.verifier(value)
        self.assertEqual(self.docker.calls, [])

    def test_mismatched_volume_runtime_blocks_before_io(self):
        self.runtime.VOLUMES['postgres'] = 'unapproved'
        with self.collector():
            with self.assertRaisesRegex(freshness.FreshnessError, '^freshness-volume-policy$'):
                self.verifier(receipts())
        self.assertEqual(self.docker.calls, [])

    def test_scope_driver_options_name_and_exact_mountpoint(self):
        cases = [('Scope', 'global'), ('Driver', 'nfs'), ('Name', 'other'),
                 ('Options', {'type': 'none'}), ('Options', []),
                 ('Mountpoint', '/private/elsewhere'),
                 ('Mountpoint', '/var/lib/docker/volumes/../_data'),
                 ('Mountpoint', '/var/lib/docker/volumes/kan140_qa_postgres_data/_data/')]
        for key, value in cases:
            with self.subTest(key=key, value=value), self.collector() as manifest:
                self.docker.change = lambda row: row.update({key: value})
                with self.assertRaisesRegex(freshness.FreshnessError, '^freshness-volume-policy$'):
                    self.verifier(receipts())
                manifest.assert_not_called()
        self.docker.change = lambda row: row.pop('Options')
        with self.collector():
            with self.assertRaises(freshness.FreshnessError):
                self.verifier(receipts())

    def test_root_required(self):
        with self.collector(), patch.object(freshness.os, 'geteuid', return_value=999):
            with self.assertRaisesRegex(freshness.FreshnessError, '^freshness-root-required$'):
                self.verifier(receipts())
        self.assertEqual(self.docker.calls, [])

    def test_deadline_shared_and_capped_by_coordinator(self):
        end = time.monotonic() + 5
        with self.collector() as manifest:
            self.verifier(receipts(), deadline=end)
        self.assertEqual(self.docker.deadlines, [end] * 4)
        self.assertTrue(all(call.args[1] == end for call in manifest.call_args_list))
        self.docker.deadlines.clear()
        start = time.monotonic()
        with self.collector():
            self.verifier(receipts(), deadline=start + 900)
        self.assertTrue(all(start < end <= time.monotonic() + 120
                            for end in self.docker.deadlines))

    def test_invalid_deadlines_and_timeout(self):
        for value in [True, 0, -1, float('nan'), float('inf'), '120', time.monotonic() - 1]:
            with self.subTest(value=value), self.collector():
                with self.assertRaises(freshness.FreshnessError):
                    self.verifier(receipts(), deadline=value)
        self.assertEqual(self.docker.calls, [])
        for value in [True, 0, -1, 121, float('nan'), float('inf'), '120']:
            with self.assertRaises(freshness.FreshnessError):
                freshness.RollbackFreshness(self.docker, self.runtime, timeout=value)

    def test_late_docker_response_blocks_and_errors_are_sanitized(self):
        with self.collector(), patch.object(self.docker, 'execute', side_effect=OSError('/private/path')):
            with self.assertRaisesRegex(freshness.FreshnessError, '^freshness-unavailable$'):
                self.verifier(receipts())
        with self.collector(), patch.object(freshness.time, 'monotonic', side_effect=[10, 10, 131]):
            with self.assertRaisesRegex(freshness.FreshnessError, '^freshness-deadline$'):
                self.verifier(receipts())

    def test_docker_output_is_bounded_and_typed(self):
        for output in [None, 'private', b'x' * (freshness.MAX_CONTROL + 1)]:
            with self.collector(), patch.object(self.docker, 'execute', return_value=output):
                with self.assertRaisesRegex(freshness.FreshnessError, '^freshness-docker-response$'):
                    self.verifier(receipts())

    def test_invalid_inspect_shapes_never_reach_filesystem_hash(self):
        for output in [b'private-invalid-json', b'{}', b'[]', b'[null]', b'[{},{}]']:
            original = self.docker.execute
            def execute(args, deadline):
                return output if args[:2] == ('volume', 'inspect') else original(args, deadline)
            with self.collector() as manifest, patch.object(self.docker, 'execute', side_effect=execute):
                with self.assertRaises(freshness.FreshnessError) as caught:
                    self.verifier(receipts())
                self.assertNotIn('private', str(caught.exception))
                manifest.assert_not_called()

    def test_snapshot_expected_receipts_before_transport_can_mutate_caller(self):
        expected = list(receipts())
        original = self.docker.execute
        def execute(args, deadline):
            expected[0]['digest'] = 'f' * 64
            return original(args, deadline)
        with self.collector(), patch.object(self.docker, 'execute', side_effect=execute):
            self.assertEqual(self.verifier(expected), receipts())

    @unittest.skipIf(LINUX, 'non-Linux fail-closed contract')
    def test_production_never_falls_back_on_other_platforms(self):
        with self.assertRaisesRegex(freshness.FreshnessError, '^freshness-linux-required$'):
            self.verifier(receipts())
        self.assertEqual(self.docker.calls, [])


def tar_evidence(root):
    """Independent synthetic TAR oracle; no OS tar command or extraction."""
    buffer = io.BytesIO()
    paths = [root] + sorted(root.rglob('*'))
    with tarfile.open(fileobj=buffer, mode='w', format=tarfile.GNU_FORMAT) as archive:
        for path in paths:
            info = path.stat()
            name = '.' if path == root else './' + path.relative_to(root).as_posix()
            member = tarfile.TarInfo(name)
            member.uid, member.gid = info.st_uid, info.st_gid
            member.mode = stat.S_IMODE(info.st_mode)
            member.type = tarfile.DIRTYPE if path.is_dir() else tarfile.REGTYPE
            payload = None if path.is_dir() else path.read_bytes()
            member.size = 0 if payload is None else len(payload)
            archive.addfile(member, None if payload is None else io.BytesIO(payload))
    return volume_transfer.tar_manifest(io.BytesIO(buffer.getvalue()), time.monotonic() + 10)


@unittest.skipUnless(LINUX, 'requires Linux no-follow dir_fd and mandatory O_NOATIME')
class FilesystemTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'sub').mkdir()
        (self.root / 'sub' / 'seed').write_bytes(b'fixture-v1')
        (self.root / 'empty').write_bytes(b'')

    def manifest(self, **kwargs):
        return freshness.filesystem_manifest(self.root, time.monotonic() + 10, **kwargs)

    def test_exact_tar_algorithm_including_metadata_empty_files_and_odd_names(self):
        (self.root / 'z\nname').write_bytes(b'last')
        (self.root / '\u00e9').write_bytes(b'utf8')
        os.chmod(self.root / 'sub', 0o2750)
        os.chmod(self.root / 'sub' / 'seed', 0o640)
        self.assertEqual(self.manifest(), tar_evidence(self.root))

    def test_two_scans_ignore_exhausted_original_directory_offset(self):
        expected = tar_evidence(self.root)
        fd = os.open(self.root, freshness._dir_flags())
        try:
            with os.scandir(fd) as iterator:
                list(iterator)
            # Both passes must use their own open description, even if this FD
            # has already reached EOF through scandir's shared-offset duplicate.
            self.assertEqual(freshness._manifest(fd, time.monotonic() + 10,
                                                freshness.MAX_BYTES,
                                                freshness.MAX_ENTRIES), expected)
            self.assertEqual(freshness._manifest(fd, time.monotonic() + 10,
                                                freshness.MAX_BYTES,
                                                freshness.MAX_ENTRIES), expected)
        finally:
            os.close(fd)

    def test_readonly_preserves_access_times_and_never_opens_for_writing(self):
        for path in [self.root, self.root / 'sub', self.root / 'sub' / 'seed', self.root / 'empty']:
            os.utime(path, ns=(1_000_000_000, 2_000_000_000))
        paths = [self.root, self.root / 'sub', self.root / 'sub' / 'seed', self.root / 'empty']
        before = {path: (path.stat().st_atime_ns, freshness._signature(path.stat())) for path in paths}
        original = os.open
        def readonly(path, flags, *args, **kwargs):
            self.assertFalse(flags & (os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_TRUNC | os.O_APPEND))
            self.assertTrue(flags & os.O_NOFOLLOW)
            if not flags & os.O_PATH:
                self.assertTrue(flags & os.O_NOATIME)
            return original(path, flags, *args, **kwargs)
        with patch.object(freshness.os, 'open', side_effect=readonly):
            # Capability detection references function identities, not wrappers.
            with patch.object(freshness, '_linux'):
                self.manifest()
        after = {path: (path.stat().st_atime_ns, freshness._signature(path.stat())) for path in paths}
        self.assertEqual(before, after)

    def test_byte_entry_and_policy_limits(self):
        for limits, code in [({'max_bytes': 1}, 'freshness-byte-limit'),
                             ({'max_entries': 2}, 'freshness-entry-limit'),
                             ({'max_bytes': 0}, 'freshness-policy'),
                             ({'max_bytes': 1024 ** 3 + 1}, 'freshness-policy'),
                             ({'max_entries': 50001}, 'freshness-policy'),
                             ({'max_entries': True}, 'freshness-policy')]:
            with self.subTest(limits=limits):
                with self.assertRaisesRegex(freshness.FreshnessError, '^' + code + '$'):
                    self.manifest(**limits)
        result = self.manifest(max_bytes=10, max_entries=4)
        self.assertEqual((result['bytes'], result['entries']), (10, 4))

    def test_symlinks_hardlinks_and_fifo_fail_without_opening_special_files(self):
        unsafe = self.root / 'unsafe'
        for create, code in [(lambda: unsafe.symlink_to('sub/seed'), 'freshness-type'),
                             (lambda: os.link(self.root / 'sub' / 'seed', unsafe), 'freshness-hardlink'),
                             (lambda: os.mkfifo(unsafe), 'freshness-type')]:
            create()
            try:
                with self.assertRaisesRegex(freshness.FreshnessError, '^' + code + '$'):
                    self.manifest()
            finally:
                unsafe.unlink()
    def test_noatime_unavailable_never_retries_with_access_time_writes(self):
        original = os.open
        denied = []
        def open_noatime(path, flags, *args, **kwargs):
            if flags & os.O_NOATIME:
                denied.append(path)
                raise PermissionError('/private/path')
            return original(path, flags, *args, **kwargs)
        with patch.object(freshness.os, 'open', side_effect=open_noatime), \
                patch.object(freshness, '_linux'):
            with self.assertRaisesRegex(freshness.FreshnessError, '^freshness-filesystem$'):
                self.manifest()
        self.assertEqual(len(denied), 1)

    def test_special_device_type_and_cross_device_entries_are_rejected(self):
        original = os.stat
        for mode, device, code in [(stat.S_IFCHR | 0o600, None, 'freshness-type'),
                                   (None, self.root.stat().st_dev + 1, 'freshness-device')]:
            def changed(path, *args, **kwargs):
                result = original(path, *args, **kwargs)
                if path == 'seed':
                    fields = {key: getattr(result, key) for key in
                              ('st_mode', 'st_uid', 'st_gid', 'st_nlink', 'st_dev')}
                    fields['st_mode'] = mode if mode is not None else result.st_mode
                    fields['st_dev'] = device if device is not None else result.st_dev
                    return SimpleNamespace(**fields)
                return result
            with patch.object(freshness.os, 'stat', side_effect=changed), patch.object(freshness, '_linux'):
                with self.assertRaisesRegex(freshness.FreshnessError, '^' + code + '$'):
                    self.manifest()

    def test_no_symlink_ancestor_or_dotdot_path(self):
        link = self.root / 'link'
        link.symlink_to('sub', target_is_directory=True)
        for path in [link, self.root / 'sub' / '..', self.root / 'sub' / '.' / '..']:
            with self.assertRaises(freshness.FreshnessError):
                freshness.filesystem_manifest(path, time.monotonic() + 5)

    def test_changed_file_during_read_even_when_size_and_mtime_restored(self):
        seed = self.root / 'sub' / 'seed'
        original_read, before = os.read, seed.stat()
        changed = False
        def read(fd, count):
            nonlocal changed
            value = original_read(fd, count)
            if value and not changed:
                changed = True
                seed.write_bytes(b'fixture-v2')
                os.utime(seed, ns=(before.st_atime_ns, before.st_mtime_ns))
            return value
        with patch.object(freshness.os, 'read', side_effect=read):
            with self.assertRaisesRegex(freshness.FreshnessError, '^freshness-changed$'):
                self.manifest()

    def test_second_pass_detects_file_changed_after_first_read(self):
        original_scan = freshness._scan
        calls = 0
        def scan(*args, **kwargs):
            nonlocal calls
            result = original_scan(*args, **kwargs)
            calls += 1
            if calls == 1:
                (self.root / 'sub' / 'seed').write_bytes(b'later-data')
            return result
        with patch.object(freshness, '_scan', side_effect=scan):
            with self.assertRaisesRegex(freshness.FreshnessError, '^freshness-changed$'):
                self.manifest()

    def test_add_delete_and_directory_replacement_during_scan_are_detected(self):
        original = freshness._scan
        target = self.root / 'sub' / 'seed'
        for action in ['add', 'delete', 'replace-directory']:
            calls = 0
            def scan(*args, **kwargs):
                nonlocal calls
                result = original(*args, **kwargs)
                calls += 1
                if calls == 1:
                    if action == 'add':
                        (self.root / 'added').write_bytes(b'new')
                    elif action == 'delete':
                        target.unlink()
                    else:
                        (self.root / 'sub').rename(self.root / 'moved')
                        (self.root / 'sub').mkdir()
                return result
            with self.subTest(action=action), patch.object(freshness, '_scan', side_effect=scan):
                with self.assertRaises(freshness.FreshnessError):
                    self.manifest()
            if action == 'add':
                (self.root / 'added').unlink()
            elif action == 'delete':
                target.write_bytes(b'fixture-v1')

    def test_file_replaced_between_lstat_and_open(self):
        original = os.open
        def replace(path, flags, *args, **kwargs):
            if path == 'seed':
                target = self.root / 'sub' / 'seed'
                target.unlink()
                target.write_bytes(b'replacement')
            return original(path, flags, *args, **kwargs)
        with patch.object(freshness.os, 'open', side_effect=replace), patch.object(freshness, '_linux'):
            with self.assertRaisesRegex(freshness.FreshnessError, '^freshness-changed$'):
                self.manifest()

    def test_path_length_bounded_using_descriptor_relative_deep_tree(self):
        fd = os.open(self.root, os.O_RDONLY | os.O_DIRECTORY)
        try:
            for _ in range(22):
                name = 'x' * 200
                os.mkdir(name, dir_fd=fd)
                child = os.open(name, os.O_RDONLY | os.O_DIRECTORY, dir_fd=fd)
                os.close(fd)
                fd = child
        finally:
            os.close(fd)
        with self.assertRaisesRegex(freshness.FreshnessError, '^freshness-name$'):
            self.manifest()

    def test_expired_deadline_and_in_read_timeout(self):
        with self.assertRaisesRegex(freshness.FreshnessError, '^freshness-deadline$'):
            freshness.filesystem_manifest(self.root, time.monotonic() - 1)
        original = os.read
        def read(fd, count):
            result = original(fd, count)
            if result:
                raise freshness.FreshnessError('freshness-deadline')
            return result
        with patch.object(freshness.os, 'read', side_effect=read):
            with self.assertRaisesRegex(freshness.FreshnessError, '^freshness-deadline$'):
                self.manifest()

@unittest.skipUnless(ROOT, 'requires Linux root for trusted Docker-root temporary fixture')
class NativeCollectorTests(unittest.TestCase):
    def setUp(self):
        # /tmp is intentionally NOT trusted: its ancestors are world-writable.
        self.temp = tempfile.TemporaryDirectory(prefix='kan140-freshness-test-', dir='/')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.docker = ReadOnlyDocker(str(self.root))
        self.runtime = SimpleNamespace(VOLUMES=dict(freshness.VOLUMES))
        self.verifier = freshness.RollbackFreshness(self.docker, self.runtime)
        self.data, self.expected = [], []
        for name in freshness.VOLUMES.values():
            data = self.root / 'volumes' / name / '_data'
            data.mkdir(parents=True)
            (data / 'seed').write_bytes(b'latest-current')
            os.chown(data, 999, 999)
            os.chown(data / 'seed', 999, 999)
            self.data.append(data)
            self.expected.append(tar_evidence(data))

    def test_actual_collector_accepts_nonroot_data_uid_and_second_call_rehashes(self):
        self.assertEqual(self.verifier(self.expected), tuple(self.expected))
        (self.data[0] / 'seed').write_bytes(b'written-after-stopping-again')
        with self.assertRaisesRegex(freshness.FreshnessError, '^freshness-mismatch$'):
            self.verifier(self.expected)

    def test_untrusted_parent_permissions_or_owner_rejected(self):
        for path in [self.root, self.root / 'volumes', self.data[0].parent]:
            before = path.stat()
            try:
                os.chmod(path, 0o770)
                with self.assertRaisesRegex(freshness.FreshnessError, '^freshness-untrusted-root$'):
                    self.verifier(self.expected)
                os.chmod(path, stat.S_IMODE(before.st_mode))
                os.chown(path, 999, 999)
                with self.assertRaisesRegex(freshness.FreshnessError, '^freshness-untrusted-root$'):
                    self.verifier(self.expected)
            finally:
                os.chown(path, before.st_uid, before.st_gid)
                os.chmod(path, stat.S_IMODE(before.st_mode))

    def test_missing_daemon_path_and_symlinked_data_never_fall_back(self):
        self.docker.root = str(self.root / 'unavailable')
        with self.assertRaisesRegex(freshness.FreshnessError, '^freshness-unavailable$'):
            self.verifier(self.expected)
        self.docker.root = str(self.root)
        data = self.data[0]
        data.rename(data.with_name('moved'))
        data.symlink_to('moved', target_is_directory=True)
        with self.assertRaisesRegex(freshness.FreshnessError, '^freshness-type$'):
            self.verifier(self.expected)

    def test_symlinked_docker_root_or_name_parent_fails_closed(self):
        alias = self.root / 'alias'
        alias.symlink_to('volumes', target_is_directory=True)
        self.docker.root = str(alias)
        with self.assertRaisesRegex(freshness.FreshnessError, '^freshness-type$'):
            self.verifier(self.expected)
        self.docker.root = str(self.root)
        parent = self.data[0].parent
        parent.rename(parent.with_name('moved'))
        parent.symlink_to('moved', target_is_directory=True)
        with self.assertRaisesRegex(freshness.FreshnessError, '^freshness-type$'):
            self.verifier(self.expected)

    def test_root_path_normalization_is_never_silent(self):
        for suffix in ['/', '/..', '/.', '//volumes', '\n/private', '\x00private']:
            self.docker.root = str(self.root) + suffix
            with self.assertRaisesRegex(freshness.FreshnessError, '^freshness-root-path$'):
                self.verifier(self.expected)


class TargetDocker(ReadOnlyDocker):
    def __init__(self, root='/var/lib/docker'):
        super().__init__(root)
        self.extra = {}

    def execute(self, args, deadline):
        if args == ('info', '--format', '{{.DockerRootDir}}'):
            return super().execute(args, deadline)
        args = tuple(args)
        self.calls.append(args)
        self.deadlines.append(deadline)
        if args[:2] == ('volume', 'inspect') and args[2] in freshness.TARGET_VOLUMES.values():
            name = args[2]
            row = {'Name': name, 'Driver': 'local', 'Scope': 'local', 'Options': None,
                   'Mountpoint': self.root + '/volumes/' + name + '/_data',
                   'CreatedAt': '2026-11-24T12:00:00Z',
                   'Labels': {volume_transfer.OWNER_LABEL: 'a' * 32,
                              volume_transfer.PHASE_LABEL: 'rollback'}, **self.extra}
            if self.change:
                self.change(row)
            return json.dumps([row]).encode()
        raise AssertionError('non-readonly-command')


def target_identity():
    return {'device': 123, 'inode': 456, 'birth_ns': 123456789000000001}


class TargetContracts(unittest.TestCase):
    def setUp(self):
        self.docker = TargetDocker()
        self.runtime = SimpleNamespace(SWARM_VOLUMES=dict(freshness.TARGET_VOLUMES))
        self.targets = freshness.RollbackTargets(self.docker, self.runtime)

    @contextmanager
    def collector(self, manifests=None, identity=None):
        @contextmanager
        def data(*args, **kwargs):
            yield 8, dict(identity or target_identity())
        with patch.object(freshness, '_linux'), \
                patch.object(freshness.os, 'geteuid', return_value=0, create=True), \
                patch.object(freshness, '_absolute', fake_directory), \
                patch.object(freshness, '_child', fake_directory), \
                patch.object(freshness, '_target_data', side_effect=data), \
                patch.object(freshness, '_manifest', side_effect=manifests or receipts()) as manifest:
            yield manifest

    def pins(self):
        with self.collector():
            return self.targets.capture(receipts())

    def test_capture_proves_copy_and_pins_json_safe_identity_in_role_order(self):
        with self.collector() as manifest:
            pins = self.targets.capture(list(receipts()))
        self.assertEqual(len(pins), 3)
        self.assertEqual(manifest.call_count, 3)
        self.assertEqual([p['name'] for p in pins], list(freshness.TARGET_VOLUMES.values()))
        self.assertEqual(freshness._target_pins(json.loads(json.dumps(pins))), pins)
        self.assertNotIn('/var/lib/docker', json.dumps(pins))
        self.assertEqual(self.docker.calls, [('info', '--format', '{{.DockerRootDir}}')] +
                         [command for name in freshness.TARGET_VOLUMES.values()
                          for command in [('volume', 'inspect', name)] * 2])

    def test_verify_metadata_only_allows_children_to_change(self):
        pins = self.pins()
        with self.collector() as manifest:
            self.assertIs(self.targets.verify(pins), True)
            manifest.assert_not_called()

    def test_dynamic_usage_and_unknown_metadata_do_not_change_identity(self):
        self.docker.extra = {'UsageData': {'RefCount': 0, 'Size': 123}, 'future': 'before'}
        pins = self.pins()
        self.docker.extra = {'UsageData': {'RefCount': 3, 'Size': 456}, 'future': 'after'}
        with self.collector() as manifest:
            self.assertIs(self.targets.verify(pins), True)
            manifest.assert_not_called()

    def test_capture_rejects_current_target_not_equal_to_copy(self):
        with self.collector([receipt(9), receipt(1), receipt(2)]):
            with self.assertRaisesRegex(freshness.FreshnessError, '^freshness-target-mismatch$'):
                self.targets.capture(receipts())

    def test_replacement_even_same_inode_same_createdat_and_labels_rejected_by_birth(self):
        pins = self.pins()
        for field in ('device', 'inode', 'birth_ns'):
            changed = target_identity()
            changed[field] += 1
            with self.subTest(field=field), self.collector(identity=changed):
                with self.assertRaisesRegex(freshness.FreshnessError, '^freshness-target-changed$'):
                    self.targets.verify(pins)

    def test_createdat_exact_string_and_owner_changes_reject(self):
        pins = self.pins()
        changes = [lambda row: row.update(CreatedAt='2026-11-24T12:00:00+00:00'),
                   lambda row: row['Labels'].update({volume_transfer.OWNER_LABEL: 'b' * 32}),
                   lambda row: row.update(Options={})]
        for change in changes:
            with self.collector():
                self.docker.change = change
                with self.assertRaisesRegex(freshness.FreshnessError, '^freshness-target-changed$'):
                    self.targets.verify(pins)

    def test_target_metadata_policy_is_exact(self):
        changes = [lambda row: row.update(Name='other'), lambda row: row.update(Driver='nfs'),
                   lambda row: row.update(Scope='global'), lambda row: row.update(Options={'type': 'none'}),
                   lambda row: row.update(Mountpoint='/private/elsewhere'),
                   lambda row: row.pop('CreatedAt'), lambda row: row.update(CreatedAt=''),
                   lambda row: row.update(CreatedAt=123), lambda row: row.update(Labels=None),
                   lambda row: row['Labels'].update({'unexpected': 'label'}),
                   lambda row: row['Labels'].update({volume_transfer.PHASE_LABEL: 'cutover'}),
                   lambda row: row['Labels'].update({volume_transfer.OWNER_LABEL: 'A' * 32}),
                   lambda row: row['Labels'].update({volume_transfer.OWNER_LABEL: 'a' * 31})]
        for change in changes:
            self.docker.change = change
            with self.collector() as manifest:
                with self.assertRaisesRegex(freshness.FreshnessError, '^freshness-target-policy$'):
                    self.targets.capture(receipts())
                manifest.assert_not_called()

    def test_metadata_rechecked_after_descriptor_operations(self):
        counter = 0
        def change(row):
            nonlocal counter
            counter += 1
            if counter == 2:
                row['CreatedAt'] = '2026-11-24T12:00:01Z'
        self.docker.change = change
        with self.collector():
            with self.assertRaisesRegex(freshness.FreshnessError, '^freshness-target-changed$'):
                self.targets.capture(receipts())

    def test_pin_schema_typed_exact_and_never_used_for_io(self):
        pins = self.pins()
        self.docker.calls.clear()
        invalid = [None, [], True, list(pins[:2]), list(pins) + [pins[0]]]
        for key, values in [('schema', [True, 2, 1.0]), ('name', ['/private', 'wrong']),
                            ('metadata_digest', ['g' * 64, None]), ('device', [True, -1, 2 ** 64]),
                            ('inode', [False, 0, -1, 1.0]), ('birth_ns', [0, -1, True, 1.0])]:
            for value in values:
                bad = copy.deepcopy(pins)
                bad[0][key] = value
                invalid.append(bad)
        bad = copy.deepcopy(pins)
        bad[0]['root_path'] = '/private'
        invalid.append(bad)
        for value in invalid:
            with self.subTest(value=value):
                with self.assertRaisesRegex(freshness.FreshnessError, '^freshness-target-unproven$'):
                    self.targets.verify(value)
        self.assertEqual(self.docker.calls, [])

    def test_unproven_copy_blocks_capture_before_io(self):
        with self.assertRaisesRegex(freshness.FreshnessError, '^freshness-copy-unproven$'):
            self.targets.capture(None)
        self.assertEqual(self.docker.calls, [])

    def test_runtime_guard_root_and_deadline_shared(self):
        end = time.monotonic() + 5
        with self.collector() as manifest:
            pins = self.targets.capture(receipts(), deadline=end)
        self.assertEqual(self.docker.deadlines, [end] * 7)
        self.assertTrue(all(call.args[1] == end for call in manifest.call_args_list))
        with self.collector():
            self.assertTrue(self.targets.verify(pins, deadline=end))
        self.runtime.SWARM_VOLUMES['postgres'] = 'other'
        with self.collector():
            with self.assertRaisesRegex(freshness.FreshnessError, '^freshness-target-policy$'):
                self.targets.verify(pins)

    def test_deadline_invalid_and_unavailable_sanitized(self):
        pins = self.pins()
        for value in [True, -1, float('nan'), float('inf'), time.monotonic() - 1]:
            with self.collector():
                with self.assertRaisesRegex(freshness.FreshnessError, '^freshness-deadline$'):
                    self.targets.verify(pins, deadline=value)
        with self.collector(), patch.object(self.docker, 'execute', side_effect=OSError('/private')):
            with self.assertRaisesRegex(freshness.FreshnessError, '^freshness-target-unavailable$'):
                self.targets.verify(pins)


class StatxContracts(unittest.TestCase):
    def test_stable_uapi_offsets(self):
        self.assertEqual(ctypes.sizeof(freshness._StatxTimestamp), 16)
        self.assertEqual(ctypes.sizeof(freshness._Statx), 256)
        self.assertEqual(freshness._Statx.ino.offset, 32)
        self.assertEqual(freshness._Statx.btime.offset, 80)
        self.assertEqual(freshness._Statx.dev_major.offset, 136)

    def statx(self, *, mask=0x0fff, sec=123, nsec=1, status=0, inode=456):
        def function(fd, path, flags, requested, pointer):
            self.assertEqual((fd, path, flags, requested), (7, b'', 0x1000, 0x0fff))
            result = pointer._obj
            result.mask, result.mode, result.ino = mask, stat.S_IFDIR | 0o700, inode
            result.dev_major, result.dev_minor = 1, 2
            result.btime.sec, result.btime.nsec = sec, nsec
            return status
        return function

    @contextmanager
    def native(self, function):
        info = SimpleNamespace(st_dev=123, st_ino=456, st_mode=stat.S_IFDIR | 0o700)
        with patch.object(freshness, '_libc_statx', return_value=function), \
                patch.object(freshness.os, 'fstat', return_value=info), \
                patch.object(freshness.os, 'major', return_value=1, create=True), \
                patch.object(freshness.os, 'minor', return_value=2, create=True):
            yield

    def test_empty_path_mandatory_btime_identity(self):
        with self.native(self.statx()):
            self.assertEqual(freshness._birth_identity(7, time.monotonic() + 5),
                             {'device': 123, 'inode': 456, 'birth_ns': 123000000001})

    def test_no_mask_zero_birth_invalid_nsec_or_failed_syscall_blocks(self):
        for kwargs in [dict(mask=0x07ff), dict(sec=0, nsec=0), dict(sec=-1),
                       dict(nsec=1_000_000_000), dict(status=-1)]:
            with self.subTest(kwargs=kwargs), self.native(self.statx(**kwargs)):
                with self.assertRaisesRegex(freshness.FreshnessError,
                                            '^freshness-target-btime-unavailable$'):
                    freshness._birth_identity(7, time.monotonic() + 5)

    def test_statx_and_fstat_disagreement_blocks(self):
        with self.native(self.statx(inode=457)):
            with self.assertRaisesRegex(freshness.FreshnessError, '^freshness-target-changed$'):
                freshness._birth_identity(7, time.monotonic() + 5)

    def test_absent_libc_symbol_fails_without_fallback(self):
        with patch.object(freshness.ctypes, 'CDLL', return_value=SimpleNamespace()):
            with self.assertRaisesRegex(freshness.FreshnessError,
                                        '^freshness-target-btime-unavailable$'):
                freshness._libc_statx()


@unittest.skipUnless(LINUX, 'requires Linux descriptor statx birth times')
class TargetFilesystemTests(unittest.TestCase):
    def test_real_statx_identity_survives_child_writes_chmod_and_chown(self):
        with tempfile.TemporaryDirectory() as temp:
            data = Path(temp) / '_data'
            data.mkdir()
            parent = os.open(temp, os.O_RDONLY | os.O_DIRECTORY)
            try:
                with freshness._target_data(parent, time.monotonic() + 10) as (_, identity):
                    (data / 'new').write_bytes(b'legitimate')
                    os.chmod(data, 0o750)
                    if ROOT:
                        os.chown(data, 999, 999)
                with freshness._target_data(parent, time.monotonic() + 10) as (_, after):
                    self.assertEqual(identity, after)
            finally:
                os.close(parent)

    def test_replacement_name_binding_and_missing_btime_reject(self):
        with tempfile.TemporaryDirectory() as temp:
            data = Path(temp) / '_data'
            data.mkdir()
            parent = os.open(temp, os.O_RDONLY | os.O_DIRECTORY)
            try:
                with self.assertRaisesRegex(freshness.FreshnessError, '^freshness-target-changed$'):
                    with freshness._target_data(parent, time.monotonic() + 10):
                        data.rename(data.with_name('old'))
                        data.mkdir()
                with patch.object(freshness, '_libc_statx', return_value=lambda *args: -1):
                    with self.assertRaisesRegex(freshness.FreshnessError,
                                                '^freshness-target-btime-unavailable$'):
                        with freshness._target_data(parent, time.monotonic() + 10):
                            self.fail('missing birth time accepted')
            finally:
                os.close(parent)


@unittest.skipUnless(ROOT, 'requires Linux root for trusted rollback target fixture')
class NativeTargetTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='kan140-target-test-', dir='/')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.docker = TargetDocker(str(self.root))
        self.targets = freshness.RollbackTargets(self.docker,
                        SimpleNamespace(SWARM_VOLUMES=dict(freshness.TARGET_VOLUMES)))
        self.data, self.expected = [], []
        for name in freshness.TARGET_VOLUMES.values():
            data = self.root / 'volumes' / name / '_data'
            data.mkdir(parents=True)
            (data / 'seed').write_bytes(b'OLD')
            os.chown(data, 999, 999)
            self.data.append(data)
            self.expected.append(tar_evidence(data))

    def test_capture_then_active_writes_then_recreation(self):
        pins = self.targets.capture(self.expected)
        for data in self.data:
            (data / 'seed').write_bytes(b'NEW')
            (data / 'new').write_bytes(b'active')
            os.chmod(data, 0o750)
            os.chown(data, 998, 998)
        with patch.object(freshness, '_manifest', side_effect=AssertionError('must-not-hash')):
            self.assertIs(self.targets.verify(pins), True)
        data = self.data[0]
        data.rename(data.with_name('old'))
        data.mkdir()
        with self.assertRaisesRegex(freshness.FreshnessError, '^freshness-target-changed$'):
            self.targets.verify(pins)


if __name__ == '__main__':
    unittest.main()
