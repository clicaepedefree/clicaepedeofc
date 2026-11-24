"""Offline lease protocol tests; fixture root metadata is mocked, no Docker/SSH."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import tempfile
import types
import unittest
from unittest import mock

spec = importlib.util.spec_from_file_location('latest_return_lease', Path(__file__).with_name('latest_return_lease.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
OWNER = 'kan133-restore-' + 'a' * 32


class LeaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.path = self.root / 'restore_lease.json'
        self.value = {'owner': OWNER, 'directory': str(self.root / 'restore-offsite-abcdefgh'),
                      'validator_directory': str(self.root / (OWNER + '-abcdefgh'))}
        self.path.write_text(json.dumps(self.value))
        self.backup = types.SimpleNamespace(ROOT=self.root,
            private_file=lambda p: open(p, encoding='utf8'), atomic_json=mock.Mock(side_effect=self.write))
        self.lease = m.Lease(self.backup, recovery_path=m.CANONICAL_RECOVERY, recovery_sha256='a' * 64)
        self.attest = mock.patch.object(self.lease, '_attest').start()
        self.addCleanup(mock.patch.stopall)
        real = Path.lstat
        def metadata(path, *args, **kwargs):
            info = real(path, *args, **kwargs)
            if path != self.root:
                return info
            return types.SimpleNamespace(st_mode=stat.S_IFDIR | 0o700, st_uid=0,
                                         st_nlink=info.st_nlink, st_size=info.st_size)
        mock.patch.object(Path, 'lstat', metadata).start()

    def write(self, path, value):
        path.write_text(json.dumps(value))

    def test_non_root_or_writable_fixture_is_rejected_before_mutation(self):
        original = Path.lstat
        for uid, mode in ((1000, 0o700), (0, 0o755)):
            def unsafe(path, *args, **kwargs):
                if path == self.root:
                    return types.SimpleNamespace(st_mode=stat.S_IFDIR | mode, st_uid=uid)
                return original(path, *args, **kwargs)
            with mock.patch.object(Path, 'lstat', unsafe), self.assertRaisesRegex(m.LeaseError, 'unsafe_root'):
                self.lease.enable(OWNER)
        self.backup.atomic_json.assert_not_called()

    def test_enable_is_explicit_durable_and_preserves_old_binding(self):
        with self.assertRaises(m.LeaseError):
            self.lease.assert_recoverable(OWNER)
        self.assertTrue(self.lease.enable(OWNER))
        self.assertTrue(self.lease.assert_recoverable(OWNER))
        saved = json.loads(self.path.read_text())
        self.assertEqual({k: saved[k] for k in self.value}, self.value)
        self.assertEqual(saved['resources'], [])
        self.assertEqual(saved['version'], 2)
        self.assertEqual(saved['schema'], m.SCHEMA)
        self.assertTrue(self.lease.enable(OWNER))
        self.assertEqual(self.backup.atomic_json.call_count, 1)

    def test_register_readback_precedes_true_and_original_names_are_idempotent(self):
        self.lease.enable(OWNER)
        name = OWNER + '-return-' + 'b' * 32
        self.assertTrue(self.lease.register(OWNER, 'volume', name))
        self.assertIn({'kind': 'volume', 'name': name}, json.loads(self.path.read_text())['resources'])
        self.assertTrue(self.lease.register(OWNER, 'volume', name))
        for role in m.ROLES:
            self.assertTrue(self.lease.register(OWNER, 'container', OWNER + '-' + role))
        self.assertEqual(self.backup.atomic_json.call_count, 2)

    def test_no_success_on_unpersisted_or_failed_write(self):
        self.backup.atomic_json.side_effect = None
        with self.assertRaises(m.LeaseError):
            self.lease.enable(OWNER)
        self.backup.atomic_json.side_effect = OSError('fixture')
        with self.assertRaises(OSError):
            self.lease.enable(OWNER)
        self.assertEqual(json.loads(self.path.read_text()), self.value)

    def test_owner_binding_and_unknown_schema_fail_without_write(self):
        for changes in ({'owner': 'foreign'}, {'schema': 'unknown'}, {'version': 2},
                        {'directory': '/tmp/restore-offsite-abcdefgh'}, {'extra': True}):
            with self.subTest(changes=changes):
                self.write(self.path, dict(self.value, **changes))
                with self.assertRaises(m.LeaseError):
                    self.lease.enable(OWNER)
                self.backup.atomic_json.assert_not_called()

    def test_resource_limits_and_names_match_recovery_schema(self):
        self.lease.enable(OWNER)
        for n in range(3):
            self.assertTrue(self.lease.register(OWNER, 'volume', OWNER + '-return-' + f'{n:032x}'))
        for n in range(12):
            self.assertTrue(self.lease.register(OWNER, 'container',
                'kan140-transfer-' + 'c' * 32 + '-' + f'{n:032x}'))
        saved = self.path.read_text()
        for kind, name in [('volume', OWNER + '-return-' + 'f' * 32),
                           ('container', 'kan140-transfer-' + 'd' * 32 + '-' + 'f' * 32),
                           ('network', OWNER + '-net'), ('volume', OWNER + '-postgres-data'),
                           ('container', OWNER + '-unknown'), ('volume', 'foreign')]:
            with self.subTest(kind=kind, name=name):
                with self.assertRaises(m.LeaseError):
                    self.lease.register(OWNER, kind, name)
                self.assertEqual(self.path.read_text(), saved)

    def test_every_operation_rechecks_source(self):
        self.lease.enable(OWNER)
        self.attest.side_effect = m.LeaseError('recovery_source_mismatch')
        for operation in (lambda: self.lease.enable(OWNER), lambda: self.lease.assert_recoverable(OWNER),
                          lambda: self.lease.register(OWNER, 'container', OWNER + '-postgres')):
            with self.assertRaises(m.LeaseError):
                operation()

    def test_same_owner_directory_replacement_rejected(self):
        self.lease.enable(OWNER)
        saved = json.loads(self.path.read_text())
        saved['directory'] = str(self.root / 'restore-offsite-12345678')
        self.write(self.path, saved)
        with self.assertRaises(m.LeaseError):
            self.lease.assert_recoverable(OWNER)

    def test_register_cannot_succeed_on_fake_atomic_writer(self):
        self.lease.enable(OWNER)
        self.backup.atomic_json.side_effect = None
        with self.assertRaises(m.LeaseError):
            self.lease.register(OWNER, 'volume', OWNER + '-return-' + 'b' * 32)
        self.assertEqual(json.loads(self.path.read_text())['resources'], [])

    def test_candidate_path_never_attests(self):
        candidate = m.Lease(self.backup, recovery_path=Path(__file__).with_name('latest_return_lease.py'),
                            recovery_sha256='a' * 64)
        with self.assertRaises(m.LeaseError):
            candidate.enable(OWNER)
        self.backup.atomic_json.assert_not_called()

    def test_direct_attestation_hash_and_root_only_chain(self):
        lease = m.Lease(self.backup, recovery_path=m.CANONICAL_RECOVERY,
                        recovery_sha256=hashlib.sha256(b'fixture-reviewed-source').hexdigest())
        info = types.SimpleNamespace(st_mode=stat.S_IFREG | 0o644, st_uid=0,
                                     st_nlink=1, st_size=23)
        with mock.patch.object(Path, 'resolve', lambda p: p), \
                mock.patch.object(Path, 'is_absolute', return_value=True), \
                mock.patch.object(lease, '_trusted') as trusted, \
                mock.patch.object(m.os, 'O_NOFOLLOW', 0, create=True), \
                mock.patch.object(m.os, 'open', return_value=123), \
                mock.patch.object(m.os, 'fdopen', mock.mock_open(read_data=b'fixture-reviewed-source')), \
                mock.patch.object(m.os, 'fstat', return_value=info):
            lease._attest()
            self.assertEqual(trusted.call_count, len(m.CANONICAL_RECOVERY.parents) + 1)
            lease.recovery_sha256 = '0' * 64
            with self.assertRaises(m.LeaseError):
                lease._attest()
            lease.recovery_sha256 = hashlib.sha256(b'fixture-reviewed-source').hexdigest()
            info.st_mode |= 0o020
            with self.assertRaises(m.LeaseError):
                lease._attest()

    def test_trusted_rejects_writable_foreign_linked_and_symlink_sources(self):
        path = mock.Mock()
        for mode, uid, links in [(stat.S_IFREG | 0o666, 0, 1),
                                 (stat.S_IFREG | 0o644, 1000, 1),
                                 (stat.S_IFREG | 0o644, 0, 2),
                                 (stat.S_IFLNK | 0o777, 0, 1)]:
            path.lstat.return_value = types.SimpleNamespace(st_mode=mode, st_uid=uid, st_nlink=links)
            with self.assertRaises(m.LeaseError):
                self.lease._trusted(path, directory=False)


if __name__ == '__main__':
    unittest.main()
