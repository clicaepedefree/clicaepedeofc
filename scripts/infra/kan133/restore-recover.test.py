#!/usr/bin/env python3
"""Offline recovery tests. Docker, signals and root metadata are mocked on Windows."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile
import types
import unittest
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
spec = importlib.util.spec_from_file_location('restore_recover', Path(__file__).with_name('restore-recover.py'))
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)
OWNER = 'kan133-restore-' + 'a' * 32


class Docker:
    def __init__(self, directory, validator):
        self.calls = []
        self.failure = None
        self.keep = False
        self.rows = {'container': {}, 'network': {}, 'volume': {}}
        for i, service in enumerate(r.SERVICES, 1):
            identity = f'{i:064x}'
            self.rows['container'][identity] = {
                'Id': identity, 'Name': '/' + OWNER + '-' + service,
                'Config': {'Labels': {r.LABEL: OWNER}}, 'Mounts': [
                    {'Type': 'bind', 'RW': False,
                     'Source': str(validator / 'redis_password'),
                     'Destination': '/run/secrets/redis_password'}]}
        self.rows['container'][f'{1:064x}']['Mounts'].append({
            'Type': 'bind', 'RW': False, 'Source': str(directory / 'input' / 'postgres.dump'),
            'Destination': '/backup/postgres.dump'})
        identity = f'{4:064x}'
        self.rows['network'][identity] = {'Id': identity, 'Name': OWNER + '-net', 'Labels': {r.LABEL: OWNER}}
        for service in r.SERVICES:
            name = OWNER + '-' + service + '-data'
            self.rows['volume'][name] = {'Name': name, 'Labels': {r.LABEL: OWNER}}

    def __call__(self, *args):
        self.calls.append(args)
        kind, command = args[:2]
        if command == 'ls':
            label = any(value.startswith('label=') for value in args)
            rows = []
            for identity, resource in self.rows[kind].items():
                name = resource['Name'].lstrip('/')
                labels = resource.get('Config', {}).get('Labels', {}) if kind == 'container' else resource['Labels']
                if (label and labels.get(r.LABEL) == OWNER) or (not label and OWNER in name):
                    rows.append(identity if label and kind != 'volume' else name)
            return '\n'.join(rows)
        if command == 'inspect':
            return json.dumps([self.rows[kind][args[-1]]])
        if command == 'rm':
            if self.failure is not None:
                raise self.failure
            if not self.keep:
                del self.rows[kind][args[-1]]
            return ''
        raise AssertionError('Unexpected Docker command')


class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.directory = self.root / 'restore-offsite-abcdefgh'
        self.directory.mkdir(mode=0o700)
        (self.directory / 'input').mkdir(mode=0o700)
        (self.directory / 'input' / 'postgres.dump').write_bytes(b'FAKE-PLAINTEXT')
        self.validator = self.root / (OWNER + '-12345678')
        self.validator.mkdir(mode=0o700)
        (self.validator / 'redis_password').write_bytes(b'FAKE-SECRET')
        self.lease = self.root / 'restore_lease.json'
        self.value = {'owner': OWNER, 'directory': str(self.directory),
                      'validator_directory': str(self.validator)}
        self.lease.write_text(json.dumps(self.value))
        self.daemon = Docker(self.directory, self.validator)
        self.worker = r.Recovery(self.root)
        self.patch(r.backup, 'private_file', side_effect=lambda p: open(p, encoding='utf8'))
        self.patch(r.backup, 'sync_dir')
        self.patch(r.subprocess, 'run', side_effect=AssertionError('Unmocked subprocess'))
        self.patch(self.worker, 'docker', side_effect=self.daemon)
        if os.name != 'posix':
            real = Path.lstat

            def metadata(path, *args, **kwargs):
                value = real(path, *args, **kwargs)
                mode = stat.S_IFDIR | 0o700 if stat.S_ISDIR(value.st_mode) else value.st_mode
                return types.SimpleNamespace(st_mode=mode, st_uid=0,
                                             st_nlink=value.st_nlink, st_size=value.st_size)

            self.patch(Path, 'lstat', metadata)
            self.patch(r.shutil.rmtree, 'avoids_symlink_attacks', True)

    def patch(self, target, name, *args, **kwargs):
        patch = mock.patch.object(target, name, *args, **kwargs)
        result = patch.start()
        self.addCleanup(patch.stop)
        return result

    def assert_untouched(self):
        self.assertTrue(self.lease.exists())
        self.assertTrue(self.directory.exists())
        self.assertTrue(self.validator.exists())
        self.assertFalse(any(args[1] == 'rm' for args in self.daemon.calls))

    def test_full_owned_recovery_and_order(self):
        result = self.worker.run()
        self.assertEqual(result, {'status': 'ok', 'code': 'recovered',
                                 'resources_removed': 7, 'directories_removed': 2})
        kinds = [args[0] for args in self.daemon.calls if args[1] == 'rm']
        self.assertEqual(kinds, ['container'] * 3 + ['network'] + ['volume'] * 3)
        for args in self.daemon.calls:
            if args[:2] == ('container', 'rm'):
                self.assertEqual(args[2], '--force')
        self.assertFalse(self.lease.exists())
        self.assertFalse(self.directory.exists())
        self.assertFalse(self.validator.exists())
        self.assertNotIn('prune', repr(self.daemon.calls))

    def test_no_lease_no_docker_or_plaintext_deletion(self):
        self.lease.unlink()
        self.assertEqual(self.worker.run(), {'status': 'ok', 'code': 'no_lease'})
        self.assertEqual(self.daemon.calls, [])
        self.assertTrue(self.directory.exists())

    def test_unknown_validator_directory_located_before_first_container(self):
        self.value.pop('validator_directory')
        self.lease.write_text(json.dumps(self.value))
        self.daemon.rows = {kind: {} for kind in self.daemon.rows}
        other = self.root / ('kan133-restore-' + 'b' * 32 + '-abcdefgh')
        other.mkdir(mode=0o700)
        self.worker.run()
        self.assertTrue(other.exists())
        self.assertFalse(self.validator.exists())

    def test_optional_unknown_validator_directory(self):
        self.value['validator_directory'] = None
        self.lease.write_text(json.dumps(self.value))
        self.worker.run()
        self.assertFalse(self.validator.exists())

    def test_missing_plaintext_directories_idempotent_recovery(self):
        shutil.rmtree(self.directory)
        shutil.rmtree(self.validator)
        self.daemon.rows = {kind: {} for kind in self.daemon.rows}
        self.worker.run()
        self.assertFalse(self.lease.exists())

    def test_deleted_secret_bind_directory_does_not_block_container_cleanup(self):
        shutil.rmtree(self.validator)
        result = self.worker.run()
        self.assertEqual(result['resources_removed'], 7)
        self.assertEqual(result['directories_removed'], 1)
        self.assertFalse(self.lease.exists())

    def test_foreign_resources_and_plaintext_untouched(self):
        foreign = 'kan133-restore-' + 'b' * 32
        identity = 'f' * 64
        self.daemon.rows['container'][identity] = {
            'Id': identity, 'Name': '/' + foreign + '-postgres',
            'Config': {'Labels': {r.LABEL: foreign}}, 'Mounts': []}
        foreign_dir = self.root / (foreign + '-abcdefgh')
        foreign_dir.mkdir(mode=0o700)
        self.worker.run()
        self.assertIn(identity, self.daemon.rows['container'])
        self.assertTrue(foreign_dir.exists())

    def test_lease_replaced_during_cleanup_is_not_deleted(self):
        real = r.shutil.rmtree

        def remove(path):
            real(path)
            self.lease.write_text(json.dumps({**self.value, 'owner': 'kan133-restore-' + 'b' * 32}))

        with mock.patch.object(r.shutil, 'rmtree', side_effect=remove) as cleanup:
            cleanup.avoids_symlink_attacks = True
            with self.assertRaises(r.Failure) as error:
                self.worker.run()
        self.assertEqual(error.exception.code, 'lease_changed')
        self.assertTrue(self.lease.exists())

    def test_invalid_lease_never_touches_resources(self):
        cases = ({'owner': 'clica-evolution-qa'}, {'owner': 1},
                 {'owner': 'kan133-restore-' + 'A' * 32}, {'extra': 'unexpected'},
                 {'directory': str(self.root.parent / 'restore-offsite-abcdefgh')},
                 {'directory': str(self.directory) + '/../restore-offsite-abcdefgh'},
                 {'validator_directory': '/tmp/' + OWNER + '-abcdefgh'})
        for changes in cases:
            with self.subTest(changes=changes):
                self.lease.write_text(json.dumps({**self.value, **changes}))
                with self.assertRaises(r.Failure):
                    self.worker.run()
                self.assert_untouched()
                self.assertEqual(self.daemon.calls, [])

    def test_bad_json_and_size_limit_no_docker(self):
        for content in ('{', ' ' * 4097):
            self.lease.write_text(content)
            with self.assertRaises((r.Failure, ValueError)):
                self.worker.run()
            self.assert_untouched()

    def test_wrong_label_named_resource_blocks_every_removal(self):
        resource = self.daemon.rows['container'][f'{1:064x}']
        resource['Config']['Labels'][r.LABEL] = 'foreign-owner'
        with self.assertRaises(r.Failure):
            self.worker.run()
        self.assert_untouched()

    def test_owned_label_with_unknown_name_blocks_every_removal(self):
        self.daemon.rows['container'][f'{1:064x}']['Name'] = '/clica-evolution-qa_evolution'
        with self.assertRaises(r.Failure):
            self.worker.run()
        self.assert_untouched()

    def test_bind_outside_root_or_wrong_destination_is_rejected(self):
        mount = self.daemon.rows['container'][f'{1:064x}']['Mounts'][0]
        for changes in ({'Source': '/tmp/' + OWNER + '-abcdefgh/redis_password'},
                        {'Source': str(self.root / 'redis_password')},
                        {'RW': True}, {'Destination': '/etc/shadow'}):
            original = mount.copy()
            with self.subTest(changes=changes):
                mount.update(changes)
                with self.assertRaises(r.Failure):
                    self.worker.run()
                self.assert_untouched()
                mount.clear()
                mount.update(original)

    def test_failed_remove_keeps_all_plaintext_and_lease(self):
        self.daemon.failure = subprocess.CalledProcessError(1, ['FAKE-SECRET'])
        with self.assertRaises(subprocess.CalledProcessError):
            self.worker.run()
        self.assertTrue(self.lease.exists())
        self.assertTrue(self.directory.exists())
        self.assertTrue(self.validator.exists())

    def test_remove_success_but_resources_remain_never_clears_lease(self):
        self.daemon.keep = True
        with self.assertRaises(r.Failure):
            self.worker.run()
        self.assertTrue(self.lease.exists())
        self.assertTrue(self.directory.exists())

    def test_interrupted_partial_removal_is_retryable(self):
        real = self.daemon.__call__
        removals = []

        def interrupted(*args):
            if args[1] == 'rm':
                removals.append(args)
                if len(removals) == 2:
                    raise r.Failure('interrupted')
            return real(*args)

        self.worker.docker.side_effect = interrupted
        with self.assertRaises(r.Failure):
            self.worker.run()
        self.assertTrue(self.lease.exists())
        self.assertTrue(self.directory.exists())
        next_run = r.Recovery(self.root)
        with mock.patch.object(next_run, 'docker', side_effect=self.daemon):
            self.assertEqual(next_run.run()['resources_removed'], 6)
        self.assertFalse(self.lease.exists())

    def test_deadline_prevents_even_lease_read(self):
        self.worker.end = 0
        with self.assertRaises(r.Failure) as error:
            self.worker.run()
        self.assertEqual(error.exception.code, 'deadline')
        self.assert_untouched()

    def test_plaintext_deletion_failure_keeps_lease(self):
        with mock.patch.object(r.shutil, 'rmtree', side_effect=OSError('FAKE-SECRET')) as remove:
            remove.avoids_symlink_attacks = True
            with self.assertRaises(OSError):
                self.worker.run()
        self.assertTrue(self.lease.exists())
        self.assertTrue(self.directory.exists())

    def test_directory_metadata_gates(self):
        path = mock.MagicMock()
        parent = mock.MagicMock()
        path.parent = parent
        path.name = 'restore-offsite-abcdefgh'
        path.is_absolute.return_value = True
        path.resolve.return_value = path
        for mode, uid in ((stat.S_IFDIR | 0o755, 0), (stat.S_IFDIR | 0o700, 1000),
                          (stat.S_IFLNK | 0o700, 0), (stat.S_IFREG | 0o700, 0)):
            path.lstat.return_value = mock.Mock(st_mode=mode, st_uid=uid)
            with self.assertRaises(r.Failure):
                r.safe_directory(path, parent, 'restore-offsite-' + r.SUFFIX)
        path.lstat.return_value = mock.Mock(st_mode=stat.S_IFDIR | 0o700, st_uid=0)
        self.assertTrue(r.safe_directory(path, parent, 'restore-offsite-' + r.SUFFIX))

    def test_local_docker_timeout_and_private_transport(self):
        worker = r.Recovery(self.root)
        with mock.patch.object(r.subprocess, 'run', return_value=mock.Mock(stdout=b'')) as run:
            worker.docker('volume', 'ls')
        args = run.call_args.args[0]
        self.assertEqual(args[:3], ['docker', '--host', 'unix:///var/run/docker.sock'])
        self.assertEqual(run.call_args.kwargs['stderr'], subprocess.DEVNULL)
        self.assertLessEqual(run.call_args.kwargs['timeout'], 5)
        self.assertNotIn('DOCKER_HOST', run.call_args.kwargs['env'])

    def test_cli_busy_lock_skip_and_sanitized_errors(self):
        with mock.patch.object(r.sys, 'platform', 'linux'), \
                mock.patch.object(r.os, 'geteuid', return_value=0, create=True), \
                mock.patch.object(r.signal, 'SIGALRM', 14, create=True), \
                mock.patch.object(r.signal, 'ITIMER_REAL', 0, create=True), \
                mock.patch.object(r.signal, 'signal'), \
                mock.patch.object(r.signal, 'setitimer', return_value=(0, 0), create=True):
            for error, status, code in ((r.backup.LockBusy(), 0, 'lock_busy'),
                                        (RuntimeError('FAKE-SECRET'), 1, 'recovery_failed')):
                output = io.StringIO()
                with mock.patch.object(r.backup, 'locked', side_effect=error), contextlib.redirect_stdout(output):
                    self.assertEqual(r.main([]), status)
                result = json.loads(output.getvalue())
                self.assertEqual(result['code'], code)
                self.assertNotIn('FAKE-SECRET', output.getvalue())


@unittest.skipUnless(sys.platform == 'linux' and os.geteuid() == 0, 'Linux root metadata/flock')
class LinuxTests(unittest.TestCase):
    def test_real_private_lease_lock_symlinks_and_hardlinks(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / 'root'
            with r.backup.locked(root):
                worker = r.Recovery(root)
                with self.assertRaises(r.backup.LockBusy):
                    with r.backup.locked(root):
                        pass
                staging = root / 'restore-offsite-abcdefgh'
                staging.mkdir(mode=0o700)
                r.backup.atomic_json(worker.lease, {'owner': OWNER, 'directory': str(staging)})
                worker.lease.chmod(0o644)
                with self.assertRaises(r.backup.Failure), mock.patch.object(worker, 'docker') as docker:
                    worker.run()
                docker.assert_not_called()
                worker.lease.chmod(0o600)
                outside = root.parent / 'sentinel'
                outside.write_bytes(b'untouched')
                link = staging / 'link'
                link.symlink_to(outside)
                with self.assertRaises(r.Failure):
                    worker.validate_tree(staging)
                link.unlink()
                os.link(outside, link)
                with self.assertRaises(r.Failure):
                    worker.validate_tree(staging)
                self.assertTrue(outside.exists())


if __name__ == '__main__':
    unittest.main()
