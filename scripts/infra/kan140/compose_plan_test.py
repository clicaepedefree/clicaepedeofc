import copy
import hashlib
import json
from pathlib import Path
import unittest

from compose_plan import build_plan, PlanError

SOURCE = Path(__file__).resolve().parent.parent / 'kan132' / 'stack.yaml'


class ComposePlanTests(unittest.TestCase):
    def setUp(self):
        self.raw = SOURCE.read_bytes()
        self.stack = json.loads(self.raw)

    def plan(self, stack=None):
        raw = self.raw if stack is None else json.dumps(stack).encode()
        return build_plan(raw, hashlib.sha256(raw).hexdigest(), 1)

    def test_source_is_not_mutated_and_plan_is_not_authorization(self):
        before = copy.deepcopy(self.stack)
        plan = self.plan(self.stack)
        self.assertEqual(before, self.stack)
        self.assertFalse(plan['deployment_permitted'])
        self.assertEqual(len(plan['required_gates']), 8)

    def test_baseline_drift_rejected(self):
        with self.assertRaisesRegex(PlanError, 'baseline-drift'):
            build_plan(self.raw, '0' * 64, 1)

    def test_generation_requires_positive_integer_not_bool(self):
        for value in (0, -1, True, 1.5, '1', 2147483648):
            with self.subTest(value=value), self.assertRaises(PlanError):
                build_plan(self.raw, hashlib.sha256(self.raw).hexdigest(), value)

    def test_exact_images_healthchecks_and_log_redaction_preserved(self):
        services = self.plan()['compose']['services']
        for role, source in self.stack['services'].items():
            for field in ('image', 'healthcheck', 'logging', 'entrypoint', 'command',
                          'environment', 'configs', 'secrets'):
                self.assertEqual(services[role].get(field), source.get(field))
            self.assertNotIn('deploy', services[role])
            self.assertEqual(services[role]['restart'], 'unless-stopped')
            self.assertEqual(services[role]['mem_limit'], source['deploy']['resources']['limits']['memory'])

    def test_new_explicit_external_volumes_cannot_silently_create_empty_database(self):
        volumes = self.plan()['compose']['volumes']
        self.assertEqual(len(volumes), 3)
        for value in volumes.values():
            self.assertTrue(value['external'])
            self.assertTrue(value['name'].startswith('kan140_qa_'))
            self.assertFalse(value['name'].startswith('clica-evolution-qa_'))

    def test_secrets_are_file_references_not_values_or_env(self):
        compose = self.plan()['compose']
        for reference in compose['secrets'].values():
            self.assertTrue(reference['file'].startswith('/etc/clicaepede/kan140/mount-secrets/'))
            self.assertEqual(set(reference), {'file'})
        for service in compose['services'].values():
            self.assertNotIn('ports', service)
            self.assertNotIn('container_name', service)
        self.assertTrue(compose['networks']['internal']['internal'])
        self.assertEqual(compose['services']['postgres']['networks'], ['internal'])
        self.assertEqual(compose['services']['redis']['networks'], ['internal'])

    def test_unknown_or_dangerous_fields_fail_closed(self):
        for key, value in (('ports', ['8080:8080']), ('privileged', True),
                           ('container_name', 'fixed'), ('build', '.'), ('user', '1000')):
            with self.subTest(key=key):
                stack = copy.deepcopy(self.stack)
                stack['services']['evolution'][key] = value
                with self.assertRaisesRegex(PlanError, 'unsupported-service-field'):
                    self.plan(stack)

    def test_floating_image_or_wrong_volume_rejected(self):
        for field, value in (('image', 'evolution:latest'), ('volumes', ['other:/evolution/instances'])):
            with self.subTest(field=field):
                stack = copy.deepcopy(self.stack)
                stack['services']['evolution'][field] = value
                with self.assertRaises(PlanError):
                    self.plan(stack)

    def test_unknown_source_secret_or_config_rejected(self):
        for key in ('secrets', 'configs'):
            stack = copy.deepcopy(self.stack)
            stack[key]['unexpected'] = {'file': '/tmp/unreviewed'}
            with self.subTest(key=key), self.assertRaises(PlanError):
                self.plan(stack)

    def test_proxy_network_and_privacy_required(self):
        for field, value in (('networks', ['internal']), ('logging', {'driver': 'none'})):
            stack = copy.deepcopy(self.stack)
            stack['services']['evolution'][field] = value
            with self.subTest(field=field), self.assertRaises(PlanError):
                self.plan(stack)

    def test_global_webhook_must_remain_off(self):
        self.stack['services']['evolution']['environment']['WEBHOOK_GLOBAL_ENABLED'] = 'true'
        with self.assertRaisesRegex(PlanError, 'environment-contract'):
            self.plan(self.stack)

    def test_inline_credentials_and_privacy_changes_are_rejected_not_returned(self):
        for key, value in (('AUTHENTICATION_API_KEY', 'fixture-not-a-real-secret'),
                           ('DATABASE_CONNECTION_URI', 'fixture-not-a-real-uri'),
                           ('TELEMETRY_ENABLED', 'true'),
                           ('DATABASE_SAVE_DATA_NEW_MESSAGE', 'true')):
            stack = copy.deepcopy(self.stack)
            stack['services']['evolution']['environment'][key] = value
            with self.subTest(key=key), self.assertRaisesRegex(PlanError, 'environment-contract'):
                self.plan(stack)

    def test_disabled_and_malformed_healthchecks_are_rejected(self):
        for change in ({'test': ['NONE']}, {'test': 'CMD true'}, {'retries': True},
                       {'retries': 0}, {'interval': '0s'}, {'timeout': '301s'},
                       {'start_period': None}, {'disable': True}):
            stack = copy.deepcopy(self.stack)
            stack['services']['evolution']['healthcheck'].update(change)
            with self.subTest(change=change), self.assertRaises(PlanError):
                self.plan(stack)

    def test_invalid_encoding_has_controlled_error(self):
        for raw in (b'\xff', b'\xff\xfe{\x00'):
            with self.subTest(raw=raw), self.assertRaisesRegex(PlanError, 'invalid-stack-contract'):
                build_plan(raw, hashlib.sha256(raw).hexdigest(), 1)

    def test_invalid_input_never_requires_subprocess_or_network(self):
        for raw in (b'{}', b'{', b'null', b'[]'):
            with self.subTest(raw=raw), self.assertRaises(PlanError):
                build_plan(raw, hashlib.sha256(raw).hexdigest(), 1)


if __name__ == '__main__':
    unittest.main()
