import contextlib
import io
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch
import urllib.error

import scheduler as s


class FakeFlock:
    """Exercise contention control flow on Windows; real kernel test below."""
    LOCK_EX, LOCK_NB, LOCK_UN = 1, 2, 4

    def __init__(self):
        self.held = set()

    def flock(self, stream, flags):
        name = stream.name
        if flags == self.LOCK_UN:
            self.held.remove(name)
        elif name in self.held:
            raise BlockingIOError()
        else:
            self.held.add(name)


class SchedulerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.now = 1780995600.0
        self.config = {'whatsapp_enabled': True, 'billing_enabled': False}
        for job in s.PATHS:
            secret = self.root / (job + '.token')
            secret.write_text('dedicated-' + job)
            secret.chmod(0o600)
            self.config[job + '_secret_file'] = str(secret)
        self.flock = FakeFlock()
        self.patch = patch.object(s, 'fcntl', self.flock)
        self.patch.start()
        self.addCleanup(self.patch.stop)
        # Windows chmod does not implement POSIX mode 600; only mode validation
        # is adapted in portable tests, with native Linux coverage below.
        if os.name != 'posix':
            p = patch.object(s, 'private_read', lambda path: Path(path).read_text())
            p.start()
            self.addCleanup(p.stop)
        self.request = Mock(return_value=(200, {'ok': True}))

    def run_job(self, job='whatsapp', **kwargs):
        return s.run(job, self.config, self.root, lambda: self.now, self.request, **kwargs)

    def state(self, job='whatsapp'):
        return s.read_state(self.root / (job + '.json'))

    def test_post_fixed_path_dedicated_bearer_and_no_body_persistence(self):
        self.assertEqual(self.run_job(), 'success')
        self.request.assert_called_once_with(s.ORIGIN + s.PATHS['whatsapp'],
            {'Authorization': 'Bearer dedicated-whatsapp', 'Accept': 'application/json'}, b'')
        text = (self.root / 'whatsapp.json').read_text()
        self.assertNotIn('dedicated', text)
        self.assertNotIn('Authorization', text)
        self.assertEqual(self.run_job(), 'already-finished')
        self.now += 60
        self.assertEqual(self.run_job(), 'success')

    def test_billing_disabled_and_daily_slot(self):
        self.assertEqual(self.run_job('billing'), 'disabled')
        self.request.assert_not_called()
        self.config['billing_enabled'] = True
        self.assertEqual(self.run_job('billing'), 'success')
        self.assertEqual(self.run_job('billing'), 'already-finished')
        self.now += 86400
        self.assertEqual(self.run_job('billing'), 'success')
        self.assertEqual(self.request.call_args.args[1]['Authorization'], 'Bearer dedicated-billing')

    def test_billing_utc_boundary(self):
        import datetime as dt
        before = dt.datetime(2026, 10, 8, 8, 59, tzinfo=dt.timezone.utc).timestamp()
        self.assertEqual(s.slot('billing', before + 60) - s.slot('billing', before), 86400)

    def test_409_skipped_both_http_forms(self):
        for response in [(409, {'ok': True}), urllib.error.HTTPError('hidden', 409, 'hidden', {}, None)]:
            self.now += 60
            if isinstance(response, Exception):
                self.request.side_effect = response
            else:
                self.request.return_value = response
            self.assertEqual(self.run_job(), 'skipped')
            self.assertIsNone(self.state()['last_healthy_at'])

    def test_repeated_skip_does_not_hide_lateness(self):
        started = self.now
        self.request.return_value = (409, {'ok': True, 'skipped': True})
        for _ in range(5):
            self.run_job()
            self.now += 60
        self.assertIn('whatsapp:late', s.active_incidents(self.config, self.root, self.now, started))

    def test_preview_bypass_only_exact_preview_not_production(self):
        token = self.root / 'preview.token'
        token.write_text('PRIVATE-BYPASS')
        token.chmod(0o600)
        self.config['preview_bypass_secret_file'] = str(token)
        self.run_job()
        self.assertNotIn('x-vercel-protection-bypass', self.request.call_args.args[1])
        self.now += 60
        self.config['origin'] = 'https://clicaepedeofc-git-approved.vercel.app'
        self.run_job()
        self.assertEqual(self.request.call_args.args[1]['x-vercel-protection-bypass'], 'PRIVATE-BYPASS')
        self.assertTrue(self.request.call_args.args[0].startswith(self.config['origin'] + '/api/cron/'))
        self.assertNotIn('PRIVATE-BYPASS', (self.root / 'whatsapp.json').read_text())

    def test_disabled_job_keeps_interrupted_incident_visible(self):
        s.atomic(self.root / 'billing.json', {'status': 'running', 'started_at': self.now - 121})
        self.assertIn('billing:interrupted', s.active_incidents(self.config, self.root, self.now, self.now))

    def test_auth_permanent_block_restart_and_explicit_reset(self):
        self.request.side_effect = urllib.error.HTTPError('SECRET', 401, 'PII', {}, None)
        self.assertEqual(self.run_job(), 'auth')
        self.now += 600
        self.assertEqual(self.run_job(), 'blocked')
        self.assertEqual(self.request.call_count, 1)
        dead = (self.root / 'whatsapp.dead-letter.json').read_text()
        self.assertNotIn('SECRET', dead)
        self.assertNotIn('PII', dead)
        self.assertEqual(self.run_job(reset=True), 'reset')
        self.request.side_effect = None
        self.assertEqual(self.run_job(), 'success')

    def test_403_also_permanent(self):
        self.request.return_value = (403, {})
        self.assertEqual(self.run_job(), 'auth')
        self.assertTrue(self.state()['blocked'])

    def test_preconnect_backoff_persisted_and_exhausted(self):
        self.request.side_effect = urllib.error.URLError(socket.gaierror('private'))
        self.assertEqual(self.run_job(), 'preconnect')
        self.assertEqual(self.state()['next_at'], self.now + 60)
        self.assertEqual(self.run_job(), 'backoff')
        self.now += 60
        self.assertEqual(s.retry(self.config, self.root, lambda: self.now, self.request), {'whatsapp': 'preconnect'})
        self.assertEqual(self.state()['next_at'], self.now + 120)
        self.now += 119
        self.assertEqual(self.run_job(), 'backoff')
        self.now += 1
        self.assertEqual(self.run_job(), 'preconnect')
        self.assertEqual(self.state()['status'], 'terminal')
        self.assertEqual(self.state()['attempts'], 3)
        self.assertEqual(self.request.call_count, 3)
        self.assertEqual(s.retry(self.config, self.root, lambda: self.now, self.request), {})

    def test_connection_refused_retryable(self):
        self.request.side_effect = urllib.error.URLError(ConnectionRefusedError())
        self.assertEqual(self.run_job(), 'preconnect')
        self.assertEqual(self.state()['status'], 'retry')

    def test_ambiguous_and_app_failure_never_blind_retry(self):
        for response in [(200, {'ok': False, 'phone': 'PII'}), (200, {}), (503, {}),
                         (429, {}), TimeoutError('token'), urllib.error.URLError(TimeoutError()),
                         ValueError('invalid JSON'), (302, {})]:
            with self.subTest(response=type(response).__name__):
                self.now += 60
                self.request.reset_mock(side_effect=True)
                if isinstance(response, Exception):
                    self.request.side_effect = response
                else:
                    self.request.return_value = response
                self.run_job()
                self.assertEqual(self.state()['status'], 'terminal')
                self.assertEqual(self.run_job(), 'already-finished')
                self.assertEqual(self.request.call_count, 1)
                self.assertNotIn('PII', (self.root / 'whatsapp.json').read_text())

    def test_restart_running_is_quarantined_not_replayed(self):
        def interrupted(*args):
            raise KeyboardInterrupt()
        self.request.side_effect = interrupted
        with self.assertRaises(KeyboardInterrupt):
            self.run_job()
        self.assertEqual(self.state()['status'], 'running')
        self.now += 60
        self.assertEqual(self.run_job(), 'interrupted')
        self.assertEqual(self.request.call_count, 1)
        self.assertEqual(s.read_state(self.root / 'whatsapp.dead-letter.json')['reason'], 'interrupted')
        self.request.side_effect = None
        self.assertEqual(self.run_job(), 'success')

    def test_contention_and_separate_job_locks(self):
        with s.locked(self.root, 'whatsapp'):
            with self.assertRaises(s.Busy):
                self.run_job()
            self.request.assert_not_called()
            with s.locked(self.root, 'billing'):
                pass
        self.assertEqual(self.run_job(), 'success')

    def test_retry_race_does_not_create_new_slot(self):
        self.assertEqual(self.run_job(), 'success')
        self.now += 60
        self.assertEqual(self.run_job(retry_only=True), 'no-retry')
        self.assertEqual(self.request.call_count, 1)

    def test_atomic_replace_failure_preserves_old_state(self):
        path = self.root / 'atomic.json'
        s.atomic(path, {'old': True})
        with patch.object(s.os, 'replace', side_effect=OSError('failure')):
            with self.assertRaises(OSError):
                s.atomic(path, {'new': True})
        self.assertEqual(s.read_state(path), {'old': True})
        self.assertFalse(list(self.root.glob('.atomic.json*')))

    def test_monitor_late_failure_recovery_dedup_and_private_delivery(self):
        send = Mock()
        self.assertEqual(s.monitor(self.config, self.root, lambda: self.now, send)['active'], [])
        self.now += 181
        s.monitor(self.config, self.root, lambda: self.now, send)
        send.assert_called_once_with('incident:whatsapp:late', self.config)
        s.monitor(self.config, self.root, lambda: self.now, send)
        self.assertEqual(send.call_count, 1)
        self.run_job()
        s.monitor(self.config, self.root, lambda: self.now, send)
        self.assertEqual(send.call_args.args[0], 'recovery:whatsapp:late')
        self.request.return_value = (401, {})
        self.now += 60
        self.run_job()
        self.assertIn('whatsapp:failure', s.active_incidents(self.config, self.root, self.now, self.now))

    def test_alert_failure_backoff_and_terminal_persisted(self):
        send = Mock(side_effect=RuntimeError('SECRET'))
        self.request.return_value = (401, {})
        self.run_job()
        s.monitor(self.config, self.root, lambda: self.now, send)
        s.monitor(self.config, self.root, lambda: self.now, send)
        self.assertEqual(send.call_count, 1)
        self.now += 60
        s.monitor(self.config, self.root, lambda: self.now, send)
        self.now += 120
        result = s.monitor(self.config, self.root, lambda: self.now, send)
        self.assertEqual(result['terminal_alerts'], 1)
        self.assertNotIn('SECRET', (self.root / 'monitor.json').read_text())

    def test_config_allowlist_and_preview_pinning(self):
        path = self.root / 'config.json'
        def load(value):
            path.write_text(json.dumps(value))
            path.chmod(0o600)
            return s.config_read(path)
        self.assertEqual(load({})['billing_secret_file'], '/etc/clicaepede/kan135/billing.token')
        for origin in ['http://evil.vercel.app', 'https://evil.com', 'https://evil.vercel.app/path',
                       'https://x@evil.vercel.app', 'https://evil.vercel.app:443', 'https://evil.vercel.app?x=1']:
            with self.assertRaises(ValueError):
                load({'origin': origin, 'allowlisted_origins': [origin]})
        with self.assertRaises(ValueError):
            load({'origin': 'https://clicaepedeofc-preview.vercel.app'})
        preview = 'https://clicaepedeofc-preview.vercel.app'
        self.assertEqual(load({'origin': preview, 'allowlisted_origins': [preview]})['origin'], preview)
        with self.assertRaises(ValueError):
            load({'origin': 'https://unrelated.vercel.app', 'allowlisted_origins': ['https://unrelated.vercel.app']})
        with self.assertRaises(ValueError):
            load({'billing_enabled': 'false'})
        with self.assertRaises(ValueError):
            load({'whatsapp_secret_file': '/tmp/token'})
        with self.assertRaises(ValueError):
            load({'preview_bypass_secret_file': '/tmp/bypass'})

    def test_telegram_uses_existing_private_config_confirmed_exact_chat(self):
        request = Mock(return_value=(200, {'ok': True, 'result': {'message_id': 1, 'chat': {'id': -123}}}))
        credentials = json.dumps({'telegram_token': '123:private', 'telegram_chat_id': '-123'})
        with patch.object(s, 'private_read', return_value=credentials) as read:
            s.notify('incident:whatsapp:late', {}, request)
            read.assert_called_once_with(Path('/etc/clicaepede/kan133/config.json'))
            self.assertEqual(request.call_args.args[0], 'https://api.telegram.org/bot123:private/sendMessage')
            payload = json.loads(request.call_args.args[2])
            self.assertEqual(payload['text'], '[KAN135] incident:whatsapp:late')
            self.assertNotIn('Authorization', request.call_args.args[1])
            request.return_value = (200, {'ok': True, 'result': {'message_id': 1, 'chat': {'id': 999}}})
            with self.assertRaises(ValueError):
                s.notify('incident:whatsapp:late', {}, request)
            request.return_value = (200, {'ok': False})
            with self.assertRaises(ValueError):
                s.notify('incident:whatsapp:late', {}, request)

    def test_billing_skips_cannot_mask_daily_delay(self):
        self.config['billing_enabled'] = True
        self.request.return_value = (409, {'ok': True})
        self.run_job('billing')
        self.now += 901
        self.assertIn('billing:late', s.active_incidents(self.config, self.root, self.now, self.now - 902))

    def test_corrupt_state_fails_closed_without_network(self):
        (self.root / 'whatsapp.json').write_text('not-json')
        with self.assertRaises(json.JSONDecodeError):
            self.run_job()
        self.request.assert_not_called()

    def test_disabled_flags_cannot_send_or_drain(self):
        self.request.side_effect = urllib.error.URLError(ConnectionRefusedError())
        self.run_job()
        self.config['whatsapp_enabled'] = False
        self.now += 120
        self.assertEqual(s.retry(self.config, self.root, lambda: self.now, self.request), {'whatsapp': 'disabled'})
        self.assertEqual(self.request.call_count, 1)

    def test_enabled_jobs_reject_shared_secret_values(self):
        self.config['billing_enabled'] = True
        Path(self.config['billing_secret_file']).write_text('dedicated-whatsapp')
        with self.assertRaises(ValueError):
            self.run_job()
        self.request.assert_not_called()

    def test_http_redirect_proxy_and_size_limit(self):
        with self.assertRaises(ValueError):
            s.NoRedirect().redirect_request(None, None, None, None, None, None)
        response = Mock(status=200)
        response.read.return_value = b'x' * 65537
        opener = Mock()
        opener.open.return_value.__enter__ = Mock(return_value=response)
        opener.open.return_value.__exit__ = Mock(return_value=False)
        with patch.object(s.urllib.request, 'build_opener', return_value=opener) as build:
            with self.assertRaises(ValueError):
                s.http(s.ORIGIN, {}, b'')
            self.assertEqual(build.call_args.args[0].proxies, {})
            self.assertEqual(opener.open.call_args.args[0].get_method(), 'POST')
            self.assertEqual(opener.open.call_args.kwargs['timeout'], 65)

    def test_cli_redacts_exception(self):
        output = io.StringIO()
        with patch.object(sys, 'argv', ['scheduler', 'whatsapp']), patch.object(s, 'config_read', side_effect=ValueError('SECRET PII')), contextlib.redirect_stdout(output):
            self.assertEqual(s.main(), 1)
        self.assertNotIn('SECRET', output.getvalue())
        self.assertIn('local-failure', output.getvalue())

    def test_installer_never_activates_units(self):
        source = Path(__file__).parent
        install = (source / 'install.sh').read_text()
        self.assertNotIn('--now', install)
        self.assertNotIn('systemctl start', install)
        self.assertNotIn('systemctl restart', install)
        self.assertIn('enable=false', install)
        for unit in (source / 'systemd').glob('*.service'):
            self.assertNotIn('Restart=', unit.read_text())
        self.assertIn('Persistent=true', (source / 'systemd/kan135-billing.timer').read_text())


@unittest.skipUnless(os.name == 'posix' and s.fcntl is not None, 'requires Linux kernel flock and POSIX permissions')
class LinuxTests(unittest.TestCase):
    def test_real_cross_process_flock_and_private_mode(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with s.locked(root, 'whatsapp'):
                program = "import scheduler as s; from pathlib import Path; import sys\ntry:\n with s.locked(Path(sys.argv[1]), 'whatsapp'): pass\nexcept s.Busy:\n sys.exit(7)"
                result = subprocess.run([sys.executable, '-B', '-c', program, directory], cwd=Path(__file__).parent, capture_output=True)
                self.assertEqual(result.returncode, 7)
            path = root / 'token'
            path.write_text('secret')
            path.chmod(0o644)
            with self.assertRaises(ValueError):
                s.private_read(path)
            path.chmod(0o600)
            self.assertEqual(s.private_read(path), 'secret')
            symlink = root / 'symlink'
            symlink.symlink_to(path)
            with self.assertRaises(OSError):
                s.private_read(symlink)


if __name__ == '__main__':
    unittest.main()
