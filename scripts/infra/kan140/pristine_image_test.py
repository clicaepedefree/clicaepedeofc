"""Offline pristine-image contracts: fake Docker only, no native actions."""
import copy
import json
import socket
import subprocess
import time
import unittest
from unittest.mock import patch

import migration_contract
import pristine_image as p

CID = 'a' * 64
IMAGE_ID = 'sha256:' + 'b' * 64
FILES = [{'name': '20260101_fixture_' + str(i), 'checksum': 'c' * 64} for i in range(57)]


class World:
    def __init__(self):
        self.item = None
        self.calls = []
        self.change = lambda item: None
        self.ambiguous = False
        self.inflight = False
        self.cleanup_fails = False
        self.exit_code = 0
        self.output = json.dumps(FILES).encode()
        self.start_error = None
        self.bad_digest = False


class Docker:
    def __init__(self, world, cleanup=False):
        self.world, self.cleanup = world, cleanup
        self.end = time.monotonic() + 120

    def run(self, *args):
        w = self.world
        w.calls.append((self.cleanup, args))
        out = b''
        if args[:2] == ('image', 'inspect'):
            repo_digest = p.IMAGE.split('@')[0].rsplit(':', 1)[0] + '@' + p.IMAGE.split('@')[1]
            out = json.dumps([{'Id': IMAGE_ID, 'RepoDigests': [] if w.bad_digest else [repo_digest],
                               'Config': {'Volumes': {'/evolution/instances': {}}, 'Env': ['PATH=/bin']}}]).encode()
        elif args[:2] == ('container', 'ls'):
            out = CID.encode() if w.item else b''
        elif args[0] == 'create':
            if w.inflight:
                raise TimeoutError('private-create-in-flight')
            name = args[args.index('--name') + 1]
            w.item = {'Id': CID, 'Name': '/' + name, 'Image': IMAGE_ID,
                'Config': {'Labels': {p.LABEL: name}, 'Image': p.IMAGE, 'Entrypoint': ['node'],
                    'Cmd': ['-e', migration_contract.IMAGE_FILES], 'WorkingDir': '/evolution',
                    'Env': ['PATH=/bin'], 'Healthcheck': {'Test': ['NONE']},
                    'OpenStdin': False, 'Tty': False, 'Volumes': {'/evolution/instances': {}}},
                'HostConfig': {'NetworkMode': 'none', 'ReadonlyRootfs': True, 'CapDrop': ['ALL'],
                    'SecurityOpt': ['no-new-privileges'], 'LogConfig': {'Type': 'none'},
                    'NanoCpus': 100000000, 'Memory': 134217728, 'PidsLimit': 32,
                    'Tmpfs': dict(p.TMPFS), 'Privileged': False, 'RestartPolicy': {'Name': 'no'}},
                'Mounts': [], 'State': {'Status': 'created', 'Running': False}}
            w.change(w.item)
            out = CID.encode()
            if w.ambiguous:
                raise TimeoutError('private-ack-lost')
        elif args[:2] == ('container', 'inspect'):
            out = json.dumps([w.item]).encode()
        elif args[0] == 'start':
            if w.start_error:
                raise w.start_error
            w.item['State'] = {'Status': 'exited', 'Running': False, 'Restarting': False,
                               'OOMKilled': False, 'ExitCode': w.exit_code, 'Error': ''}
            out = w.output
        elif args[:2] == ('container', 'rm'):
            if w.cleanup_fails:
                raise TimeoutError('private-cleanup-timeout')
            w.item = None
        else:
            raise AssertionError('unexpected Docker operation')
        return subprocess.CompletedProcess(args, 0, out, b'')


class Interrupted(BaseException):
    pass


