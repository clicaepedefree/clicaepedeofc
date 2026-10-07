#!/usr/bin/env python3
"""Five offline stdlib cases; no credentials, Auth, Storage or deletion access."""
import base64
import datetime as dt
import importlib.util
import io
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
spec = importlib.util.spec_from_file_location('kan133_retention', Path(__file__).with_name('retention.py'))
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)

NOW = int(dt.datetime(2026, 10, 16, tzinfo=dt.timezone.utc).timestamp())
USER = '11111111-1111-1111-1111-111111111111'
STATE = {'status': 'pass', 'offsite_download_hash_verified': True,
         'offsite_key_decryption_verified': True, 'cleanup_verified': True}
SETTINGS = {'supabase_url': 'https://' + r.backup.SUPABASE_HOST,
            'anon_key': 'sb_publishable_' + 'OFFLINE_TEST_ONLY_' * 2,
            'janitor_email': 'offline-janitor@example.invalid',
            'janitor_password': 'OFFLINE_TEST_ONLY_PASSWORD'}


def row(age, number=1, full=False):
    created = dt.datetime.fromtimestamp(NOW - age, dt.timezone.utc)
    name = created.strftime('%Y%m%dT%H%M%SZ') + f'-00000000-0000-0000-0000-{number:012x}.age'
    return {'name': r.PREFIX + name if full else name,
            'id': f'10000000-0000-0000-0000-{number:012x}',
            'created_at': created.isoformat(), 'updated_at': created.isoformat(), 'metadata': {'size': 42}}


def session():
    claims = {'role': 'authenticated', 'iat': NOW, 'exp': NOW + 3600, 'sub': USER}
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip('=')
    return {'access_token': 'header.' + payload + '.OFFLINE_ONLY',
            'user': {'id': USER, 'email': SETTINGS['janitor_email'],
                     'app_metadata': {'purpose': 'kan133-backup-retention'}}}


