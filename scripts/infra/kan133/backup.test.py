"""Offline stdlib tests: python3 scripts/infra/kan133/backup.test.py."""
import base64
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import stat
import tarfile
import tempfile
import time
import unittest
from unittest import mock

spec = importlib.util.spec_from_file_location('kan133_backup', Path(__file__).with_name('backup.py'))
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)


def token(role):
    payload = base64.urlsafe_b64encode(json.dumps({'role': role}).encode()).decode().rstrip('=')
    return 'header.' + payload + '.signature'


SETTINGS = {'recipient': 'age1' + 'q' * 58, 'supabase_url': 'https://' + b.SUPABASE_HOST,
            'anon_key': token('anon'), 'uploader_email': 'offline@example.invalid',
            'uploader_password': 'FAKE-OFFLINE-PASSWORD'}
NAME = b.PREFIX + '20261006T120000Z-00000000-0000-0000-0000-000000000000.age'


class BackupTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.executor = b.Executor(self.root)
        for target, name in ((b, 'sync_dir'), (self.executor, 'cleanup_orphans')):
            patch = mock.patch.object(target, name)
            patch.start()
            self.addCleanup(patch.stop)
        patch = mock.patch.object(b.subprocess, 'run', side_effect=AssertionError('Unmocked subprocess'))
        patch.start()
        self.addCleanup(patch.stop)
        # Metadata checks are exercised separately. Windows cannot enforce Unix uid/modes.
        patch = mock.patch.object(b, 'private_file', lambda p: open(p, encoding='utf-8'))
        patch.start()
        self.addCleanup(patch.stop)
        if os.name != 'posix':
            patch = mock.patch.object(b.os, 'O_NOFOLLOW', 0, create=True)
            patch.start()
            self.addCleanup(patch.stop)

    def marker(self, **changes):
        now = int(time.time())
        value = {'service': b.APP, 'original_replicas': 1,
                 'started_at': now, 'deadline': now + 180}
        value.update(changes)
        self.executor.marker.write_text(json.dumps(value))
        return value

    def test_recover_missing_marker_never_scales(self):
        with mock.patch.object(self.executor, 'scale') as scale:
            self.executor.recover()
        scale.assert_not_called()
        self.assertFalse((self.root / 'last_backup.json').exists())

    def test_recover_expired_marker_restores_original_and_waits(self):
        self.marker(started_at=100, deadline=280)
        with mock.patch.object(self.executor, 'scale') as scale, \
                mock.patch.object(self.executor, 'wait') as wait, \
                mock.patch.object(b, 'sync_dir'):
            self.executor.recover()
        scale.assert_called_once_with(1)
        wait.assert_called_once_with(1)
        self.assertFalse(self.executor.marker.exists())
        self.assertTrue(json.loads((self.root / 'last_backup.json').read_text())['failed'])

    def test_recover_preserves_original_zero(self):
        self.marker(original_replicas=0)
        with mock.patch.object(self.executor, 'scale') as scale, \
                mock.patch.object(self.executor, 'wait') as wait, mock.patch.object(b, 'sync_dir'):
            self.executor.recover()
        scale.assert_called_once_with(0)
        wait.assert_called_once_with(0)

    def test_recover_invalid_markers_never_touch_service(self):
        for changes in ({'service': b.PG}, {'original_replicas': True},
                        {'original_replicas': 2}, {'started_at': 100, 'deadline': 281},
                        {'started_at': 'invalid'}, {'unexpected': 'secret'}):
            with self.subTest(changes=changes):
                self.marker(**changes)
                with mock.patch.object(self.executor, 'scale') as scale:
                    with self.assertRaises((b.Failure, TypeError)):
                        self.executor.recover()
                    scale.assert_not_called()

    def test_recover_malformed_json_never_scales(self):
        self.executor.marker.write_text('{')
        with mock.patch.object(self.executor, 'scale') as scale:
            with self.assertRaises(b.StageFailure):
                self.executor.recover()
        scale.assert_not_called()

    def test_failed_health_keeps_durable_marker(self):
        self.marker()
        with mock.patch.object(self.executor, 'scale'), \
                mock.patch.object(self.executor, 'wait', side_effect=b.Failure):
            with self.assertRaises(b.Failure):
                self.executor.recover()
        self.assertTrue(self.executor.marker.exists())

    def test_pause_writes_marker_before_scale(self):
        seen = []

        def scale(replicas):
            seen.append(json.loads(self.executor.marker.read_text()))
            self.assertEqual(replicas, 0)

        with mock.patch.object(self.executor, 'replicas', return_value=1), \
                mock.patch.object(self.executor, 'scale', side_effect=scale), \
                mock.patch.object(self.executor, 'wait'), mock.patch.object(b, 'sync_dir'):
            self.executor.pause()
        self.assertEqual(seen[0]['original_replicas'], 1)
        self.assertLessEqual(seen[0]['deadline'] - seen[0]['started_at'], 180)

    def test_shutdown_desired_does_not_mean_tasks_ended(self):
        task = {'Status': {'State': 'running'}, 'DesiredState': 'shutdown'}
        with mock.patch.object(self.executor, 'run', return_value='a' * 25), \
                mock.patch.object(self.executor, 'docker_json', return_value=[task]), \
                mock.patch.object(self.executor, 'containers', return_value=[]), \
                mock.patch.object(self.executor, 'replicas', return_value=0):
            self.assertFalse(self.executor.settled(0))
            task['Status']['State'] = 'shutdown'
            self.assertTrue(self.executor.settled(0))

    def test_shutdown_task_but_container_still_running_is_not_settled(self):
        with mock.patch.object(self.executor, 'run', return_value=''), \
                mock.patch.object(self.executor, 'containers', return_value=[{'State': {'Running': True}}]):
            self.assertFalse(self.executor.settled(0))

    def test_resume_needs_healthy_local_task(self):
        task = {'Status': {'State': 'running'}, 'DesiredState': 'running', 'NodeID': 'local'}
        container = {'State': {'Running': True, 'Health': {'Status': 'starting'}}}
        with mock.patch.object(self.executor, 'run', side_effect=['a' * 25, 'local'] * 2), \
                mock.patch.object(self.executor, 'docker_json', return_value=[task]), \
                mock.patch.object(self.executor, 'containers', return_value=[container]), \
                mock.patch.object(self.executor, 'replicas', return_value=1):
            self.assertFalse(self.executor.settled(1))
            container['State']['Health']['Status'] = 'healthy'
            self.assertTrue(self.executor.settled(1))

    def test_deadline_stops_command_before_spawn(self):
        self.executor.deadline = time.monotonic() - 1
        with mock.patch.object(b.subprocess, 'run') as run:
            with self.assertRaises(b.Failure):
                self.executor.run(['docker', 'ps'])
        run.assert_not_called()

    def test_subprocess_timeout_and_stderr_are_private(self):
        with mock.patch.object(b.subprocess, 'run', return_value=mock.Mock(stdout=b'ok')) as run:
            self.assertEqual(self.executor.run(['docker', 'ps']), 'ok')
        self.assertEqual(run.call_args.kwargs['stderr'], subprocess.DEVNULL)
        self.assertEqual(run.call_args.kwargs['stdin'], subprocess.DEVNULL)
        self.assertLessEqual(run.call_args.kwargs['timeout'], 120)
        self.assertNotIn('PGPASSWORD', run.call_args.kwargs['env'])

    def backup_mocks(self, events, failure=None, resume_failure=False):
        stack = contextlib.ExitStack()
        calls = iter([False, True])

        def recover(interrupted=True):
            if next(calls):
                events.append('resume')
                if resume_failure:
                    raise b.Failure()

        def capture(stage):
            events.append('capture')
            if failure == 'capture':
                raise b.Failure()
            (stage / 'backup.tar').write_bytes(b'archive')
            return '2026-10-06T10:00:00Z'

        def encrypt(args):
            events.append('encrypt')
            if failure == 'encrypt':
                raise b.Failure()
            Path(args[args.index('--output') + 1]).write_bytes(b'ciphertext')

        def upload(*args):
            events.append('upload')
            if failure == 'upload':
                raise b.Failure()
            return {'captured_at': args[3], 'verified_at': '2026-10-06T12:00:00Z',
                    'name': args[2], 'size': 10, 'sha256': 'a' * 64, 'failed': False}

        stack.enter_context(mock.patch.object(b, 'config', return_value=SETTINGS.copy()))
        stack.enter_context(mock.patch.object(self.executor, 'recover', side_effect=recover))
        stack.enter_context(mock.patch.object(self.executor, 'pause', side_effect=lambda: events.append('pause')))
        stack.enter_context(mock.patch.object(self.executor, 'capture', side_effect=capture))
        stack.enter_context(mock.patch.object(self.executor, 'run', side_effect=encrypt))
        stack.enter_context(mock.patch.object(b, 'upload', side_effect=upload))
        stack.enter_context(mock.patch.object(b, 'sync_dir'))
        return stack

    def test_backup_resumes_before_encrypt_and_upload(self):
        events = []
        with self.backup_mocks(events):
            result = self.executor.backup()
        self.assertEqual(events, ['pause', 'capture', 'resume', 'encrypt', 'upload'])
        self.assertEqual(json.loads((self.root / 'last_backup.json').read_text()), result)
        self.assertEqual(set(result), {'captured_at', 'verified_at', 'name', 'size', 'sha256', 'failed'})
        self.assertFalse(list(self.root.glob('staging-*')))

    def test_failures_resume_and_preserve_previous_success(self):
        for failure in ('capture', 'encrypt', 'upload'):
            with self.subTest(failure=failure):
                state = self.root / 'last_backup.json'
                previous = {'captured_at': '2026-10-05T10:00:00Z',
                            'verified_at': '2026-10-05T12:00:00Z', 'name': NAME,
                            'size': 10, 'sha256': 'a' * 64, 'failed': False}
                state.write_text(json.dumps(previous))
                events = []
                with self.backup_mocks(events, failure):
                    with self.assertRaises(b.Failure):
                        self.executor.backup()
                self.assertIn('resume', events)
                self.assertEqual(json.loads(state.read_text()), {**previous, 'failed': True})
                self.assertFalse(list(self.root.glob('staging-*')))
                if failure == 'capture':
                    self.assertNotIn('upload', events)

    def test_resume_failure_prevents_upload(self):
        events = []
        with self.backup_mocks(events, resume_failure=True):
            with self.assertRaises(b.Failure):
                self.executor.backup()
        self.assertNotIn('encrypt', events)
        self.assertNotIn('upload', events)

    def test_scale_failure_still_attempts_recover(self):
        events = []
        with self.backup_mocks(events), \
                mock.patch.object(self.executor, 'pause', side_effect=b.Failure):
            with self.assertRaises(b.Failure):
                self.executor.backup()
        self.assertEqual(events, ['resume'])

    def test_pg_dump_secret_only_read_in_container(self):
        def run(args, output):
            output.write(b'PGDMP')
            self.assertEqual(args[:4], ['docker', 'exec', 'cid', 'sh'])
            self.assertIn('/run/secrets/pg_admin_password', args[-1])
            self.assertIn('PGPASSWORD=', args[-1])
            self.assertIn('psql -X -w', args[-1])
            self.assertIn('pg_dump -w', args[-1])
            self.assertNotIn(SETTINGS['uploader_password'], str(args))

        with mock.patch.object(self.executor, 'container', return_value='cid'), \
                mock.patch.object(self.executor, 'run', side_effect=run):
            self.executor.pg_dump(self.root)

    def test_redis_auth_not_on_command_line(self):
        with mock.patch.object(self.executor, 'run', return_value='PONG') as run:
            self.assertEqual(self.executor.redis('cid', 'PING'), 'PONG')
        args = run.call_args.args[0]
        self.assertIn('REDISCLI_AUTH=', args[5])
        self.assertIn('/run/secrets/redis_password', args[5])
        self.assertEqual(args[-2:], ['kan133', 'PING'])
        self.assertNotIn('-a', args)

    def redis_snapshot(self, changed=False, status='ok'):
        def redis(cid, *command):
            if command == ('TIME',):
                return '101\n0'
            if command == ('BGSAVE',):
                return 'Background saving started'
            return next(saves)

        saves = iter(['100', '101', '102' if changed else '101'])
        infos = [{'rdb_bgsave_in_progress': '0'},
                 {'rdb_bgsave_in_progress': '0', 'rdb_last_bgsave_status': status},
                 {'rdb_bgsave_in_progress': '0'}]
        stack = contextlib.ExitStack()
        stack.enter_context(mock.patch.object(self.executor, 'container', return_value='cid'))
        stack.enter_context(mock.patch.object(self.executor, 'redis', side_effect=redis))
        stack.enter_context(mock.patch.object(self.executor, 'redis_info', side_effect=infos))
        stack.enter_context(mock.patch.object(self.executor, 'run', side_effect=lambda args:
                            Path(args[-1]).write_bytes(b'REDIS0009snapshot')))
        return stack

    def test_redis_snapshot_copy_after_lastsave(self):
        with self.redis_snapshot():
            self.executor.redis_dump(self.root)
        self.assertTrue((self.root / 'redis.rdb').read_bytes().startswith(b'REDIS'))

    def test_redis_changed_snapshot_or_failed_save_is_rejected(self):
        for kwargs in ({'changed': True}, {'status': 'err'}):
            with self.subTest(kwargs=kwargs), self.redis_snapshot(**kwargs):
                with self.assertRaises(b.Failure):
                    self.executor.redis_dump(self.root)

    def test_volume_inspection_rejects_unknown_mountpoint(self):
        with mock.patch.object(self.executor, 'docker_json', return_value=[{
                'Name': b.VOLUME, 'Driver': 'local', 'Mountpoint': '/etc'}]):
            with self.assertRaises(b.Failure):
                self.executor.sessions()

    def test_archive_rejects_traversal_and_pgdata(self):
        source = self.root / 'file'
        source.write_bytes(b'content')
        with tarfile.open(self.root / 'out.tar', 'w') as archive:
            for name in ('../secret', '/etc/secret', 'safe/../../secret', 'safe//file', 'bad\nfile'):
                with self.subTest(name=name), self.assertRaises(b.Failure):
                    self.executor.add_tree(archive, source, name)
            directory = self.root / 'data'
            directory.mkdir()
            (directory / 'PG_VERSION').write_text('17')
            with self.assertRaises(b.Failure):
                self.executor.add_tree(archive, directory, 'safe')

    def test_archive_regular_files_roundtrip(self):
        source = self.root / 'file'
        source.write_bytes(b'secret encrypted later')
        with tarfile.open(self.root / 'out.tar', 'w') as archive:
            self.executor.add_tree(archive, source, 'etc/file')
        with tarfile.open(self.root / 'out.tar') as archive:
            self.assertEqual(archive.extractfile('etc/file').read(), source.read_bytes())

    @unittest.skipUnless(os.name == 'posix', 'Unix links and metadata')
    def test_archive_rejects_symlink_and_hardlink(self):
        source = self.root / 'file'
        source.write_bytes(b'not followed')
        link = self.root / 'link'
        link.symlink_to(source)
        with tarfile.open(self.root / 'out.tar', 'w') as archive:
            with self.assertRaises(b.Failure):
                self.executor.add_tree(archive, link, 'safe')
            link.unlink()
            os.link(source, link)
            with self.assertRaises(b.Failure):
                self.executor.add_tree(archive, source, 'safe')

    def test_config_rejects_service_role_unknown_keys_and_unsafe_url(self):
        for changes in ({'anon_key': token('service_role')}, {'service_role': 'forbidden'},
                        {'supabase_url': 'http://test.supabase.co'},
                        {'supabase_url': 'https://user:pass@test.supabase.co'},
                        {'recipient': '-malicious-option'}):
            with self.subTest(changes=changes), \
                    mock.patch.object(b, 'read_json', return_value={**SETTINGS, **changes}):
                with self.assertRaises(b.Failure):
                    b.config()

    def test_config_accepts_only_scoped_inputs(self):
        with mock.patch.object(b, 'read_json', return_value=SETTINGS.copy()):
            self.assertEqual(b.config(), SETTINGS)

    def test_modern_publishable_key_accepted(self):
        settings = {**SETTINGS, 'anon_key': 'sb_publishable_' + 'offline_public_key_' * 2}
        with mock.patch.object(b, 'read_json', return_value=settings):
            self.assertEqual(b.config(), settings)

    def test_secret_service_role_and_malformed_public_keys_rejected(self):
        for key in ('sb_secret_' + 'offline_secret_' * 2, token('service_role'),
                    'sb_publishable_', 'sb_publishable_short',
                    'sb_publishable_' + 'x' * 32 + '\n',
                    'sb_publishable_' + 'x' * 32 + '.secret'):
            with self.subTest(key=key), mock.patch.object(b, 'read_json', return_value={
                    **SETTINGS, 'anon_key': key}):
                with self.assertRaises(b.Failure):
                    b.config()

    def test_modern_key_storage_login_and_verify_contract(self):
        settings = {**SETTINGS, 'anon_key': 'sb_publishable_' + 'offline_public_key_' * 2}
        ciphertext = self.root / 'test.age'
        ciphertext.write_bytes(b'ciphertext')
        response = json.dumps({'access_token': token('authenticated')}).encode()
        with mock.patch.object(b, 'request', side_effect=[response, b'{}', b'ciphertext']) as request:
            result = b.upload(settings, ciphertext, NAME, '2026-10-06T10:00:00Z')
        self.assertFalse(result['failed'])
        for call in request.call_args_list:
            self.assertEqual(call.args[2]['apikey'], settings['anon_key'])

    def test_classified_stage_failures_never_reveal_exception_contents(self):
        secret = SETTINGS['uploader_password']
        for error, code in ((subprocess.CalledProcessError(1, [secret], stderr=secret), 'command_failed'),
                            (subprocess.TimeoutExpired([secret], 1, stderr=secret), 'command_timeout'),
                            (FileNotFoundError(secret), 'dependency_missing'),
                            (PermissionError(secret), 'filesystem_denied'),
                            (ValueError(secret), 'invalid_data'),
                            (b.urllib.error.URLError(secret), 'network_failed')):
            with self.subTest(code=code):
                output = io.StringIO()

                def fail():
                    with b.gate('pg_dump'):
                        raise error

                with mock.patch.object(b, 'locked', return_value=contextlib.nullcontext()), \
                        mock.patch.object(b.Executor, 'backup', side_effect=fail), \
                        contextlib.redirect_stdout(output):
                    self.assertEqual(b.main(['backup']), 1)
                self.assertEqual(json.loads(output.getvalue()),
                                 {'status': 'error', 'command': 'backup', 'code': code, 'stage': 'pg_dump'})
                self.assertNotIn(secret, output.getvalue())

    def test_shared_provisioned_config_is_compatible(self):
        shared = {**SETTINGS, 'uploader_id': 'offline-id', 'bucket': b.BUCKET,
                  'telegram_token': 'FAKE-MONITOR-TOKEN', 'telegram_chat_id': '-123'}
        with mock.patch.object(b, 'read_json', return_value=shared):
            self.assertEqual(b.config(), SETTINGS)
        with mock.patch.object(b, 'read_json', return_value={**shared, 'bucket': 'production'}):
            with self.assertRaises(b.Failure):
                b.config()

    def test_config_bound_to_exact_supabase_project(self):
        for url in ('https://other.supabase.co', 'https://' + b.SUPABASE_HOST + '.evil.invalid',
                    'https://' + b.SUPABASE_HOST + '/extra',
                    'https://' + b.SUPABASE_HOST + ':8443'):
            with self.subTest(url=url), mock.patch.object(b, 'read_json', return_value={
                    **SETTINGS, 'supabase_url': url}):
                with self.assertRaises(b.Failure):
                    b.config()

    def test_failure_preserves_iso8601_fractional_offset_timestamps(self):
        previous = {'captured_at': '2026-10-05T10:00:00.123456+00:00',
                    'verified_at': '2026-10-05T12:00:00.654321Z', 'name': NAME,
                    'size': 10, 'sha256': 'a' * 64, 'failed': False}
        path = self.root / 'last_backup.json'
        path.write_text(json.dumps(previous))
        with mock.patch.object(b, 'sync_dir'):
            self.executor.record_failure()
        self.assertEqual(json.loads(path.read_text()), {**previous, 'failed': True})

    def test_invalid_cli_is_sanitized_json(self):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            self.assertEqual(b.main([SETTINGS['uploader_password']]), 1)
        self.assertEqual(json.loads(output.getvalue()),
                         {'status': 'error', 'command': None, 'code': 'invalid_command'})

    def test_upload_login_immutable_and_full_hash_verification(self):
        ciphertext = self.root / 'test.age'
        ciphertext.write_bytes(b'ciphertext')
        response = json.dumps({'access_token': token('authenticated')}).encode()
        for _ in range(2):
            with mock.patch.object(b, 'request', side_effect=[response, b'{}', b'ciphertext']) as request:
                result = b.upload(SETTINGS, ciphertext, NAME, '2026-10-06T10:00:00Z')
            calls = request.call_args_list
            self.assertIn('/auth/v1/token?grant_type=password', calls[0].args[0])
            self.assertEqual(calls[1].args[1], 'POST')
            self.assertEqual(calls[1].args[2]['x-upsert'], 'false')
            self.assertIn('/object/authenticated/' + b.BUCKET, calls[2].args[0])
            self.assertEqual(calls[2].args[1], 'GET')
            self.assertEqual(result['sha256'], b.hashlib.sha256(b'ciphertext').hexdigest())
            self.assertIs(result['failed'], False)
            self.assertNotIn('DELETE', str(calls))

    def test_hash_and_length_mismatch_fail(self):
        ciphertext = self.root / 'test.age'
        ciphertext.write_bytes(b'ciphertext')
        response = json.dumps({'access_token': token('authenticated')}).encode()
        for data in (b'ciphertexX', b'ciphertext-extra', b''):
            with self.subTest(data=data), \
                    mock.patch.object(b, 'request', side_effect=[response, b'{}', data]):
                with self.assertRaises(b.Failure):
                    b.upload(SETTINGS, ciphertext, NAME, '2026-10-06T10:00:00Z')

    def test_oversize_rejected_before_network(self):
        ciphertext = self.root / 'test.age'
        ciphertext.write_bytes(b'12345')
        with mock.patch.object(b, 'MAX_SIZE', 4), mock.patch.object(b, 'request') as request:
            with self.assertRaises(b.Failure):
                b.upload(SETTINGS, ciphertext, NAME, '2026-10-06T10:00:00Z')
        request.assert_not_called()

    def test_unscoped_or_unsafe_object_name_rejected(self):
        ciphertext = self.root / 'test.age'
        ciphertext.write_bytes(b'ciphertext')
        for name in ('production/file.age', b.PREFIX + '../file.age',
                     b.PREFIX + '20261006T120000Z-' + '-' * 36 + '.age'):
            with self.subTest(name=name), mock.patch.object(b, 'request') as request:
                with self.assertRaises(b.Failure):
                    b.upload(SETTINGS, ciphertext, name, '2026-10-06T10:00:00Z')
                request.assert_not_called()

    def test_login_failure_or_privileged_token_never_uploads(self):
        ciphertext = self.root / 'test.age'
        ciphertext.write_bytes(b'ciphertext')
        for effect in (OSError('offline'), [json.dumps({'access_token': token('service_role')}).encode()]):
            with self.subTest(effect=effect), mock.patch.object(b, 'request', side_effect=effect) as request:
                with self.assertRaises((b.Failure, OSError)):
                    b.upload(SETTINGS, ciphertext, NAME, '2026-10-06T10:00:00Z')
                self.assertEqual(request.call_count, 1)

    def test_network_no_redirects_proxy_or_unbounded_read(self):
        response = mock.MagicMock()
        response.__enter__.return_value = response
        response.status = 200
        response.read.return_value = b'12345'
        opener = mock.Mock()
        opener.open.return_value = response
        with mock.patch.object(b.urllib.request, 'build_opener', return_value=opener) as build:
            with self.assertRaises(b.Failure):
                b.request('https://test.supabase.co', 'GET', {}, limit=4)
        response.read.assert_called_once_with(5)
        self.assertIsInstance(build.call_args.args[1], b.NoRedirect)
        with self.assertRaises(b.Failure):
            b.NoRedirect().redirect_request(None, None, 302, '', {}, 'https://evil.invalid')

    def test_rpo_uses_capture_not_recent_verification(self):
        now = 1800000000
        for hours, expected in ((0, 'ok'), (17, 'ok'), (18, 'warning'), (24, 'critical'), (30, 'critical')):
            with self.subTest(hours=hours):
                state = {'captured_at': b.stamp(now - hours * 3600), 'verified_at': b.stamp(now)}
                self.assertEqual(b.backup_freshness(state, now), expected)
        for state in (None, {}, {'captured_at': 'invalid'},
                      {'captured_at': b.stamp(now + 1), 'verified_at': b.stamp(now)},
                      {'captured_at': b.stamp(now), 'verified_at': b.stamp(now + 1)}):
            self.assertEqual(b.backup_freshness(state, now), 'critical')

    def test_cli_exception_never_outputs_secret(self):
        output = io.StringIO()
        with mock.patch.object(b, 'locked', side_effect=RuntimeError(SETTINGS['uploader_password'])), \
                contextlib.redirect_stdout(output):
            self.assertEqual(b.main(['backup']), 1)
        self.assertEqual(json.loads(output.getvalue()),
                         {'status': 'error', 'command': 'backup', 'code': 'operation_failed', 'stage': 'lock'})

    def test_first_failure_does_not_create_fake_verified_timestamps(self):
        with mock.patch.object(b, 'sync_dir'):
            self.executor.record_failure()
        self.assertEqual(json.loads((self.root / 'last_backup.json').read_text()), {'failed': True})

    def test_capture_matches_restore_contract(self):
        recorded = []
        with mock.patch.object(self.executor, 'pg_dump'), \
                mock.patch.object(self.executor, 'redis_dump'), \
                mock.patch.object(self.executor, 'sessions', return_value=Path('/mock/sessions')), \
                mock.patch.object(self.executor, 'add_tree', side_effect=lambda archive, path, name:
                                  recorded.append((str(path), name))):
            self.executor.capture(self.root)
        names = [name for path, name in recorded]
        self.assertEqual(names[:3], ['postgres.dump', 'redis.rdb', 'evolution-instances'])
        self.assertIn('config/evolution-qa', names)
        self.assertIn('config/easypanel', names)
        self.assertIn('config/kan133/config.json', names)
        for filename in b.SCRIPTS:
            self.assertIn('config/kan132/' + filename, names)

    def test_recover_does_not_require_config_or_network(self):
        self.marker()
        with mock.patch.object(self.executor, 'scale'), mock.patch.object(self.executor, 'wait'), \
                mock.patch.object(b, 'sync_dir'), mock.patch.object(b, 'config') as config, \
                mock.patch.object(b, 'request') as request:
            self.executor.recover()
        config.assert_not_called()
        request.assert_not_called()

    def test_internal_resume_never_cleans_active_staging_or_marks_failure(self):
        self.marker()
        with mock.patch.object(self.executor, 'scale'), mock.patch.object(self.executor, 'wait'), \
                mock.patch.object(self.executor, 'record_failure') as failure:
            self.executor.recover(interrupted=False)
        self.executor.cleanup_orphans.assert_not_called()
        failure.assert_not_called()

    def test_busy_recover_timer_returns_success_skip(self):
        output = io.StringIO()
        with mock.patch.object(b, 'locked', side_effect=b.LockBusy), \
                contextlib.redirect_stdout(output):
            self.assertEqual(b.main(['recover']), 0)
        self.assertEqual(json.loads(output.getvalue()),
                         {'status': 'skipped', 'command': 'recover', 'code': 'lock_busy'})

    def test_orphan_cleanup_strict_ownership_and_links(self):
        root = mock.MagicMock()
        root.resolve.return_value = root
        stage = mock.MagicMock()
        stage.name = 'staging-abcdefgh'
        stage.parent = root
        stage.resolve.return_value = stage
        stage.lstat.return_value = mock.Mock(st_uid=0, st_mode=stat.S_IFDIR | 0o700)
        root.iterdir.return_value = [stage]
        file = mock.MagicMock()
        file.lstat.return_value = mock.Mock(st_uid=0, st_mode=stat.S_IFREG | 0o600, st_nlink=1)
        stage.iterdir.return_value = [file]
        executor = b.Executor(self.root)
        executor.root = root
        with mock.patch.object(b.shutil, 'rmtree') as remove:
            remove.avoids_symlink_attacks = True
            executor.cleanup_orphans()
            remove.assert_called_once_with(stage)
        for mode, uid in ((stat.S_IFLNK | 0o700, 0), (stat.S_IFDIR | 0o755, 0),
                          (stat.S_IFDIR | 0o700, 1000)):
            stage.lstat.return_value = mock.Mock(st_uid=uid, st_mode=mode)
            with mock.patch.object(b.shutil, 'rmtree') as remove, self.assertRaises(b.Failure):
                executor.cleanup_orphans()
            remove.assert_not_called()
        stage.lstat.return_value = mock.Mock(st_uid=0, st_mode=stat.S_IFDIR | 0o700)
        file.lstat.return_value = mock.Mock(st_uid=0, st_mode=stat.S_IFLNK | 0o777)
        with mock.patch.object(b.shutil, 'rmtree') as remove, self.assertRaises(b.Failure):
            executor.cleanup_orphans()
        remove.assert_not_called()
        stage.name = 'staging-../outside'
        with mock.patch.object(b.shutil, 'rmtree') as remove:
            executor.cleanup_orphans()
        remove.assert_not_called()


