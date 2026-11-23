"""Offline HTTP contract tests. Never connect to a panel or use real secrets."""
import json
import socket
import unittest
from unittest import mock
from urllib.parse import parse_qs, urlsplit

import panel_client as p


class Response:
    def __init__(self, value=None, *, raw=None, status=200, encoding='identity'):
        self.raw = json.dumps(value).encode() if raw is None else raw
        self.status = status
        self.encoding = encoding
        self.reads = []

    def getheader(self, key, default=None):
        return self.encoding if key == 'Content-Encoding' else default

    def read(self, limit):
        self.reads.append(limit)
        return self.raw[:limit]


class ClientTests(unittest.TestCase):
    def setUp(self):
        self.network = mock.patch.object(socket, 'create_connection', side_effect=AssertionError('network forbidden'))
        self.network.start()
        self.addCleanup(self.network.stop)
        self.http = mock.patch.object(p.http.client, 'HTTPConnection')
        self.factory = self.http.start()
        self.addCleanup(self.http.stop)
        self.connection = self.factory.return_value
        self.connection.getresponse.return_value = Response({'token': 'fixture-token'})

    def login(self, **kwargs):
        client = p.Client('fixture@example.invalid', 'fixture-password', **kwargs)
        client.__enter__()
        return client

    def test_context_login_logout_memory_and_redacted_repr(self):
        with p.Client('fixture@example.invalid', 'fixture-password', timeout=7) as client:
            self.assertIsNone(client._credentials)
            self.assertNotIn('fixture', repr(client))
        self.assertIsNone(client._token)
        self.factory.assert_called_with('127.0.0.1', 3000, timeout=7)
        calls = self.connection.request.call_args_list
        self.assertEqual([c.args[:2] for c in calls], [('POST', '/api/login'), ('POST', '/api/logout')])
        self.assertEqual(json.loads(calls[0].kwargs['body']),
                         {'email': 'fixture@example.invalid', 'password': 'fixture-password', 'rememberMe': False})
        self.assertNotIn('Authorization', calls[0].kwargs['headers'])
        self.assertEqual(calls[1].kwargs['headers']['Authorization'], 'Bearer fixture-token')
        self.assertEqual(self.connection.close.call_count, 2)

    def test_get_contracts_structured_urlencode_no_body(self):
        client = self.login()
        for operation, payload, endpoint in (
                ('inspectProject', p.project_payload(), 'inspectProject'),
                ('inspectComposeService', p.service_payload(), 'inspectComposeService'),
                ('getServiceContainers', p.containers_payload('verified_compose-qa'), 'getDockerContainers')):
            client.call(operation, payload)
            request = self.connection.request.call_args
            url = urlsplit(request.args[1])
            self.assertEqual(url.path, '/api/' + endpoint)
            self.assertEqual(parse_qs(url.query), {k: [v] for k, v in payload.items()})
            self.assertEqual(request.args[0], 'GET')
            self.assertIsNone(request.kwargs['body'])

    def test_native_logout_accepts_empty_success_only_for_logout(self):
        client = self.login()
        self.connection.getresponse.return_value = Response(raw=b'')
        with self.assertRaisesRegex(p.PanelError, 'invalid-response'):
            client.call('inspectProject', p.project_payload())
        client.close()
        self.assertIsNone(client._token)

    def test_actions_read_is_scoped_and_bounded(self):
        client = self.login()
        client.call('listActions', p.actions_payload())
        request = self.connection.request.call_args
        query = parse_qs(urlsplit(request.args[1]).query)
        self.assertEqual(query, {'projectName':['clica-qa'], 'serviceName':['evolution-qa'], 'limit':['20']})
        with self.assertRaises(p.PanelError):
            client.call('listActions', dict(p.actions_payload(), limit=1000))

    def test_all_compose_mutations_and_explicit_source_trust(self):
        client = self.login()
        source = 'services:\n  evolution:\n    image: fixture:1\n'
        for operation, payload, trusted in (
                ('createComposeService', p.create_compose_payload(source, trusted_source=True), True),
                ('stopComposeService', p.service_payload(), False),
                ('updateComposeSourceInline', p.inline_source_payload(source, trusted_source=True), True),
                ('deployComposeService', p.deploy_compose_payload(), False),
                ('startComposeService', p.service_payload(), False)):
            if trusted:
                with self.assertRaises(p.PanelError):
                    client.call(operation, payload)
            client.call(operation, payload, trusted_source=trusted)
            request = self.connection.request.call_args
            self.assertEqual(request.args[:2], ('POST', '/api/' + operation))
            self.assertEqual(json.loads(request.kwargs['body']), payload)

    def test_domains_verified_nested_schema_and_guarded_delete_alias(self):
        route = p.create_domain_payload('fixture-domain', certificate_resolver='letsencrypt')
        self.assertEqual(route['serviceDestination'], {
            'projectName': 'clica-qa', 'serviceName': 'evolution-qa',
            'composeService': 'evolution', 'port': 8080, 'protocol': 'http', 'path': '/'})
        self.assertEqual(route['destinationType'], 'service')
        self.assertTrue(route['https'])
        with self.assertRaisesRegex(p.PanelError, 'domain-denied'):
            self.login().call('createDomain', route)
        client = self.login(enable_domain_mutations=True)
        client.call('createDomain', route)
        deletion = p.destroy_domain_payload(route)
        with self.assertRaises(p.PanelError):
            client.call('destroyDomain', deletion)
        client.call('destroyDomain', deletion, domain_evidence=route)
        self.assertEqual(self.connection.request.call_args.args[:2], ('POST', '/api/deleteDomain'))
        for field, value in (('host', 'other.invalid'), ('destinationType', 'compose'),
                             ('servicePath', '/'), ('https', 1)):
            bad = {**route, field: value}
            with self.assertRaises(p.PanelError):
                client.call('createDomain', bad)

    def test_scope_extra_fields_and_unknown_operations_fail_before_http(self):
        client = self.login()
        before = self.connection.request.call_count
        for operation in ('createProject', 'destroyComposeService', '../login', 'getDockerContainers', 'deleteDomain'):
            with self.assertRaisesRegex(p.PanelError, 'operation-denied'):
                client.call(operation, {})
        for payload in ({'projectName': 'production'}, {**p.service_payload(), 'env': 'fixture'},
                        {**p.service_payload(), 'serviceName': 'postgres'}):
            with self.assertRaises(p.PanelError):
                client.call('stopComposeService', payload)
        self.assertEqual(self.connection.request.call_count, before)

    def test_redirects_http_errors_and_timeouts_have_no_retry_or_body_read(self):
        client = self.login()
        for status in (301, 302, 303, 307, 308, 400, 401, 429, 500, 503):
            response = Response(raw=b'fixture-secret', status=status)
            self.connection.getresponse.return_value = response
            before = self.connection.request.call_count
            with self.assertRaisesRegex(p.PanelError, '^http-failed$') as caught:
                client.call('deployComposeService', p.service_payload())
            self.assertEqual(self.connection.request.call_count, before + 1)
            self.assertEqual(response.reads, [])
            self.assertNotIn('fixture-secret', repr(caught.exception))
        self.connection.request.side_effect = TimeoutError('fixture-secret')
        before = self.connection.request.call_count
        with self.assertRaisesRegex(p.PanelError, '^transport-failed$'):
            client.call('deployComposeService', p.service_payload())
        self.assertEqual(self.connection.request.call_count, before + 1)

    def test_bounded_responses_and_invalid_json(self):
        client = self.login()
        for raw, code in ((b'x' * (p.MAX_RESPONSE + 1), 'response-limit'),
                          (b'not-json-fixture-secret', 'invalid-response'),
                          (b'NaN', 'invalid-response'), (b'\xff', 'invalid-response')):
            response = Response(raw=raw)
            self.connection.getresponse.return_value = response
            with self.assertRaisesRegex(p.PanelError, '^' + code + '$'):
                client.call('inspectProject', p.project_payload())
            self.assertEqual(response.reads, [p.MAX_RESPONSE + 1])
        self.connection.getresponse.return_value = Response(encoding='gzip')
        with self.assertRaisesRegex(p.PanelError, 'invalid-response'):
            client.call('inspectProject', p.project_payload())

    def test_logout_failure_clears_token_and_preserves_body_exception(self):
        client = self.login()
        self.connection.request.side_effect = OSError('fixture-secret')
        with self.assertRaisesRegex(p.PanelError, '^logout-failed$'):
            client.close()
        self.assertIsNone(client._token)
        client.close()
        self.connection.request.side_effect = None
        client = self.login()
        self.connection.request.side_effect = OSError('fixture-secret')
        original = ValueError('caller-error')
        self.assertFalse(client.__exit__(ValueError, original, None))
        self.assertIsNone(client._token)

    def test_failed_login_and_closed_session(self):
        for value in (None, {}, {'token': '\r\nfixture'}, {'token': 123}):
            self.connection.getresponse.return_value = Response(value)
            client = p.Client('fixture@example.invalid', 'fixture-password')
            with self.assertRaisesRegex(p.PanelError, 'login-failed'):
                client.__enter__()
            self.assertIsNone(client._credentials)
            self.assertIsNone(client._token)
            with self.assertRaisesRegex(p.PanelError, 'session-required'):
                client.call('inspectProject', p.project_payload())

    def test_invalid_builders_and_timeouts(self):
        for timeout in (True, 0, -1, 121, float('inf'), float('nan')):
            with self.assertRaises(p.PanelError):
                p.Client('fixture@example.invalid', 'fixture-password', timeout=timeout)
        for source in ('', 'x' * (p.MAX_SOURCE + 1), None, '\ud800'):
            with self.assertRaises(p.PanelError):
                p.inline_source_payload(source, trusted_source=True)
        with self.assertRaises(p.PanelError):
            p.create_compose_payload('fixture')
        with self.assertRaises(p.PanelError):
            p.containers_payload('x&service=other')

    def test_successful_inspection_is_private_bounded_json_not_logged(self):
        client = self.login()
        private = {'source': {'type': 'inline', 'content': 'private-fixture'},
                   'env': 'private-fixture', 'domains': []}
        self.connection.getresponse.return_value = Response(private)
        with mock.patch('builtins.print') as printing:
            self.assertEqual(client.call('inspectComposeService', p.service_payload()), private)
        printing.assert_not_called()

    def test_native_void_stop_is_ack_only_and_empty_reads_still_rejected(self):
        client = self.login()
        self.connection.getresponse.return_value = Response(raw=b'')
        self.assertIsNone(client.call('stopComposeService', p.service_payload()))
        with self.assertRaisesRegex(p.PanelError, 'invalid-response'):
            client.call('inspectComposeService', p.service_payload())

    def test_action_read_is_bounded_and_rejects_query_injection(self):
        client = self.login()
        self.connection.getresponse.return_value = Response({'status':'error'})
        self.assertEqual(client.call('getAction', p.action_payload('fixture-action')), {'status':'error'})
        for value in ('', '../other', 'id&projectName=other'):
            with self.assertRaises(p.PanelError):p.action_payload(value)

    def test_transport_failure_during_login_drops_credentials(self):
        client = p.Client('fixture@example.invalid', 'fixture-password')
        self.connection.request.side_effect = OSError('fixture-password')
        with self.assertRaisesRegex(p.PanelError, '^transport-failed$'):
            client.__enter__()
        self.assertIsNone(client._credentials)
        self.assertIsNone(client._token)
        self.assertEqual(self.connection.request.call_count, 1)

    def test_domain_delete_evidence_cannot_target_other_route(self):
        client = self.login(enable_domain_mutations=True)
        route = p.create_domain_payload('fixture-domain', certificate_resolver='letsencrypt')
        for bad in ({**route, 'host': 'other.invalid'},
                    {**route, 'serviceDestination': {**route['serviceDestination'], 'composeService': 'redis'}}):
            with self.assertRaises(p.PanelError):
                client.call('destroyDomain', {'id': route['id']}, domain_evidence=bad)
        with self.assertRaises(p.PanelError):
            client.call('destroyDomain', {'id': 'different'}, domain_evidence=route)


if __name__ == '__main__':
    unittest.main()
