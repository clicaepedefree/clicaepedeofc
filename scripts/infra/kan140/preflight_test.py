import copy
import contextlib
import io
import json
import unittest
from unittest.mock import patch

import preflight as p


def baseline():
    inv = {
        "observed_at": "2026-11-19T13:00:00+00:00",
        "panel_ipv4": ["192.0.2.1"], "panel_setup_complete": True,
        "whatsapp_enabled": False, "pending_recovery": False,
        "backup": {"captured_at": "2026-11-19T12:00:00Z",
                   "verified_at": "2026-11-19T12:01:00Z", "failed": False},
        "services": {}, "writers": {},
    }
    for name in p.SERVICES:
        volume, target = p.VOLUMES[name]
        inv["services"][name] = {
            "image": "image@sha256:" + "a" * 64, "replicas": 1, "ports": [],
            "mounts": [{"type": "volume", "source": volume, "target": target}],
            "secret_names": ["private_reference"],
            "tasks": [{"id": name, "running": True, "health": "healthy"}],
        }
        inv["writers"][volume] = [name]
    return inv


class PreflightTests(unittest.TestCase):
    def test_healthy_baseline_does_not_authorize_migration_or_run_commands(self):
        inv = baseline()
        before = copy.deepcopy(inv)
        with patch.object(p, "command", side_effect=AssertionError("no commands")):
            self.assertEqual(p.evaluate(inv, "192.0.2.1"), [])
        self.assertEqual(inv, before)

    def test_missing_or_mixed_dns_blocks(self):
        for dns in ([], ["192.0.2.2"], ["192.0.2.1", "192.0.2.2"]):
            inv = baseline()
            inv["panel_ipv4"] = dns
            self.assertIn("PANEL_DNS_MISSING_OR_NOT_EXCLUSIVELY_TARGET",
                          p.evaluate(inv, "192.0.2.1"))

    def test_unknown_setup_or_pause_blocks(self):
        for key in ("panel_setup_complete", "whatsapp_enabled", "pending_recovery"):
            for value in (None, "false"):
                inv = baseline()
                inv[key] = value
                self.assertTrue(p.evaluate(inv, "192.0.2.1"))

    def test_active_worker_or_pending_recovery_blocks(self):
        for key in ("whatsapp_enabled", "pending_recovery"):
            inv = baseline()
            inv[key] = True
            self.assertTrue(p.evaluate(inv, "192.0.2.1"))

    def test_missing_unhealthy_or_multiple_tasks_block(self):
        name = p.SERVICES[0]
        for tasks in ([], [{"id": name, "health": "unhealthy", "running": True}],
                      [{"id": name, "health": "healthy", "running": False}],
                      baseline()["services"][name]["tasks"] * 2):
            inv = baseline()
            inv["services"][name]["tasks"] = tasks
            self.assertIn("UNHEALTHY_OR_MULTIPLE_TASKS:" + name,
                          p.evaluate(inv, "192.0.2.1"))
        inv = baseline()
        del inv["services"][name]
        self.assertIn("MISSING_SERVICE:" + name, p.evaluate(inv, "192.0.2.1"))

    def test_writers_must_match_current_service_not_only_count(self):
        name = p.SERVICES[0]
        for writers in ([], ["other"], [name, "other"]):
            inv = baseline()
            inv["writers"][p.VOLUMES[name][0]] = writers
            self.assertIn("UNCONFIRMED_SINGLE_WRITER:" + name,
                          p.evaluate(inv, "192.0.2.1"))

    def test_resources_and_secret_references_cannot_silently_disappear(self):
        name = p.SERVICES[0]
        for key, value, error in [
            ("image", "image:latest", "UNPINNED_IMAGE"),
            ("ports", [{"PublishedPort": 8080}], "WORKLOAD_HAS_PUBLISHED_PORTS"),
            ("mounts", [], "PERSISTENCE_CONTRACT_MISMATCH"),
            ("secret_names", [], "MISSING_CREDENTIAL_MOUNTS"),
        ]:
            inv = baseline()
            inv["services"][name][key] = value
            self.assertIn(error + ":" + name, p.evaluate(inv, "192.0.2.1"))

    def test_stale_future_failed_or_missing_backup_blocks(self):
        for change in (
            {"captured_at": "2026-11-17T12:00:00Z"},
            {"captured_at": "2026-11-20T12:00:00Z"},
            {"verified_at": "2026-11-19T11:00:00Z"},
            {"verified_at": "2026-11-20T12:00:00Z"},
            {"failed": True}, {"failed": None}, {"captured_at": "invalid"},
            {"captured_at": None}, {"captured_at": 123},
        ):
            inv = baseline()
            inv["backup"].update(change)
            self.assertIn("FRESH_VERIFIED_BACKUP_UNCONFIRMED",
                          p.evaluate(inv, "192.0.2.1"))
        inv = baseline()
        inv["backup"] = {}
        self.assertTrue(p.evaluate(inv, "192.0.2.1"))

    def test_invalid_digest_and_wrong_volume_target_block(self):
        name = p.SERVICES[0]
        inv = baseline()
        inv['services'][name]['image'] = 'image@sha256:invalid'
        inv['services'][name]['mounts'][0]['target'] = '/wrong'
        errors = p.evaluate(inv, '192.0.2.1')
        self.assertIn('UNPINNED_IMAGE:' + name, errors)
        self.assertIn('PERSISTENCE_CONTRACT_MISMATCH:' + name, errors)

    def test_setup_client_disables_proxy_and_redirect(self):
        response = unittest.mock.MagicMock()
        response.__enter__.return_value.read.return_value = b'{"isComplete":true}'
        opener = unittest.mock.Mock()
        opener.open.return_value = response
        with patch.object(p.urllib.request, 'build_opener', return_value=opener) as build:
            self.assertTrue(p.panel_setup_status())
        proxy, redirects = build.call_args.args
        self.assertEqual(proxy.proxies, {})
        self.assertIsNone(redirects.redirect_request(None, None, 302, '', {}, 'https://outside.invalid'))
        opener.open.assert_called_once_with('http://127.0.0.1:3000/api/getSetupStatus', timeout=5)

    def test_collector_reads_allowlisted_fields_and_no_secret_output(self):
        inv = baseline()
        paths = []
        def read(path):
            paths.append(str(path).replace('\\', '/'))
            if path.name == 'config.json':
                return json.dumps({'whatsapp_enabled': False, 'billing_enabled': False,
                                   'telegram_token': 'PRIVATE_SENTINEL'})
            if path.name == 'last_backup.json':
                return json.dumps({**inv['backup'], 'private': 'PRIVATE_SENTINEL'})
            raise AssertionError('unexpected credential read')
        with patch.object(p, 'service_inventory', side_effect=lambda n: inv['services'][n]), \
             patch.object(p, 'running_volume_writers', return_value=inv['writers']), \
             patch.object(p, 'resolve_ipv4', return_value=inv['panel_ipv4']), \
             patch.object(p, 'panel_setup_status', return_value=True), \
             patch.object(p.pathlib.Path, 'read_text', read), \
             patch.object(p.os.path, 'lexists', return_value=False), \
             patch.object(p, 'command', side_effect=AssertionError('no extra command')):
            report = p.collect('panel.example.invalid')
        self.assertEqual(paths, ['/etc/clicaepede/kan135/config.json',
                                 '/var/lib/clicaepede/kan133/last_backup.json'])
        self.assertNotIn('PRIVATE_SENTINEL', json.dumps(report))
        self.assertIs(report['writes_performed'], False)
        self.assertIs(report['cutover_authorized'], False)

    def test_cli_malformed_inventory_is_sanitized_json(self):
        for inv in (None, [], {}, {'panel_ipv4': []}):
            out = io.StringIO()
            with patch('sys.argv', ['preflight', '--expected-ip', '192.0.2.1']), \
                 patch.object(p, 'collect', return_value=inv), contextlib.redirect_stdout(out):
                self.assertEqual(p.main(), 2)
            result = json.loads(out.getvalue())
            self.assertEqual(result['baseline_status'], 'UNAVAILABLE')
            self.assertFalse(result['writes_performed'])
            self.assertFalse(result['cutover_authorized'])

    def test_docker_collector_uses_only_inspect_and_list_and_omits_environment(self):
        name = p.SERVICES[0]
        spec = {'ID': 'service-id', 'Spec': {
            'TaskTemplate': {'ContainerSpec': {
                'Image': 'image@sha256:' + 'a' * 64,
                'Env': ['PASSWORD=fixture_PRIVATE_SENTINEL'],
                'Mounts': [{'Type': 'volume', 'Source': p.VOLUMES[name][0],
                            'Target': p.VOLUMES[name][1]}],
                'Secrets': [{'SecretName': 'reference-only'}]}},
            'Mode': {'Replicated': {'Replicas': 1}}}}
        task = {'State': {'Running': True, 'Health': {'Status': 'healthy'}},
                'Mounts': [{'Type': 'volume', 'RW': True, 'Name': p.VOLUMES[name][0]}]}
        calls = []
        def command(*args):
            calls.append(args)
            if args == ('docker', 'service', 'inspect', name):
                return json.dumps([spec])
            if args == ('docker', 'ps', '-q', '--filter', 'label=com.docker.swarm.service.name=' + name):
                return 'container-id'
            if args == ('docker', 'inspect', 'container-id'):
                return json.dumps([task])
            if args == ('docker', 'ps', '-q'):
                return 'container-id'
            raise AssertionError('unexpected operation')
        with patch.object(p, 'command', side_effect=command):
            service = p.service_inventory(name)
            writers = p.running_volume_writers()
        self.assertEqual(len(calls), 5)
        self.assertEqual(writers[p.VOLUMES[name][0]], ['container-id'])
        self.assertNotIn('PRIVATE_SENTINEL', json.dumps(service))
        self.assertNotIn('PASSWORD', json.dumps(service))


if __name__ == "__main__":
    unittest.main()
