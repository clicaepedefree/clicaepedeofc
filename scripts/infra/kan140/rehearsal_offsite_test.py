import hashlib
import contextlib
import json
from pathlib import Path
import stat
import sys
from types import SimpleNamespace
import unittest
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import rehearsal_offsite as r


class OffsiteRehearsalTests(unittest.TestCase):
    def good_result(self):
        return {'status': 'pass', 'gate': 'isolated-full-restore', 'cleanup_verified': True,
                'evidence': {'backend': 'compose', 'production_migration': False,
                             'postgres': {'tables': 1, 'rows': 2},
                             'evolution': {'instances': 1, 'sessions': 1},
                             'isolated': True, 'redis_aof_restart_verified': True,
                             'compose_restart_verified': True,
                             'session_volume_restart_verified': True,
                             'evolution_dependencies': {'verified': True},
                             'evolution_dependencies_after_restart': {'verified': True},
                             'postgres_data_snapshot': {'policy': 'pg17-record-row-sha256-v2'}}}

    def path(self):
        value = mock.Mock()
        value.resolve.return_value = value
        value.stat.return_value = SimpleNamespace(st_mode=stat.S_IFREG | 0o600, st_uid=0, st_nlink=1)
        parent = mock.Mock()
        parent.stat.return_value = SimpleNamespace(st_mode=stat.S_IFDIR | 0o700, st_uid=0)
        value.parents = [parent]
        value.read_bytes.return_value = b'fixture-source'
        return value

    def test_trusted_source_requires_exact_digest(self):
        path = self.path()
        r.trusted(path, hashlib.sha256(b'fixture-source').hexdigest())
        with self.assertRaises(ValueError):
            r.trusted(path, '0' * 64)

    def test_untrusted_ownership_links_permissions_and_parent_reject(self):
        for mutation in ('symlink', 'uid', 'mode', 'links', 'parent'):
            path = self.path()
            if mutation == 'symlink':
                path.resolve.return_value = object()
            elif mutation == 'uid':
                path.stat.return_value.st_uid = 1000
            elif mutation == 'mode':
                path.stat.return_value.st_mode |= 0o044
            elif mutation == 'links':
                path.stat.return_value.st_nlink = 2
            else:
                path.parents[0].stat.return_value.st_mode |= 0o020
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                r.trusted(path)

    def test_disabled_runner_rejects_before_loading_any_remote_code(self):
        with mock.patch.dict(r.os.environ, {'KAN140_COMPOSE_REHEARSAL': 'false'}), \
                mock.patch.object(r, 'trusted') as trusted, self.assertRaises(ValueError):
            r.main()
        trusted.assert_not_called()

    def test_finish_preserves_official_receipt_and_only_releases_clean_lease(self):
        for clean in (True, False):
            backup = SimpleNamespace(ROOT=Path('/fixture'), require=lambda value: self.assertTrue(value),
                                     sync_dir=mock.Mock(), atomic_json=mock.Mock())
            root, lease = mock.Mock(), mock.Mock()
            root.exists.return_value = False
            result = self.good_result() if clean else {'status': 'fail', 'cleanup_verified': False}
            with mock.patch.multiple(r, BOUND_BACKUP=backup, ATTEMPT='fixture-attempt'), mock.patch('builtins.print') as printed:
                self.assertEqual(r.finish(root, lease, result, r.time.monotonic()), 0 if clean else 1)
            self.assertEqual(lease.unlink.call_count, 1 if clean else 0)
            self.assertEqual(backup.atomic_json.call_args.args[0], Path('/fixture/last_compose_rehearsal.json'))
            output = json.loads(printed.call_args.args[0])
            self.assertEqual(output['backend'], 'compose-rehearsal')
            self.assertFalse(output['production_cutover'])

    def test_plaintext_cleanup_is_required_before_releasing_lease(self):
        def require(value):
            if not value:
                raise ValueError('fixture-rejected')
        backup = SimpleNamespace(require=require)
        root, lease = mock.Mock(), mock.Mock()
        root.exists.return_value = True
        with mock.patch.object(r, 'BOUND_BACKUP', backup), self.assertRaises(ValueError):
            r.finish(root, lease, {'cleanup_verified': True}, 0)
        lease.unlink.assert_not_called()

    def test_cached_modules_reject_even_if_file_was_verified(self):
        with mock.patch.object(r, 'trusted'), mock.patch.dict(sys.modules, {'fixture_cached': object()}), \
                self.assertRaisesRegex(ValueError, 'cached-module-rejected'):
            r.verified_module('fixture_cached', Path('/fixture/module.py'))

    def test_contradictory_pass_never_releases_lease_or_exits_success(self):
        backup = SimpleNamespace(ROOT=Path('/fixture'), require=lambda value: self.assertTrue(value),
                                 sync_dir=mock.Mock(), atomic_json=mock.Mock())
        root, lease = mock.Mock(), mock.Mock()
        root.exists.return_value = False
        result = self.good_result()
        result['cleanup_verified'] = False
        with mock.patch.multiple(r, BOUND_BACKUP=backup, ATTEMPT='fixture-attempt'), mock.patch('builtins.print'):
            self.assertEqual(r.finish(root, lease, result, r.time.monotonic()), 1)
        lease.unlink.assert_not_called()
        self.assertEqual(backup.atomic_json.call_args.args[1]['status'], 'fail')

    def test_unknown_fields_and_truthy_cleanup_do_not_get_printed(self):
        for change in ({'unreviewed_private_field': 'fixture-private'}, {'cleanup_verified': 1}):
            result = dict(self.good_result(), **change)
            with self.subTest(change=change), self.assertRaises(ValueError):
                r.public_result(result)

    def test_failure_diagnostics_never_expose_unknown_strings(self):
        result = r.public_result({'status': 'fail', 'cleanup_verified': False,
                                  'gate': 'fixture-private-detail', 'stage': 'fixture-private-stage'})
        self.assertEqual(result['stage'], 'unreported')
        self.assertEqual(result['reason'], 'unclassified-validation-failure')
        self.assertNotIn('fixture-private', json.dumps(result))

    def test_persistence_failure_cannot_release_lease_or_leave_new_pass(self):
        backup = SimpleNamespace(ROOT=Path('/fixture'), require=lambda value: self.assertTrue(value),
                                 sync_dir=mock.Mock(), atomic_json=mock.Mock(side_effect=OSError('fixture')))
        root, lease = mock.Mock(), mock.Mock()
        root.exists.return_value = False
        with mock.patch.multiple(r, BOUND_BACKUP=backup, ATTEMPT='fixture-attempt'), self.assertRaises(OSError):
            r.finish(root, lease, self.good_result(), r.time.monotonic())
        lease.unlink.assert_not_called()
        self.assertEqual(backup.atomic_json.call_args.args[1]['status'], 'finalizing')

    def test_enabled_main_binds_modules_injects_constructor_and_preserves_official_receipt(self):
        runtime = object()
        backup = SimpleNamespace(ROOT=Path('/fixture'), runtime=runtime,
                                 require=lambda value: self.assertTrue(value),
                                 locked=lambda root: contextlib.nullcontext(), atomic_json=mock.Mock())
        original = object()
        restore = SimpleNamespace(Validator=original)
        constructor = object()
        adapter = SimpleNamespace(ComposeValidator=constructor)
        wrapper = SimpleNamespace(restore=restore, backup=backup)
        def invoke():
            self.assertIs(restore.Validator, constructor)
            self.assertIs(wrapper.finish, r.finish)
            raise RuntimeError('fixture-private-error')
        wrapper.main = invoke
        modules = {'runtime': runtime, 'backup': backup, 'restore': restore,
                   'kan140_compose_adapter': adapter, 'kan140_offsite_canonical': wrapper}
        with mock.patch.object(r, 'native_enabled', return_value=True), \
                mock.patch.object(r, 'trusted'), mock.patch.object(r, 'attempt_lock', return_value=contextlib.nullcontext()), \
                mock.patch.object(r, 'verified_module', side_effect=lambda name, *args: modules[name]), \
                mock.patch.dict(sys.modules, {'runtime': runtime}), self.assertRaises(RuntimeError):
            r.main()
        self.assertIs(restore.Validator, original)
        statuses = [call.args[1]['status'] for call in backup.atomic_json.call_args_list]
        self.assertEqual(statuses, ['running', 'fail'])
        self.assertTrue(all(call.args[0].name == 'last_compose_rehearsal.json'
                            for call in backup.atomic_json.call_args_list))

    def test_lease_unlink_sync_and_final_write_faults_never_publish_pass(self):
        for failure in ('unlink', 'sync', 'final-write'):
            persisted = []
            def write(path, value):
                if failure == 'final-write' and value['status'] == 'pass':
                    raise OSError('fixture')
                persisted.append(dict(value))
            backup = SimpleNamespace(ROOT=Path('/fixture'), require=lambda value: self.assertTrue(value),
                                     sync_dir=mock.Mock(), atomic_json=write)
            root, lease = mock.Mock(), mock.Mock()
            root.exists.return_value = False
            if failure == 'unlink':
                lease.unlink.side_effect = OSError('fixture')
            if failure == 'sync':
                backup.sync_dir.side_effect = OSError('fixture')
            with mock.patch.multiple(r, BOUND_BACKUP=backup, ATTEMPT='fixture-attempt'), \
                    mock.patch('builtins.print') as printed, self.assertRaises(OSError):
                r.finish(root, lease, self.good_result(), r.time.monotonic())
            printed.assert_not_called()
            self.assertEqual(persisted[-1]['status'], 'finalizing')


if __name__ == '__main__':
    unittest.main()