@unittest.skipUnless(os.name == 'posix' and hasattr(os, 'geteuid') and os.geteuid() == 0,
                     'Requires Linux root for actual uid, flock and fsync assertions')
class LinuxRootTests(unittest.TestCase):
    def test_private_permissions_atomic_state_and_real_flock(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / 'state'
            with b.locked(root):
                self.assertEqual(root.stat().st_mode & 0o777, 0o700)
                with self.assertRaises(b.LockBusy):
                    with b.locked(root):
                        pass
                path = root / 'state.json'
                b.atomic_json(path, {'nonsecret': True})
                self.assertEqual(path.stat().st_mode & 0o777, 0o600)
                self.assertEqual(b.read_json(path), {'nonsecret': True})
                path.chmod(0o644)
                with self.assertRaises(b.Failure):
                    b.read_json(path)
                path.unlink()
                path.symlink_to(root / 'backup.lock')
                with self.assertRaises(OSError):
                    b.read_json(path)
                path.unlink()
                stage = root / 'staging-abcdefgh'
                stage.mkdir(mode=0o700)
                (stage / 'backup.tar').write_bytes(b'orphan plaintext')
                b.Executor(root).recover()
                self.assertFalse(stage.exists())
                self.assertFalse((root / 'last_backup.json').exists())
                stage.mkdir(mode=0o700)
                outside = root.parent / 'sentinel'
                outside.write_bytes(b'never delete')
                (stage / 'link').symlink_to(outside)
                with self.assertRaises(b.Failure):
                    b.Executor(root).recover()
                self.assertTrue(outside.exists())


if __name__ == '__main__':
    unittest.main()