class PristineTests(unittest.TestCase):
    def setUp(self):
        self.world = World()
        self.work = Docker(self.world)
        self.saved = []
        self.cleaners = []
        for target in ((socket, 'socket'), (socket, 'create_connection'),
                       (subprocess, 'Popen'), (subprocess, 'run')):
            guard = patch.object(*target, side_effect=AssertionError('native actions forbidden'))
            guard.start()
            self.addCleanup(guard.stop)
        guard = patch.object(p.os, 'geteuid', return_value=0, create=True)
        guard.start()
        self.addCleanup(guard.stop)

    def cleaner(self):
        value = Docker(self.world, cleanup=True)
        self.cleaners.append(value)
        return value

    def run_helper(self, **kwargs):
        return p.inspect_migrations(self.work, kwargs.pop('image_ref', p.IMAGE),
            cleanup_factory=kwargs.pop('cleanup_factory', self.cleaner),
            checkpoint=kwargs.pop('checkpoint', self.saved.append), **kwargs)

    def fails(self, **kwargs):
        with self.assertRaises(p.Rejected) as caught:
            self.run_helper(**kwargs)
        self.assertNotIn('private', str(caught.exception))
        self.assertEqual(self.saved[-1]['status'], 'fail')

    def test_pristine_57_digest_bound_script_and_cleanup_before_pass(self):
        rows = self.run_helper()
        self.assertEqual(rows, sorted(FILES, key=lambda row: row['name']))
        self.assertEqual(self.saved[0]['status'], 'running')
        self.assertTrue(all(row['status'] == 'running' for row in self.saved[:-1]))
        final = self.saved[-1]
        self.assertEqual(final['status'], 'pass')
        self.assertEqual(final['migration_count'], 57)
        self.assertEqual(final['image_id'], IMAGE_ID)
        self.assertEqual(final['image_ref'], p.IMAGE)
        self.assertEqual(final['fixture'], 'kan140-prisma-fixture-' + final['attempt'])
        self.assertTrue(final['cleanup_verified'])
        self.assertIsNone(self.world.item)
        create = next(a for _, a in self.world.calls if a[0] == 'create')
        self.assertEqual(create[-3:], (p.IMAGE, '-e', migration_contract.IMAGE_FILES))
        for flag, val in (('--network', 'none'), ('--entrypoint', 'node'), ('--pull', 'never'),
                          ('--log-driver', 'none'), ('--cpus', '0.1'), ('--memory', '128m'),
                          ('--pids-limit', '32'), ('--cap-drop', 'ALL')):
            self.assertEqual(create[create.index(flag) + 1], val)
        self.assertIn('--read-only', create)
        self.assertIn('--no-healthcheck', create)
        self.assertNotIn('--volume', create)
        self.assertNotIn('--mount', create)
        self.assertNotIn('--env', create)
        self.assertEqual(next(a for _, a in self.world.calls if a[0] == 'start'), ('start', '--attach', CID))
        self.assertEqual(next(a for _, a in self.world.calls if a[:2] == ('container', 'rm')),
                         ('container', 'rm', '--force', CID))

    def test_wrong_mount_source_identity_or_command_never_starts(self):
        changes = [lambda i: i.update(Image='sha256:' + 'd' * 64),
                   lambda i: i['Config'].update(Image='foreign'),
                   lambda i: i['Config'].update(Cmd=['start-api']),
                   lambda i: i['Config'].update(Env=['FIXTURE_UNEXPECTED=synthetic']),
                   lambda i: i['HostConfig'].update(NetworkMode='bridge'),
                   lambda i: i['HostConfig'].update(ReadonlyRootfs=False),
                   lambda i: i['HostConfig'].update(Tmpfs={}),
                   lambda i: i.update(Mounts=[{'Type': 'bind', 'Source': '/real', 'Destination': '/evolution'}]),
                   lambda i: i.update(Mounts=[{'Type': 'volume', 'Name': 'real', 'Destination': '/evolution/instances'}]),
                   lambda i: i.update(Mounts=[{'Type': 'tmpfs', 'Destination': '/other', 'RW': False}])]
        for change in changes:
            with self.subTest(change=change):
                self.world = World()
                self.work = Docker(self.world)
                self.world.change = change
                self.fails()
                self.assertFalse(any(a[0] == 'start' for _, a in self.world.calls))

    def test_ambiguous_create_found_cleans_but_never_passes(self):
        self.world.ambiguous = True
        self.fails()
        self.assertTrue(self.saved[-1]['cleanup_verified'])
        self.assertIsNone(self.world.item)

    def test_ambiguous_inflight_absence_is_not_cleanup_pass(self):
        self.world.inflight = True
        self.fails()
        self.assertFalse(self.saved[-1]['cleanup_verified'])

    def test_cleanup_timeout_overrides_success_and_has_no_earlier_pass(self):
        self.world.cleanup_fails = True
        self.fails()
        self.assertFalse(self.saved[-1]['cleanup_verified'])
        self.assertFalse(any(row['status'] == 'pass' for row in self.saved))

    def test_foreign_name_or_label_and_unexpected_volume_never_removed(self):
        for change in (lambda i: i.update(Name='/foreign'),
                       lambda i: i['Config']['Labels'].update({p.LABEL: 'foreign'}),
                       lambda i: i.update(Mounts=[{'Type': 'volume', 'Name': 'data'}])):
            self.world = World()
            self.work = Docker(self.world)
            self.world.change = change
            self.fails()
            self.assertFalse(self.saved[-1]['cleanup_verified'])
            self.assertFalse(any(a[:2] == ('container', 'rm') for _, a in self.world.calls))

    def test_independent_fresh_cleanup_budget_capped_at_30(self):
        def interrupt_start(value):
            self.saved.append(value)
            if value.get('phase') == 'start-intent':
                self.work.end = 0
                raise TimeoutError('work-budget-exhausted')
        start = time.monotonic()
        self.fails(checkpoint=interrupt_start)
        self.assertEqual(len(self.cleaners), 1)
        self.assertGreater(self.cleaners[0].end, start)
        self.assertLessEqual(self.cleaners[0].end, time.monotonic() + 30)
        self.assertTrue(self.saved[-1]['cleanup_verified'])

    def test_reusing_work_client_or_cleanup_factory_failure_cannot_pass(self):
        self.fails(cleanup_factory=lambda: self.work)
        self.assertFalse(self.saved[-1]['cleanup_verified'])

    def test_baseexception_unwind_cleans_and_is_reraised(self):
        self.world.start_error = Interrupted()
        with self.assertRaises(Interrupted):
            self.run_helper()
        self.assertIsNone(self.world.item)
        self.assertEqual(self.saved[-1]['status'], 'fail')
        self.assertTrue(self.saved[-1]['cleanup_verified'])

    def test_exit_nonzero_and_invalid_json_checksum_count_fail(self):
        for output, code in ((b'private-invalid-json', 0), (b'[]', 0),
                             (json.dumps(FILES[:-1]).encode(), 0),
                             (json.dumps(FILES + [FILES[0]]).encode(), 0),
                             (json.dumps([{'name': 'bad', 'checksum': 'wrong'}] * 57).encode(), 0),
                             (b'x' * (p.MAX_JSON + 1), 0), (json.dumps(FILES).encode(), 1)):
            self.world = World()
            self.work = Docker(self.world)
            self.world.output, self.world.exit_code = output, code
            self.fails()
            self.assertTrue(self.saved[-1]['cleanup_verified'])

    def test_wrong_pin_or_repository_digest_never_creates(self):
        self.fails(image_ref=p.IMAGE.replace('4303', '4304'))
        self.assertFalse(any(a[0] == 'create' for _, a in self.world.calls))
        self.world.bad_digest = True
        self.fails()
        self.assertFalse(any(a[0] == 'create' for _, a in self.world.calls))

    def test_failed_pass_checkpoint_is_replaced_by_fail_and_raises(self):
        def checkpoint(value):
            self.saved.append(copy.deepcopy(value))
            if value['status'] == 'pass':
                raise OSError('ambiguous-write')
        self.fails(checkpoint=checkpoint)
        self.assertEqual(self.saved[-1]['phase'], 'checkpoint-failed')

    def test_attempts_unique_and_running_receipt_precedes_create(self):
        attempts = []
        for _ in range(2):
            self.world = World()
            self.work = Docker(self.world)
            def checkpoint(value):
                if value['phase'] in ('starting', 'create-intent'):
                    self.assertFalse(any(a[0] == 'create' for _, a in self.world.calls))
                self.saved.append(value)
            self.run_helper(checkpoint=checkpoint)
            attempts.append(self.saved[-1]['attempt'])
        self.assertNotEqual(*attempts)


if __name__ == '__main__':
    unittest.main()
