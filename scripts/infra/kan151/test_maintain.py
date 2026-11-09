"""Offline regression tests for the privileged KAN-151 maintenance helper."""
import base64
import copy
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import types
import unittest
from contextlib import redirect_stdout
from unittest.mock import MagicMock, call, patch


TEMP_ROOT = (Path('D:/ProjetoIA/codex/clicaepede/KAN-151/unit-temp') if os.name == 'nt'
             else Path(os.environ.get('RUNNER_TEMP', '/tmp')) / 'kan151-unit')


def load_maintain():
    spec = importlib.util.spec_from_file_location(
        'kan151_maintain_under_test', Path(__file__).with_name('maintain.py'))
    module = importlib.util.module_from_spec(spec)
    try:
        import fcntl  # noqa: F401
    except ImportError:
        stub = types.ModuleType('fcntl')
        stub.LOCK_EX, stub.LOCK_NB = 2, 4
        stub.flock = MagicMock()
        with patch.dict(sys.modules, {'fcntl': stub}):
            spec.loader.exec_module(module)
    else:
        spec.loader.exec_module(module)
    return module


maintain = load_maintain()


class MaintainTests(unittest.TestCase):
    def setUp(self):
        TEMP_ROOT.mkdir(parents=True, exist_ok=True)
        self.enterContext(patch.dict(os.environ, {'TMPDIR': str(TEMP_ROOT)}))
        temporary = self.enterContext(tempfile.TemporaryDirectory(dir=TEMP_ROOT))
        self.root = Path(temporary).resolve()
        self.canonical = self.root / 'canonical'
        self.canonical.mkdir()
        self.deploy = self.root / 'deploy'
        self.deploy.mkdir()
        self.run = self.root / 'run'
        self.run.mkdir()
        self.enterContext(patch.object(maintain, 'CANONICAL', self.canonical))
        self.enterContext(patch.object(maintain, 'DEPLOY_SOURCE', self.deploy))
        if os.name == 'nt':
            self.enterContext(patch.object(maintain.os, 'O_NOFOLLOW', 0, create=True))
            self.enterContext(patch.object(maintain.os, 'O_NONBLOCK', 0, create=True))
            read_snapshot = maintain.read_snapshot
            file_identity = maintain.file_identity
            # Windows stat reports creation time as ctime while fstat reports
            # change time. Production is Linux; emulate its consistent identity.
            self.enterContext(patch.object(maintain, 'file_identity',
                side_effect=lambda metadata: file_identity(metadata)[:-1]))

            def windows_snapshot(path):
                data, metadata = read_snapshot(path)
                values = {name: getattr(metadata, name) for name in dir(metadata)
                          if name.startswith('st_')}
                values['st_mode'] &= ~0o022
                values['st_uid'] = 0
                return data, types.SimpleNamespace(**values)

            self.enterContext(patch.object(maintain, 'read_snapshot', side_effect=windows_snapshot))
        self.enterContext(patch.object(maintain, 'ROOT', self.root / 'runs'))
        self.process = self.enterContext(patch.object(
            maintain.subprocess, 'run', side_effect=AssertionError('Unexpected subprocess')))
        self.enterContext(patch.object(
            maintain.urllib.request, 'urlopen', side_effect=AssertionError('Unexpected network')))
        self.enterContext(patch.object(
            maintain.socket, 'socket', side_effect=AssertionError('Unexpected socket')))
        self.source = b'// reviewed synthetic source'
        self.old_source = b'// previous synthetic source'
        self.stack = {
            'services': {'evolution': {'image': maintain.IMAGE,
                'environment': {'UNCHANGED': 'synthetic'},
                'configs': [{'source': maintain.OLD, 'target': maintain.TARGET},
                            {'source': 'unrelated', 'target': '/unrelated'}]}},
            'configs': {maintain.OLD: {'file': './start-redacted.cjs'},
                        'unrelated': {'external': True}}}
        self.old_stack = json.dumps(self.stack).encode()
        self.deploy_stack = copy.deepcopy(self.stack)
        self.deploy_stack['services']['evolution']['image'] = maintain.LEGACY_DEPLOY_IMAGE
        self.old_deploy_stack = json.dumps(self.deploy_stack, indent=2).encode()
        (self.deploy / 'start-redacted.cjs').write_bytes(self.old_source)
        (self.deploy / 'stack.yaml').write_bytes(self.old_deploy_stack)
        (self.canonical / 'stack.yaml').write_bytes(self.old_stack)
        (self.canonical / 'stack.yaml').chmod(0o600)
        spec = {'Image': maintain.IMAGE, 'Env': ['SYNTHETIC=only'],
                'Secrets': [{'SecretName': 'synthetic-reference'}],
                'Mounts': [{'Target': '/data', 'Source': 'synthetic-volume'}],
                'Configs': [{'ConfigName': 'clica-evolution-qa_' + maintain.OLD,
                             'ConfigID': 'synthetic-old-config-id',
                             'File': {'Name': maintain.TARGET}},
                            {'ConfigName': 'unrelated', 'File': {'Name': '/unrelated'}}]}
        self.before = {'ID': 'a' * 25, 'Version': {'Index': 151},
                       'Spec': {'TaskTemplate': {'ContainerSpec': spec},
                                'Labels': {'synthetic': 'preserve'}}}
        self.container = {'Id': 'synthetic-container'}
        self.payload = {'restartApproved': True, 'phase': 'apply',
                        'sourceBase64': base64.b64encode(self.source).decode(),
                        'fixtureBase64': base64.b64encode(b'// synthetic fixture').decode(),
                        'sourceSha256': maintain.digest(self.source),
                        'expectedContainerSpecSha256': maintain.spec_digest(spec),
                        'expectedStackSha256': maintain.digest(self.old_stack),
                        'expectedDeployStackSha256': maintain.digest(self.old_deploy_stack),
                        'expectedOldSourceSha256': maintain.digest(self.old_source)}
        self.inspect = self.enterContext(patch.object(maintain, 'inspect', side_effect=lambda args: [{
            'ID': 'synthetic-new-config-id', 'Spec': {'Data': base64.b64encode(
                self.old_source if args[-1] == 'synthetic-old-config-id' else self.source).decode()}}]))

    def write_file(self, path, data):
        self.assertTrue(path.resolve().is_relative_to(self.root))
        path.write_bytes(data)

    def test_approval_and_canonical_hash_drift_fail_before_backup_or_update(self):
        for field, value in [('restartApproved', False),
                             ('expectedContainerSpecSha256', '0' * 64),
                             ('expectedStackSha256', '0' * 64),
                             ('expectedDeployStackSha256', '0' * 64),
                             ('expectedOldSourceSha256', '0' * 64)]:
            with self.subTest(field=field):
                payload = dict(self.payload, **{field: value})
                with patch.object(maintain, 'preflight', return_value=(self.before, self.container)), \
                     patch.object(maintain, 'backup') as backup, \
                     patch.object(maintain, 'command') as command, \
                     patch.object(maintain, 'atomic_file') as write:
                    with self.assertRaises(AssertionError):
                        maintain.apply(payload, self.source, self.run)
                    backup.assert_not_called()
                    command.assert_not_called()
                    write.assert_not_called()
                self.assertEqual((self.canonical / 'stack.yaml').read_bytes(), self.old_stack)
                self.assertEqual((self.deploy / 'start-redacted.cjs').read_bytes(), self.old_source)
        for path in (self.canonical / 'stack.yaml', self.deploy / 'stack.yaml',
                     self.deploy / 'start-redacted.cjs'):
            with self.subTest(post_backup_drift=path):
                original = path.read_bytes()
                with patch.object(maintain, 'preflight', return_value=(self.before, self.container)), \
                     patch.object(maintain, 'backup', side_effect=lambda: path.write_bytes(b'SYNTHETIC drift')), \
                     patch.object(maintain, 'converge'), \
                     patch.object(maintain, 'atomic_file') as write, \
                     patch.object(maintain, 'compare_and_swap_config') as cas, \
                     patch.object(maintain, 'command') as command:
                    with self.assertRaises(AssertionError):
                        maintain.apply(self.payload, self.source, self.run)
                    cas.assert_not_called()
                    command.assert_not_called()
                    self.assertTrue(all(c.args[0].parent == self.run for c in write.call_args_list))
                    self.assertEqual(path.read_bytes(), b'SYNTHETIC drift')
                path.write_bytes(original)

    def test_source_hash_rejected_and_failure_output_is_sanitized(self):
        payload = dict(self.payload, sourceSha256='0' * 64)
        output = io.StringIO()
        with patch.object(maintain.os, 'umask'), \
             patch.object(maintain.fcntl, 'flock'), \
             patch.object(maintain, 'atomic_file', side_effect=self.write_file), \
             patch.object(maintain, 'preflight') as preflight, \
             patch.object(maintain, 'probe') as probe, \
             patch.object(maintain, 'backup') as backup, \
             patch.object(maintain, 'command') as command, redirect_stdout(output):
            with self.assertRaises(SystemExit) as failure:
                maintain.run_payload(payload)
            self.assertEqual(failure.exception.code, 1)
            for mock in (preflight, probe, backup, command):
                mock.assert_not_called()
        result = json.loads(output.getvalue())
        self.assertEqual(result['status'], 'FAILED')
        self.assertFalse(result['automaticRollback'])
        self.assertEqual(set(result), {'status', 'class', 'run', 'automaticRollback'})
        persisted = maintain.ROOT / result['run'] / 'failure-sanitized.json'
        self.assertEqual(json.loads(persisted.read_bytes()), result)
        self.assertNotIn(self.source.decode(), output.getvalue())
        output = io.StringIO()
        private_error = subprocess.CalledProcessError(
            1, ['SYNTHETIC-private-command'], output=b'SYNTHETIC-private-stdout',
            stderr=b'SYNTHETIC-private-stderr')
        with patch.object(maintain.os, 'umask'), \
             patch.object(maintain.fcntl, 'flock'), \
             patch.object(maintain, 'atomic_file', side_effect=self.write_file), \
             patch.object(maintain, 'preflight', side_effect=private_error), \
             patch.object(maintain, 'apply') as apply, redirect_stdout(output):
            with self.assertRaises(SystemExit) as failure:
                maintain.run_payload(self.payload)
            self.assertEqual(failure.exception.code, 1)
            apply.assert_not_called()
        result = json.loads(output.getvalue())
        self.assertEqual(result['class'], 'CalledProcessError')
        self.assertFalse(result['automaticRollback'])
        self.assertNotIn('SYNTHETIC-private', output.getvalue())
        self.assertEqual(json.loads((maintain.ROOT / result['run'] /
                                    'failure-sanitized.json').read_bytes()), result)

    def test_config_content_and_unreviewed_semantic_drift_fail_before_snapshots(self):
        cases = ('config-data', 'deploy-env', 'deploy-image', 'canonical-image', 'duplicate-target')
        for case in cases:
            with self.subTest(case=case):
                payload = dict(self.payload)
                deploy, canonical = copy.deepcopy(self.deploy_stack), copy.deepcopy(self.stack)
                if case == 'deploy-env':
                    deploy['services']['evolution']['environment']['UNCHANGED'] = 'drift'
                if case == 'deploy-image':
                    deploy['services']['evolution']['image'] = 'unreviewed:image'
                if case == 'canonical-image':
                    canonical['services']['evolution']['image'] = maintain.LEGACY_DEPLOY_IMAGE
                if case == 'duplicate-target':
                    for stack in (deploy, canonical):
                        stack['services']['evolution']['configs'].append(
                            {'source': maintain.OLD, 'target': maintain.TARGET})
                (self.deploy / 'stack.yaml').write_bytes(json.dumps(deploy).encode())
                (self.canonical / 'stack.yaml').write_bytes(json.dumps(canonical).encode())
                payload['expectedDeployStackSha256'] = maintain.digest((self.deploy / 'stack.yaml').read_bytes())
                payload['expectedStackSha256'] = maintain.digest((self.canonical / 'stack.yaml').read_bytes())
                response = [{'Spec': {'Data': base64.b64encode(
                    b'wrong-config' if case == 'config-data' else self.old_source).decode()}}]
                with patch.object(maintain, 'preflight', return_value=(self.before, self.container)), \
                     patch.object(maintain, 'inspect', return_value=response), \
                     patch.object(maintain, 'backup') as backup, \
                     patch.object(maintain, 'atomic_file') as write, \
                     patch.object(maintain, 'compare_and_swap_config') as cas:
                    with self.assertRaises((AssertionError, ValueError)):
                        maintain.apply(payload, self.source, self.run)
                    backup.assert_not_called()
                    write.assert_not_called()
                    cas.assert_not_called()

    def test_all_inputs_rechecked_immediately_before_cas(self):
        for path in (self.canonical / 'stack.yaml', self.deploy / 'stack.yaml',
                     self.deploy / 'start-redacted.cjs'):
            with self.subTest(path=path):
                original = path.read_bytes()
                with self.subTest(stage='intent-write'):
                    events, _, backup, cas = self.apply_mocks()

                    def write(path_to_write, data):
                        self.write_file(path_to_write, data)
                        if path_to_write.name == 'rollout-intent.json':
                            path.write_bytes(b'SYNTHETIC drift')

                    with patch.object(maintain, 'atomic_file', side_effect=write):
                        with self.assertRaises(AssertionError):
                            maintain.apply(self.payload, self.source, self.run)
                    cas.assert_not_called()
                    backup.assert_called_once()
                    self.assertEqual(path.read_bytes(), b'SYNTHETIC drift')
                    path.write_bytes(original)

    def test_post_cas_drift_does_not_overwrite_inputs_or_run_second_backup(self):
        _, _, backup, cas = self.apply_mocks()
        path = self.deploy / 'stack.yaml'
        cas.side_effect = lambda *args: path.write_bytes(b'SYNTHETIC concurrent edit')
        with self.assertRaises(AssertionError):
            maintain.apply(self.payload, self.source, self.run)
        cas.assert_called_once()
        backup.assert_called_once()
        self.assertEqual(path.read_bytes(), b'SYNTHETIC concurrent edit')
        self.assertEqual((self.deploy / 'start-redacted.cjs').read_bytes(), self.old_source)
        self.assertEqual((self.canonical / 'stack.yaml').read_bytes(), self.old_stack)

    def test_resolved_snapshot_rejects_links_and_nonregular_files(self):
        path = MagicMock()
        path.resolve.return_value = self.root / 'other'
        with patch.object(maintain.os, 'open') as opened:
            with self.assertRaises(AssertionError):
                maintain.read_snapshot(path)
            opened.assert_not_called()
        with self.assertRaises((AssertionError, OSError)):
            maintain.read_snapshot(self.deploy)
        path = self.deploy / 'start-redacted.cjs'
        alias = self.deploy / 'hardlink.cjs'
        os.link(path, alias)
        with self.assertRaises(AssertionError):
            maintain.read_snapshot(path)

    def test_canonical_directory_trust_rejects_symlink_before_docker(self):
        with patch.object(Path, 'resolve', return_value=self.root / 'elsewhere'), \
             patch.object(maintain.os, 'geteuid', return_value=0, create=True), \
             patch.object(maintain, 'state') as state:
            with self.assertRaises(AssertionError):
                maintain.preflight()
            state.assert_not_called()

    def test_atomic_file_is_exclusive_private_and_durable_before_and_after_replace(self):
        path = MagicMock()
        path.parent.is_dir.return_value = True
        path.parent.resolve.return_value = path.parent
        temporary = path.with_name.return_value
        target = MagicMock()
        target.fileno.return_value = 41
        events = MagicMock()
        with patch.object(maintain.os, 'open', side_effect=[41, 42]) as opened, \
             patch.object(maintain.os, 'fdopen') as fdopen, \
             patch.object(maintain.os, 'fsync') as fsync, \
             patch.object(maintain.os, 'replace') as replace, \
             patch.object(maintain.os, 'close') as close, \
             patch.object(maintain.os, 'O_DIRECTORY', 0x10000, create=True):
            fdopen.return_value.__enter__.return_value = target
            for name, mock in [('write', target.write), ('flush', target.flush),
                               ('fsync', fsync), ('replace', replace), ('close', close)]:
                events.attach_mock(mock, name)
            maintain.atomic_file(path, b'synthetic bytes')
            self.assertEqual(opened.call_args_list, [
                call(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600),
                call(path.parent, maintain.os.O_DIRECTORY)])
            fdopen.assert_called_once_with(41, 'wb')
            self.assertEqual(events.mock_calls, [call.write(b'synthetic bytes'), call.flush(),
                call.fsync(41), call.replace(temporary, path), call.fsync(42), call.close(42)])
            fsync.side_effect = [None, OSError('synthetic directory fsync failure')]
            opened.side_effect = [41, 42]
            close.reset_mock()
            with self.assertRaises(OSError):
                maintain.atomic_file(path, b'synthetic bytes')
            close.assert_called_once_with(42)

    def probe_process(self, stdout=None, stderr=None, label=None, run_path=None):
        clean = b'qa151-diagnostic-event ECONNRESET [REDACTED]'
        label = (run_path or self.run).name if label is None else label

        def run(args, **kwargs):
            if args[:2] == ['docker', 'logs']:
                return subprocess.CompletedProcess(args, 0,
                    clean if stdout is None else stdout, clean if stderr is None else stderr)
            if args[:2] == ['docker', 'inspect']:
                return subprocess.CompletedProcess(args, 0, json.dumps([
                    {'Config': {'Labels': {'kan151.probe': label}}}]).encode())
            raise AssertionError('Unexpected subprocess')
        self.process.side_effect = run

    def test_probe_is_isolated_pinned_synthetic_and_label_checked_before_cleanup(self):
        self.probe_process()
        with patch.object(maintain, 'atomic_file', side_effect=self.write_file), \
             patch.object(maintain, 'command') as command:
            result = maintain.probe(self.source, b'// synthetic fixture', self.run)
        args = command.call_args_list[0].args[0]
        for flag, value in [('--network', 'none'), ('--pull', 'never'),
                            ('--cap-drop', 'ALL'), ('--security-opt', 'no-new-privileges:true')]:
            self.assertEqual(args[args.index(flag) + 1], value)
        self.assertIn('--read-only', args)
        self.assertEqual(args[-4:], [maintain.IMAGE, '/probe/start-redacted.cjs',
                                     'node', '/probe/fixture.cjs'])
        self.assertRegex(maintain.IMAGE, r'@sha256:[0-9a-f]{64}$')
        for secret in (self.run / 'probe' / 'secrets').iterdir():
            self.assertEqual(secret.read_bytes(), (
                'KAN151-synthetic-' + secret.name + '-not-a-real-secret-' + 'x' * 32).encode())
        self.assertEqual(result['status'], 'PASS')
        self.assertTrue(result['stdoutAndStderr'])
        self.assertEqual(command.call_args_list[-1],
                         call(['docker', 'rm', '-f', 'kan151-log-probe-' + self.run.name]))
        self.assertEqual(self.process.call_args_list[-1].args[0][:2], ['docker', 'inspect'])

    def test_probe_rejects_zero_exit_leaks_or_missing_diagnostics_in_either_stream(self):
        leaks = [b'15555550123@s.whatsapp.net', b'15555550124',
                 b'KAN151-synthetic-api_key', b'', b'no diagnostic markers']
        for stream in ('stdout', 'stderr'):
            for index, leak in enumerate(leaks):
                with self.subTest(stream=stream, leak=leak):
                    run = self.root / ('probe-case-' + stream + str(index))
                    run.mkdir()
                    self.probe_process(run_path=run, **{stream: leak})
                    with patch.object(maintain, 'atomic_file', side_effect=self.write_file), \
                         patch.object(maintain, 'command') as command:
                        with self.assertRaises(AssertionError):
                            maintain.probe(self.source, b'// synthetic fixture', run)
                        self.assertEqual(command.call_args_list[-1].args[0][:3],
                                         ['docker', 'rm', '-f'])

    def test_probe_failure_still_checks_ownership_and_refuses_foreign_cleanup(self):
        self.probe_process(label='foreign-owner')
        failure = subprocess.CalledProcessError(1, ['docker', 'run'],
                                                output=b'SYNTHETIC-private-output',
                                                stderr=b'SYNTHETIC-private-error')
        with patch.object(maintain, 'atomic_file', side_effect=self.write_file), \
             patch.object(maintain, 'command', side_effect=failure) as command:
            with self.assertRaises(AssertionError):
                maintain.probe(self.source, b'// synthetic fixture', self.run)
            self.assertEqual(command.call_count, 1)
            self.assertEqual(self.process.call_args.args[0][:2], ['docker', 'inspect'])
        args = ['synthetic-command']
        self.process.side_effect = subprocess.CalledProcessError(
            1, args, output=b'SYNTHETIC-output', stderr=b'SYNTHETIC-error')
        with self.assertRaises(subprocess.CalledProcessError):
            maintain.command(args)
        self.assertTrue(self.process.call_args.kwargs['check'])

    def apply_mocks(self, fail_health=False):
        after = copy.deepcopy(self.before)
        after['Spec']['TaskTemplate']['ContainerSpec']['Configs'][0]['ConfigName'] = (
            'clica-evolution-qa_' + maintain.NEW)
        events = MagicMock()
        preflight = self.enterContext(patch.object(maintain, 'preflight',
            return_value=(self.before, self.container)))
        backup = self.enterContext(patch.object(maintain, 'backup'))
        convergence = [(self.before, self.container, {}),
                       RuntimeError('synthetic health failure') if fail_health else
                       (after, self.container, {}), (after, self.container, {})]
        converge = self.enterContext(patch.object(maintain, 'converge', side_effect=convergence))
        command = self.enterContext(patch.object(maintain, 'command'))
        cas = self.enterContext(patch.object(maintain, 'compare_and_swap_config'))
        self.enterContext(patch.object(maintain, 'atomic_file', side_effect=self.write_file))
        self.process.side_effect = lambda args, **kw: subprocess.CompletedProcess(
            args, 1 if args[:3] == ['docker', 'config', 'inspect'] else 0, b'', b'')
        for name, mock in [('preflight', preflight), ('backup', backup),
                           ('converge', converge), ('command', command), ('cas', cas)]:
            events.attach_mock(mock, name)
        return events, command, backup, cas

    def test_apply_preserves_unrelated_config_and_spec_with_two_backups(self):
        events, command, backup, cas = self.apply_mocks()
        result = maintain.apply(self.payload, self.source, self.run)
        sequence = [entry[0] for entry in events.mock_calls]
        self.assertEqual(sequence[:5], ['preflight', 'backup', 'converge', 'preflight', 'command'])
        self.assertEqual(sequence[-3:], ['converge', 'backup', 'converge'])
        self.assertEqual(backup.call_count, 2)
        updates = [c.args[0] for c in command.call_args_list if c.args[0][:3] ==
                   ['docker', 'service', 'update']]
        self.assertEqual(updates, [])
        cas.assert_called_once_with(self.before, 'synthetic-new-config-id',
                                    'clica-evolution-qa_' + maintain.NEW)
        expected = copy.deepcopy(self.stack)
        expected['services']['evolution']['configs'][0]['source'] = maintain.NEW
        expected['configs'][maintain.NEW] = expected['configs'].pop(maintain.OLD)
        self.assertEqual(json.loads((self.canonical / 'stack.yaml').read_bytes()), expected)
        self.assertEqual(json.loads((self.deploy / 'stack.yaml').read_bytes()), expected)
        self.assertFalse((self.canonical / 'start-redacted.cjs').exists())
        self.assertEqual((self.run / 'source-before.cjs').read_bytes(), self.old_source)
        self.assertEqual((self.run / 'stack-before.yaml').read_bytes(), self.old_stack)
        self.assertEqual((self.run / 'deploy-stack-before.yaml').read_bytes(), self.old_deploy_stack)
        self.assertEqual(json.loads((self.run / 'service-before-private.json').read_bytes()), self.before)
        self.assertTrue(result['protectedContainerSpecUnchanged'])
        self.assertFalse(result['historicalLogsDeleted'])
        (self.deploy / 'start-redacted.cjs').write_bytes(self.old_source)
        (self.deploy / 'stack.yaml').write_bytes(self.old_deploy_stack)
        (self.canonical / 'stack.yaml').write_bytes(self.old_stack)
        self.assert_failed_health_without_rollback()

    def test_post_backup_full_spec_drift_rejected_before_canonical_changes(self):
        changed = copy.deepcopy(self.before)
        changed['Version']['Index'] += 1
        changed['Spec']['UpdateConfig'] = {'FailureAction': 'rollback'}
        with patch.object(maintain, 'preflight', side_effect=[
                (self.before, self.container), (changed, self.container)]), \
             patch.object(maintain, 'backup') as backup, \
             patch.object(maintain, 'converge'), \
             patch.object(maintain, 'atomic_file', side_effect=self.write_file), \
             patch.object(maintain, 'compare_and_swap_config') as cas:
            with self.assertRaises(AssertionError):
                maintain.apply(self.payload, self.source, self.run)
            backup.assert_called_once()
            cas.assert_not_called()
        self.assertEqual((self.canonical / 'stack.yaml').read_bytes(), self.old_stack)
        self.assertEqual((self.deploy / 'start-redacted.cjs').read_bytes(), self.old_source)

    def test_rejected_cas_keeps_canonical_old_and_intent_for_reconciliation(self):
        _, _, backup, cas = self.apply_mocks()
        cas.side_effect = AssertionError('Service version conflict or update rejected')
        with self.assertRaisesRegex(AssertionError, 'version conflict'):
            maintain.apply(self.payload, self.source, self.run)
        backup.assert_called_once()
        self.assertEqual((self.canonical / 'stack.yaml').read_bytes(), self.old_stack)
        self.assertEqual((self.deploy / 'start-redacted.cjs').read_bytes(), self.old_source)
        self.assertEqual((self.deploy / 'stack.yaml').read_bytes(), self.old_deploy_stack)
        self.assertTrue((self.run / 'rollout-intent.json').exists())

    def assert_failed_health_without_rollback(self):
        _, command, backup, cas = self.apply_mocks(fail_health=True)
        with self.assertRaisesRegex(RuntimeError, 'synthetic health failure'):
            maintain.apply(self.payload, self.source, self.run)
        self.assertEqual(backup.call_count, 1)
        self.assertEqual((self.deploy / 'start-redacted.cjs').read_bytes(), self.source)
        self.assertEqual(json.loads((self.canonical / 'stack.yaml').read_bytes())[
            'services']['evolution']['configs'][0]['source'], maintain.NEW)
        self.assertTrue((self.run / 'rollout-intent.json').exists())
        updates = [c.args[0] for c in command.call_args_list if c.args[0][:3] ==
                   ['docker', 'service', 'update']]
        self.assertEqual(updates, [])
        cas.assert_called_once()
        self.assertFalse((self.run / 'result-sanitized.json').exists())

    def test_cas_uses_expected_version_exact_spec_and_closes_on_conflict(self):
        original = copy.deepcopy(self.before)
        expected = copy.deepcopy(self.before['Spec'])
        target = expected['TaskTemplate']['ContainerSpec']['Configs'][0]
        target.update(ConfigID='synthetic-new-id', ConfigName='synthetic-new-name')
        for status in (200, 409):
            with self.subTest(status=status):
                connection = MagicMock()
                connection.getresponse.return_value.status = status
                with patch.object(maintain, 'DockerConnection', return_value=connection) as factory, \
                     patch.object(maintain, 'command', return_value=b'1.47\n') as command:
                    if status == 200:
                        maintain.compare_and_swap_config(self.before, 'synthetic-new-id', 'synthetic-new-name')
                    else:
                        with self.assertRaisesRegex(AssertionError, 'version conflict'):
                            maintain.compare_and_swap_config(self.before, 'synthetic-new-id', 'synthetic-new-name')
                    factory.assert_called_once_with('localhost', timeout=120)
                    method, route, body, headers = connection.request.call_args.args
                    self.assertEqual(method, 'POST')
                    self.assertEqual(route, '/v1.47/services/' + 'a' * 25 + '/update?version=151')
                    self.assertEqual(json.loads(body), expected)
                    self.assertEqual(headers, {'Content-Type': 'application/json'})
                    connection.getresponse.return_value.read.assert_called_once_with(16384)
                    connection.close.assert_called_once()
                    command.assert_called_once_with(['docker', 'version', '--format', '{{.Server.APIVersion}}'])
                self.assertEqual(self.before, original)


if __name__ == '__main__':
    unittest.main()
