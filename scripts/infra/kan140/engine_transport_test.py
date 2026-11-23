"""Offline HTTP fixtures only: no Docker, SSH, network or process execution."""
import copy
import http.client
import io
import json
import socket
import subprocess
import unittest
from unittest.mock import Mock, patch

import engine_transport as transport
import managed_lifecycle as lifecycle

SID = 'a' * 25
CID = 'b' * 64
FIXTURE = 'kan140-engine-fixture-' + 'c' * 16


def service(name='clica-evolution-qa_postgres'):
    return {'ID': SID, 'Version': {'Index': 17}, 'Spec': {
        'Name': name, 'Labels': {'private': 'synthetic-only'},
        'Mode': {'Replicated': {'Replicas': 1}},
        'TaskTemplate': {'ContainerSpec': {'Image': 'fixture@sha256:' + 'd' * 64,
            'Mounts': [{'Type': 'volume', 'Source': 'clica-evolution-qa_postgres_data',
                        'Target': '/var/lib/postgresql/data'}],
            'UnknownFutureField': {'keep': [True, 'exact']}}},
        'EndpointSpec': {'Mode': 'dnsrr'}, 'UnknownTopLevel': [1, {'keep': 'yes'}]}}


class FakeSocket:
    def __init__(self, raw):
        self.raw = raw

    def makefile(self, mode):
        return io.BytesIO(self.raw)


def response(value=None, status=200, *, raw=None, headers=None):
    body = json.dumps(value).encode() if raw is None else raw
    fields = {'Content-Length': str(len(body)), **(headers or {})}
    wire = ('HTTP/1.1 ' + str(status) + ' private-reason\r\n' + ''.join(
        key + ': ' + val + '\r\n' for key, val in fields.items()) + '\r\n').encode() + body
    result = http.client.HTTPResponse(FakeSocket(wire))
    result.begin()
    return result


class FakeHTTP:
    def __init__(self):
        self.queue = []
        self.requests = []
        self.connections = []
        self.clock = 100.0

    def factory(self, end, clock):
        connection = Mock()
        self.connections.append((connection, end))
        connection.request.side_effect = lambda *args, **kwargs: self.requests.append((args, kwargs))
        def getresponse():
            result = self.queue.pop(0)
            if isinstance(result, Exception):
                raise result
            return result
        connection.getresponse.side_effect = getresponse
        return connection

    def client(self, **kwargs):
        return transport.UnixEngineAPI(_connection_factory=self.factory,
                                      _monotonic=lambda: self.clock, **kwargs)

    def version(self, **kwargs):
        self.queue.append(response({'ApiVersion': '1.56', 'MinAPIVersion': '1.44', **kwargs}))