class RetentionTests(unittest.TestCase):
    def test_1_age_boundary_keep_two_and_server_created_at_not_filename(self):
        objects = [row(20 * 86400, 1), row(8 * 86400, 2), row(7 * 86400, 3),
                   row(86400, 4), row(0, 5)]
        self.assertEqual(r.eligible(objects, NOW), [r.owned_name(objects[i]['name']) for i in (0, 1, 2)])
        for length in (0, 1, 2):
            self.assertEqual(r.eligible(objects[:length], NOW), [])
        all_old = [row(9 * 86400, 1), row(10 * 86400, 2), row(11 * 86400, 3)]
        self.assertEqual(r.eligible(all_old, NOW), [r.owned_name(all_old[2]['name'])])
        recent = row(30 * 86400, 9)
        recent['created_at'] = recent['updated_at'] = row(1)['created_at']
        self.assertEqual(r.eligible(objects[-2:] + [recent], NOW), [])

    def test_2_future_truncated_duplicates_ties_and_unsafe_names_fail_closed(self):
        for objects in ([row(-1)], [row(1)] * 1000, [row(1), row(1)]):
            with self.subTest(objects=len(objects)), self.assertRaises(r.GateError):
                r.eligible(objects, NOW)
        future = row(1)
        future['created_at'] = future['updated_at'] = row(-1)['created_at']
        with self.assertRaisesRegex(r.GateError, 'future-object-clock'):
            r.eligible([future], NOW)
        for name in ('../other.age', 'other-prefix/' + row(9 * 86400)['name'],
                     r.PREFIX + '../' + row(9 * 86400)['name'], 'folder', 'not-a-backup.age'):
            item = row(9 * 86400)
            item['name'] = name
            self.assertEqual(r.eligible([row(1, 1), row(2, 2), item], NOW), [])
        tied = [row(8 * 86400, n) for n in (1, 2, 3)]
        self.assertEqual(r.eligible(tied, NOW), [])
        changed = row(9 * 86400)
        changed['updated_at'] = row(1)['created_at']
        with self.assertRaisesRegex(r.GateError, 'non-immutable-object'):
            r.eligible([changed], NOW)

    def test_3_restore_gate_and_config_or_auth_never_allow_broad_keys(self):
        self.assertIs(r.request, r.backup.request)
        with self.assertRaises(r.backup.Failure):
            r.backup.NoRedirect().redirect_request(None, None, 302, 'redirect', {}, 'https://outside.invalid')
        for field in STATE:
            bad = {**STATE, field: 'pass' if field != 'status' else 'fail'}
            with patch.object(r.backup, 'read_json', return_value=bad), patch.object(r, 'request') as request:
                self.assertEqual(r.run(True)['gate'], 'restore-evidence-required')
                request.assert_not_called()
        with patch.object(r.backup, 'read_json', side_effect=FileNotFoundError('private path')):
            with self.assertRaisesRegex(r.GateError, '^restore-evidence-required$'):
                r.restore_gate()
        with patch.object(r.backup, 'read_json', side_effect=r.backup.Failure()):
            with self.assertRaisesRegex(r.GateError, '^janitor-private-config-required$'):
                r.settings()
        for config in ({**SETTINGS, 'service_role_key': 'NEVER_USE'},
                       {**SETTINGS, 'supabase_url': 'https://outside.invalid'},
                       {**SETTINGS, 'anon_key': 'sb_secret_NEVER_USE'}):
            with patch.object(r.backup, 'read_json', return_value=config):
                with self.assertRaises(r.GateError):
                    r.settings()
        bad = session()
        bad['user']['app_metadata']['purpose'] = 'uploader'
        with patch.object(r, 'request', return_value=json.dumps(bad).encode()):
            with self.assertRaisesRegex(r.GateError, 'janitor-identity-required'):
                r.login(SETTINGS)

    def test_4_dry_run_fresh_auth_fixed_prefix_and_safe_json(self):
        objects = [row(1, 1), row(2, 2), row(8 * 86400, 3, full=True)]
        responses = [json.dumps(session()).encode(), json.dumps(objects).encode()] * 2
        with patch.object(r.backup, 'read_json', side_effect=lambda path: STATE if path == r.RESTORE else SETTINGS), \
                patch.object(r, 'request', side_effect=responses) as request:
            for _ in range(2):
                output = r.run()
                self.assertEqual(output['status'], 'pass')
                self.assertEqual(output['deleted'], 0)
                self.assertEqual(output['eligible'], 1)
                for private in ('OFFLINE', 'Bearer', '.age', 'example.invalid'):
                    self.assertNotIn(private, json.dumps(output))
        self.assertEqual([call.args[1] for call in request.call_args_list], ['POST'] * 4)
        for call in request.call_args_list[1::2]:
            self.assertTrue(call.args[0].endswith('/storage/v1/object/list/' + r.BUCKET))
            self.assertEqual(json.loads(call.args[3]), {'prefix': r.PREFIX, 'limit': 1000,
                                                       'sortBy': {'column': 'created_at', 'order': 'desc'}})
        with patch.object(r.sys, 'platform', 'win32'), patch('sys.stdout', new_callable=io.StringIO) as out:
            self.assertEqual(r.main([]), 1)
            self.assertEqual(json.loads(out.getvalue())['gate'], 'linux-root-required')

    def test_5_apply_max_twenty_listed_only_rechecks_gate_and_verifies_deletes(self):
        objects = [row(1, 1), row(2, 2)] + [row((8 + n) * 86400, n + 3) for n in range(30)]
        calls = []
        def request(url, method, headers, body, limit):
            calls.append((url, method, json.loads(body)))
            if '/auth/v1/' in url:
                return json.dumps(session()).encode()
            if '/object/list/' in url:
                return json.dumps(objects).encode()
            selected = json.loads(body)['prefixes']
            self.assertEqual(len(selected), 20)
            self.assertEqual(selected, r.eligible(objects, NOW)[:20])
            return json.dumps([{'name': name} for name in selected]).encode()
        states = []
        def read_json(path):
            if path == r.RESTORE:
                states.append(path)
                return STATE
            return SETTINGS
        with patch.object(r.backup, 'read_json', side_effect=read_json), patch.object(r, 'request', side_effect=request):
            output = r.run(True)
        self.assertEqual(output['status'], 'pass')
        self.assertEqual(output['deleted'], 20)
        self.assertEqual(len(states), 2)
        self.assertEqual(calls[-1][1], 'DELETE')
        self.assertEqual(calls[-1][0], SETTINGS['supabase_url'] + '/storage/v1/object/' + r.BUCKET)
        with patch.object(r, 'restore_gate'), patch.object(r, 'settings', return_value=SETTINGS), \
                patch.object(r, 'request', side_effect=[json.dumps(session()).encode(), json.dumps(objects).encode(), b'[]']):
            self.assertEqual(r.run(True)['gate'], 'delete-incomplete')
        with patch.object(r, 'restore_gate', side_effect=[None, r.GateError('restore-evidence-required')]), \
                patch.object(r, 'settings', return_value=SETTINGS), \
                patch.object(r, 'request', side_effect=[json.dumps(session()).encode(), json.dumps(objects).encode()]) as http:
            self.assertEqual(r.run(True)['gate'], 'restore-evidence-required')
            self.assertEqual(http.call_count, 2)


if __name__ == '__main__':
    unittest.main()