class EngineTransportTests(unittest.TestCase):
    def setUp(self):
        for target in ((socket, 'socket'), (socket, 'create_connection'),
                       (subprocess, 'Popen'), (subprocess, 'run')):
            guard = patch.object(*target, side_effect=AssertionError('live I/O forbidden'))
            guard.start()
            self.addCleanup(guard.stop)
        self.http = FakeHTTP()
        self.api = self.http.client()

    def rejected(self, operation, code=None):
        with self.assertRaises(transport.EngineError) as caught:
            operation()
        if code:
            self.assertEqual(str(caught.exception), code)
        self.assertNotIn('private', str(caught.exception))

    def inspected(self, fixture=False):
        self.http.version()
        before = service(FIXTURE) if fixture else service()
        self.http.queue.append(response(before))
        return self.api.inspect_service(SID)

    def update(self, spec, version=17, path=None):
        return self.api._post_json(path or self.api._url('/services/{0}/update', SID),
                                   params={'version': version}, data=spec)

    def test_pin_and_unversioned_probe_before_first_operation(self):
        self.inspected()
        self.assertEqual([r[0][:2] for r in self.http.requests], [
            ('GET', '/version'), ('GET', '/v1.56/services/' + SID)])
        self.assertEqual(len(self.http.connections), 2)
        self.assertTrue(all(c.close.call_count == 1 for c, _ in self.http.connections))
        for args, kwargs in self.http.requests:
            self.assertNotIn('Authorization', kwargs['headers'])
            self.assertEqual(kwargs['headers']['Connection'], 'close')

    def test_api_configuration_has_no_upgrade_or_endpoint_override(self):
        for version in ('auto', '1.55', '1.57', None):
            self.rejected(lambda: self.http.client(api_version=version))
        with self.assertRaises(TypeError):
            self.http.client(endpoint='http://remote')

    def test_server_version_range_and_invalid_versions(self):
        for fields in ({'ApiVersion': '1.55'}, {'MinAPIVersion': '1.57'},
                       {'ApiVersion': None}, {'ApiVersion': '1.56/evil'}):
            with self.subTest(fields=fields):
                api = self.http.client()
                self.http.version(**fields)
                self.rejected(lambda: api.inspect_service(SID), 'version-incompatible')
                self.assertFalse(api._verified)
        self.http.version(ApiVersion='1.60')
        self.assertEqual(self.http.client().version()['ApiVersion'], '1.60')

    def test_full_spec_preserved_and_lifecycle_compatible(self):
        before = self.inspected()
        desired = copy.deepcopy(before['Spec'])
        desired['Mode']['Replicated']['Replicas'] = 0
        after = copy.deepcopy(before)
        after['Spec'] = desired
        after['Version']['Index'] += 1
        self.http.queue.extend([response(before), response(raw=b''), response(after)])
        engine = lifecycle.Engine(self.api, full_spec_reviewed=True)
        engine.ready()
        self.assertEqual(engine.update(before, desired), after)
        args, kwargs = self.http.requests[-2]
        self.assertEqual(args, ('POST', '/v1.56/services/' + SID + '/update?version=17'))
        self.assertEqual(json.loads(kwargs['body']), desired)
        self.assertEqual(desired['UnknownTopLevel'], before['Spec']['UnknownTopLevel'])

    def test_only_replicas_and_fixed_rollback_source_can_change(self):
        before = self.inspected()
        spec = copy.deepcopy(before['Spec'])
        spec['TaskTemplate']['ContainerSpec']['Mounts'][0]['Source'] = 'kan140_rollback_postgres_data'
        self.http.queue.append(response(raw=b''))
        self.update(spec)
        self.assertEqual(json.loads(self.http.requests[-1][1]['body']), spec)

    def test_arbitrary_specs_partial_specs_and_bool_replicas_denied(self):
        before = self.inspected()
        changes = [lambda s: s.update(Name='foreign'), lambda s: s.pop('EndpointSpec'),
                   lambda s: s['TaskTemplate']['ContainerSpec'].update(Image='other'),
                   lambda s: s['UnknownTopLevel'].__setitem__(0, True),
                   lambda s: s['Mode']['Replicated'].update(Replicas=True),
                   lambda s: s['TaskTemplate']['ContainerSpec']['Mounts'][0].update(Source='foreign'),
                   lambda s: s['TaskTemplate']['ContainerSpec']['Mounts'][0].update(Target='/host')]
        for change in changes:
            spec = copy.deepcopy(before['Spec'])
            change(spec)
            self.rejected(lambda: self.update(spec), 'spec-denied')
        self.assertEqual(len(self.http.requests), 2)

    def test_cas_requires_exact_non_bool_nonnegative_index(self):
        before = self.inspected()
        for version in (16, -1, True, '17', 10**20):
            self.rejected(lambda: self.update(before['Spec'], version))
        self.assertEqual(len(self.http.requests), 2)

    def test_snapshot_is_private_copy_and_consumed_after_success(self):
        before = self.inspected()
        spec = copy.deepcopy(before['Spec'])
        before['Spec']['Name'] = 'foreign'
        self.http.queue.append(response(raw=b''))
        self.update(spec)
        self.rejected(lambda: self.update(spec), 'spec-denied')

    def test_ambiguous_mutation_cannot_replay_no_retry(self):
        before = self.inspected()
        self.http.queue.append(TimeoutError('private-daemon-body'))
        self.rejected(lambda: self.update(before['Spec']), 'transport-failed')
        self.rejected(lambda: self.update(before['Spec']), 'spec-denied')
        self.assertEqual(len(self.http.requests), 3)
        self.assertEqual(self.http.connections[-1][0].close.call_count, 1)

    def test_conflict_is_private_error_no_retry(self):
        before = self.inspected()
        self.http.queue.append(response({'message': 'private'}, status=409))
        self.rejected(lambda: self.update(before['Spec']), 'http-failed')
        self.assertEqual(len(self.http.requests), 3)

    def test_exact_fixture_scope_is_existing_service_replica_only(self):
        self.api = self.http.client(fixture_scope=FIXTURE)
        before = self.inspected(fixture=True)
        desired = copy.deepcopy(before['Spec'])
        desired['Labels']['extra'] = 'not-allowed'
        self.rejected(lambda: self.update(desired), 'spec-denied')
        desired = copy.deepcopy(before['Spec'])
        desired['Mode']['Replicated']['Replicas'] = 0
        self.http.queue.append(response(raw=b''))
        self.update(desired)
        self.rejected(lambda: self.api.stop(CID))
        self.rejected(lambda: self.api.update_container(CID, {'Name': 'no'}))

    def test_fixture_namespace_cannot_target_production_or_other_fixture(self):
        for scope in ('kan140-engine-fixture-', 'clica-evolution-qa_', FIXTURE + '/evil', ''):
            self.rejected(lambda: self.http.client(fixture_scope=scope))
        for scope, name in ((None, FIXTURE), (FIXTURE, 'clica-evolution-qa_postgres'),
                            (FIXTURE, FIXTURE + 'a')):
            api = self.http.client(fixture_scope=scope)
            self.http.version()
            self.http.queue.append(response(service(name)))
            self.rejected(lambda: api.inspect_service(SID), 'spec-denied')

    def test_invalid_ids_and_arbitrary_routes_rejected_before_io(self):
        for sid in ('short', SID + '/update', SID.upper(), '../' + SID, SID + '?x=y'):
            self.rejected(lambda: self.api.inspect_service(sid))
        for cid in ('short', CID.upper(), CID + '/exec'):
            self.rejected(lambda: self.api.inspect_container(cid))
        for path in ('/services/create', '/containers/create', '/exec/x/start',
                     'http://localhost/version', '/v1.56/services/' + SID + '/update?version=17'):
            self.rejected(lambda: self.update({}, path=path), 'operation-denied')
            if '?version=' not in path:
                self.rejected(lambda: self.api._request('POST', path), 'operation-denied')
        self.rejected(lambda: self.api._url('/services/{0}/logs', SID), 'operation-denied')
        self.assertEqual(self.http.requests, [])

    def test_inventory_and_container_inspect_shapes(self):
        self.http.version()
        self.http.queue.extend([response([{'Id': CID}]), response({'Id': CID})])
        self.assertEqual(self.api.containers(all=True), [{'Id': CID}])
        self.assertEqual(self.api.inspect_container(CID), {'Id': CID})
        self.rejected(lambda: self.api.containers(all=False))
        self.http.queue.append(response([{}] * 513))
        self.rejected(lambda: self.api.containers(), 'invalid-response')
        self.http.queue.append(response({'Id': 'foreign'}))
        self.rejected(lambda: self.api.inspect_container(CID), 'invalid-response')

    def test_container_mutations_are_only_disable_restart_and_bounded_stop(self):
        self.http.version()
        self.http.queue.extend([response({}), response(status=204, raw=b'')])
        self.api.update_container(CID, restart_policy={'Name': 'no'})
        self.api.stop(CID, timeout=30)
        self.assertEqual(json.loads(self.http.requests[-2][1]['body']), {'RestartPolicy': {'Name': 'no'}})
        self.assertTrue(self.http.requests[-1][0][1].endswith('/stop?t=30'))
        for policy in ({'Name': 'always'}, {'Name': 'no', 'MaximumRetryCount': 1}):
            self.rejected(lambda: self.api.update_container(CID, policy))
        for timeout in (-1, 31, True, 1.5):
            self.rejected(lambda: self.api.stop(CID, timeout))

    def test_redirects_http_failures_and_private_bodies(self):
        for status in (301, 302, 307, 308, 400, 401, 500):
            self.http.queue.append(response({'private': 'do-not-expose'}, status=status,
                                            headers={'Location': 'http://foreign'}))
            self.rejected(self.api.version, 'http-failed')
        self.assertEqual(len(self.http.requests), 7)

    def test_already_stopped_304_is_success_only_for_stop_not_redirect(self):
        self.http.version()
        self.http.queue.append(response(status=304, raw=b''))
        self.api.stop(CID)
        self.assertEqual(len(self.http.requests), 2)
        self.http.queue.append(response(status=304, raw=b''))
        self.rejected(self.api.version, 'http-failed')

    def test_response_limits_content_length_encoding_and_truncation(self):
        cases = [(b'x', {'Content-Length': str(transport.MAX_BYTES + 1)}, 'response-limit'),
                 (b'x', {'Content-Length': '-1'}, 'response-limit'),
                 (b'x', {'Content-Length': '8'}, 'invalid-response'),
                 (b'x', {'Content-Encoding': 'gzip'}, 'invalid-response'),
                 (b'x' * (transport.MAX_BYTES + 1), {}, 'response-limit')]
        for raw, headers, code in cases:
            self.http.queue.append(response(raw=raw, headers=headers))
            self.rejected(self.api.version, code)

    def test_chunked_limit_without_content_length(self):
        body = b'x' * (transport.MAX_BYTES + 1)
        wire = b'HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n' + (
            '%x\r\n' % len(body)).encode() + body + b'\r\n0\r\n\r\n'
        result = http.client.HTTPResponse(FakeSocket(wire))
        result.begin()
        self.http.queue.append(result)
        self.rejected(self.api.version, 'response-limit')

    def test_invalid_json_duplicate_keys_nonfinite_and_wrong_shapes(self):
        for raw in (b'not-json', b'{"ApiVersion":"1.56","ApiVersion":"1.55"}',
                    b'{"x":NaN}', b'[]', b'\xff', b'[' * 2000):
            self.http.queue.append(response(raw=raw))
            self.rejected(self.api.version, 'invalid-response')

    def test_request_limit_and_exact_response_limit(self):
        before = service()
        before['Spec']['UnknownTopLevel'] = 'x' * transport.MAX_BYTES
        # Pinning itself stays bounded; reject oversized writes before transport.
        self.api._services[SID] = before
        self.rejected(lambda: self.update(before['Spec']), 'request-limit')
        self.assertEqual(self.http.requests, [])
        raw = b'{}' + b' ' * (transport.MAX_BYTES - 2)
        self.http.queue.append(response(raw=raw))
        self.assertEqual(self.api._request('GET', '/version').body, raw)

    def test_timeouts_validate_and_overall_deadline_never_renews(self):
        for value in (0, -1, True, float('nan'), float('inf'), 901):
            self.rejected(lambda: self.http.client(overall_timeout=value))
        self.api = self.http.client(request_timeout=10, overall_timeout=12)
        self.http.version()
        self.api.version()
        self.assertEqual(self.http.connections[-1][1], 110)
        self.http.clock = 111
        self.http.version()
        self.api.version()
        self.assertEqual(self.http.connections[-1][1], 112)
        self.http.clock = 112
        self.rejected(self.api.version, 'deadline')
        self.assertEqual(len(self.http.requests), 2)

    def test_request_absolute_deadline_checked_after_response_read(self):
        self.api = self.http.client(request_timeout=1)
        result = Mock()
        result.status = 200
        result.getheader.return_value = None
        def read(size):
            self.http.clock += 2
            return b'{}'
        result.read.side_effect = read
        self.http.queue.append(result)
        self.rejected(self.api.version, 'deadline')

    def test_native_connection_fixed_unix_socket_and_no_tcp(self):
        with patch.object(transport, '_DeadlineSocket') as sock_type, \
                patch.object(transport.os, 'geteuid', return_value=0, create=True):
            conn = transport._UnixConnection(110, lambda: 100)
            conn.connect()
            sock_type.assert_called_once_with(110, unittest.mock.ANY)
            sock_type.return_value.connect.assert_called_once_with('/var/run/docker.sock')
            conn.close()
        with patch.object(transport.os, 'geteuid', return_value=1000, create=True):
            self.rejected(transport.UnixEngineAPI, 'root-required')
            self.rejected(lambda: transport._UnixConnection(110, lambda: 100).connect(), 'root-required')

    def test_socket_deadline_is_recomputed_and_receive_budget_blocks_before_io(self):
        fake = Mock()
        fake.end = 110
        fake.clock.return_value = 102
        transport._DeadlineSocket.remaining(fake)
        fake.settimeout.assert_called_once_with(8)
        fake.clock.return_value = 110
        self.rejected(lambda: transport._DeadlineSocket.remaining(fake), 'deadline')
        fake.budget = 0
        self.rejected(lambda: transport._DeadlineSocket.recv_into(fake, bytearray(8)), 'response-limit')

    def test_new_same_name_service_replaces_snapshot_not_unbounded_cache(self):
        self.inspected()
        other = service()
        other['ID'] = 'e' * 25
        self.http.queue.append(response(other))
        self.api.inspect_service(other['ID'])
        self.assertEqual(list(self.api._services), [other['ID']])

    def test_malformed_inspect_rejects_and_invalidates_old_snapshot(self):
        before = self.inspected()
        bad = copy.deepcopy(before)
        bad['ID'] = 'e' * 25
        self.http.queue.append(response(bad))
        self.rejected(lambda: self.api.inspect_service(SID), 'invalid-response')
        self.rejected(lambda: self.update(before['Spec']), 'spec-denied')

    def test_all_fixed_roles_support_only_their_rollback_volume(self):
        for role, suffix in (('postgres', 'postgres_data'), ('redis', 'redis_data'),
                             ('evolution', 'evolution_instances')):
            before = service('clica-evolution-qa_' + role)
            before['Spec']['TaskTemplate']['ContainerSpec']['Mounts'][0]['Source'] = 'clica-evolution-qa_' + suffix
            if not self.api._verified:
                self.http.version()
            self.http.queue.append(response(before))
            self.api.inspect_service(SID)
            desired = copy.deepcopy(before['Spec'])
            desired['TaskTemplate']['ContainerSpec']['Mounts'][0]['Source'] = 'kan140_rollback_' + suffix
            self.http.queue.append(response(raw=b''))
            self.update(desired)

    def test_request_limit_direct_transport_and_http_status_helper(self):
        self.rejected(lambda: self.api._request('GET', '/version', b'x' * (transport.MAX_BYTES + 1)),
                      'request-limit')
        self.rejected(lambda: self.api._raise_for_status(transport._Response(500, b'private')), 'http-failed')
        self.rejected(lambda: self.api._raise_for_status({'status': 200}), 'http-failed')
        self.assertEqual(self.http.requests, [])


if __name__ == '__main__':
    unittest.main()
