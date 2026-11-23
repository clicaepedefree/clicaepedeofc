"""Root-only, stdlib Docker Unix adapter for managed_lifecycle.Engine.sdk.

No CLI, RPC execution, credentials, logging, retries, redirects or service create.
API 1.56 is pinned, never auto-upgraded; /version independently checks support.
Only the lifecycle routes below exist, not a denylist of arbitrary endpoints.
IDs/ownership/locks and exclusive-mutator gates remain the caller's duty.
Full specs retain unknown fields, but only replicas and fixed rollback sources
may change. An optional exact fixture name allows replica-only updates of an
EXISTING synthetic service, not arbitrary JSON or fixture creation/cleanup.

Each request has an absolute deadline (including headers/body); the instance
also has a nonrenewable overall deadline. Discard it after an ambiguous write;
never replay automatically. Responses/spec snapshots are private: do not log.
Injected connection factories/clocks are trusted offline test dependencies,
not alternate endpoints or a security boundary against Python code execution.
Native full-spec/CAS review and isolated probe remain separate GO-live gates.
Contract: https://docs.docker.com/reference/api/engine/version/v1.56.yaml
"""
import copy
import http.client
import json
import math
import os
import re
import socket
import time
from dataclasses import dataclass

SOCKET = '/var/run/docker.sock'
API_VERSION = '1.56'
MAX_BYTES = 2 * 1024 * 1024
_ERRORS = frozenset(('invalid-input', 'operation-denied', 'root-required',
                     'deadline', 'transport-failed', 'http-failed',
                     'response-limit', 'request-limit', 'invalid-response',
                     'version-incompatible', 'spec-denied'))
_ROLES = ('postgres', 'redis', 'evolution')
_SUFFIXES = dict(zip(_ROLES, ('postgres_data', 'redis_data', 'evolution_instances')))


class EngineError(RuntimeError):
    def __init__(self, code):
        super().__init__(code if code in _ERRORS else 'invalid-response')


def _require(value, code='invalid-input'):
    if not value:
        raise EngineError(code)


def _id(value, service=False):
    _require(type(value) is str and re.fullmatch(
        r'[a-z0-9]{25}' if service else r'[a-f0-9]{64}', value))
    return value


def _seconds(value, maximum):
    _require(type(value) in (int, float) and math.isfinite(value) and 0 < value <= maximum)
    return value


def _json(raw):
    def pairs(items):
        result = {}
        for key, value in items:
            _require(key not in result, 'invalid-response')
            result[key] = value
        return result

    def constant(value):
        raise EngineError('invalid-response')

    try:
        return json.loads(raw.decode('utf-8'), object_pairs_hook=pairs, parse_constant=constant)
    except (ValueError, UnicodeError, RecursionError):
        raise EngineError('invalid-response') from None


class _DeadlineSocket(socket.socket):
    """SocketIO calls recv_into even while http.client parses slow headers."""
    def __init__(self, end, clock):
        super().__init__(socket.AF_UNIX, socket.SOCK_STREAM)
        self.end, self.clock = end, clock
        self.budget = MAX_BYTES + 65536

    def remaining(self):
        seconds = self.end - self.clock()
        _require(seconds > 0, 'deadline')
        self.settimeout(seconds)

    def recv_into(self, buffer, nbytes=0, flags=0):
        self.remaining()
        _require(self.budget > 0, 'response-limit')
        count = super().recv_into(buffer, min(nbytes or len(buffer), self.budget), flags)
        self.budget -= count
        return count

    def sendall(self, data, flags=0):
        self.remaining()
        return super().sendall(data, flags)


class _UnixConnection(http.client.HTTPConnection):
    def __init__(self, end, clock):
        super().__init__('localhost')
        self.end, self.clock = end, clock

    def connect(self):
        _require(hasattr(os, 'geteuid') and os.geteuid() == 0, 'root-required')
        sock = _DeadlineSocket(self.end, self.clock)
        self.sock = sock
        sock.remaining()
        sock.connect(SOCKET)


@dataclass(frozen=True, repr=False)
class _Response:
    status: int
    body: bytes


class UnixEngineAPI:
    def __init__(self, *, api_version=API_VERSION, request_timeout=40,
                 overall_timeout=900, fixture_scope=None,
                 _connection_factory=None, _monotonic=time.monotonic):
        _require(api_version == API_VERSION)
        _seconds(request_timeout, 60)
        _seconds(overall_timeout, 900)
        _require(fixture_scope is None or (type(fixture_scope) is str and
                 re.fullmatch(r'kan140-engine-fixture-[a-f0-9]{16,32}', fixture_scope)))
        if _connection_factory is None:
            _require(hasattr(os, 'geteuid') and os.geteuid() == 0, 'root-required')
        self._factory = _connection_factory or _UnixConnection
        self._clock = _monotonic
        self._end = self._clock() + overall_timeout
        self._timeout, self._fixture = request_timeout, fixture_scope
        self._verified = False
        self._services = {}

    def _remaining(self):
        remaining = self._end - self._clock()
        _require(remaining > 0, 'deadline')
        return remaining

    def _request(self, method, path, body=None):
        # Defense in depth: even private helpers cannot select arbitrary routes.
        allowed = ((method == 'GET' and path in ('/version', '/v1.56/containers/json?all=1')) or
                   (method == 'GET' and re.fullmatch(r'/v1\.56/services/[a-z0-9]{25}', path)) or
                   (method == 'GET' and re.fullmatch(r'/v1\.56/containers/[a-f0-9]{64}/json', path)) or
                   (method == 'POST' and re.fullmatch(
                       r'/v1\.56/(services/[a-z0-9]{25}/update\?version=[0-9]{1,20}|'
                       r'containers/[a-f0-9]{64}/(update|stop\?t=([0-9]|[12][0-9]|30)))', path)))
        _require(allowed, 'operation-denied')
        _require(body is None or type(body) is bytes and len(body) <= MAX_BYTES, 'request-limit')
        end = self._clock() + min(self._timeout, self._remaining())
        connection = None
        response = None
        try:
            connection = self._factory(end, self._clock)
            headers = {'Accept': 'application/json', 'Connection': 'close'}
            if body is not None:
                headers['Content-Type'] = 'application/json'
            connection.request(method, path, body=body, headers=headers)
            response = connection.getresponse()
            length = response.getheader('Content-Length')
            if length is not None:
                _require(re.fullmatch(r'[0-9]{1,10}', length) and int(length) <= MAX_BYTES,
                         'response-limit')
            _require(response.getheader('Content-Encoding') in (None, 'identity'), 'invalid-response')
            # A redirect is an error, never a new request. Do not consume its body.
            stopped = (response.status == 304 and method == 'POST' and
                       re.fullmatch(r'/v1\.56/containers/[a-f0-9]{64}/stop\?t=([0-9]|[12][0-9]|30)', path))
            _require(200 <= response.status < 300 or stopped, 'http-failed')
            raw = response.read(MAX_BYTES + 1)
            _require(len(raw) <= MAX_BYTES, 'response-limit')
            _require(length is None or len(raw) == int(length), 'invalid-response')
            _require(self._clock() < end, 'deadline')
            # Docker's stop-only 304 is a successful already-stopped outcome.
            return _Response(204 if stopped else response.status, raw)
        except EngineError:
            raise
        except Exception:
            raise EngineError('transport-failed') from None
        finally:
            if response is not None:
                try:
                    response.close()
                except Exception:
                    pass
            if connection is not None:
                try:
                    connection.close()
                except Exception:
                    pass

    def version(self):
        """Read-only unversioned probe; require the server to support the pin."""
        self._verified = False
        value = _json(self._request('GET', '/version').body)
        _require(type(value) is dict, 'invalid-response')
        def number(key):
            item = value.get(key)
            _require(type(item) is str and re.fullmatch(r'1\.[0-9]{1,3}', item),
                     'version-incompatible')
            return tuple(map(int, item.split('.')))
        _require(number('MinAPIVersion') <= (1, 56) <= number('ApiVersion'), 'version-incompatible')
        self._verified = True
        return value

    def _ready(self):
        self._remaining()
        if not self._verified:
            self.version()

    def inspect_service(self, sid):
        sid = _id(sid, True)
        self._services.pop(sid, None)
        self._ready()
        value = _json(self._request('GET', '/v1.56/services/' + sid).body)
        try:
            spec, version = value['Spec'], value['Version']['Index']
            _require(value['ID'] == sid and type(spec) is dict and type(version) is int
                     and 0 <= version < 10**20, 'invalid-response')
            names = (self._fixture,) if self._fixture else tuple('clica-evolution-qa_' + r for r in _ROLES)
            _require(spec['Name'] in names, 'spec-denied')
            # Keep at most one private snapshot per allowed service name.
            for previous in list(self._services):
                if self._services[previous]['Spec']['Name'] == spec['Name']:
                    del self._services[previous]
            self._services[sid] = copy.deepcopy(value)
        except (KeyError, TypeError, RecursionError):
            raise EngineError('invalid-response') from None
        return value

    def containers(self, all=True):
        _require(all is True)
        self._ready()
        value = _json(self._request('GET', '/v1.56/containers/json?all=1').body)
        _require(type(value) is list and len(value) <= 512, 'invalid-response')
        return value

    def inspect_container(self, cid):
        cid = _id(cid)
        self._ready()
        value = _json(self._request('GET', '/v1.56/containers/' + cid + '/json').body)
        _require(type(value) is dict and value.get('Id') == cid, 'invalid-response')
        return value

    def update_container(self, cid, restart_policy):
        cid = _id(cid)
        _require(self._fixture is None and restart_policy == {'Name': 'no'})
        self._ready()
        response = self._request('POST', '/v1.56/containers/' + cid + '/update',
                                 b'{"RestartPolicy":{"Name":"no"}}')
        self._raise_for_status(response)

    def stop(self, cid, timeout=30):
        cid = _id(cid)
        _require(self._fixture is None and type(timeout) is int and 0 <= timeout <= 30)
        self._ready()
        self._raise_for_status(self._request('POST', '/v1.56/containers/' + cid + '/stop?t=' + str(timeout)))

    def _url(self, template, sid):
        _require(template == '/services/{0}/update', 'operation-denied')
        return '/v1.56/services/' + _id(sid, True) + '/update'

    def _post_json(self, path, *, params, data):
        _require(type(path) is str and re.fullmatch(r'/v1\.56/services/[a-z0-9]{25}/update', path),
                 'operation-denied')
        _require(type(params) is dict and set(params) == {'version'} and
                 type(params['version']) is int and 0 <= params['version'] < 10**20)
        sid = path.split('/')[3]
        try:
            before = self._services[sid]
            _require(before['Version']['Index'] == params['version'], 'spec-denied')
            expected = copy.deepcopy(before['Spec'])
            replicas = data['Mode']['Replicated']['Replicas']
            _require(type(replicas) is int and replicas in (0, 1), 'spec-denied')
            expected['Mode']['Replicated']['Replicas'] = replicas
            if not self._fixture:
                role = expected['Name'].removeprefix('clica-evolution-qa_')
                mounts = expected['TaskTemplate']['ContainerSpec'].get('Mounts', [])
                new_mounts = data['TaskTemplate']['ContainerSpec'].get('Mounts', [])
                if mounts != new_mounts:
                    _require(len(mounts) == len(new_mounts) == 1 and mounts[0]['Type'] == 'volume'
                             and mounts[0]['Source'] == 'clica-evolution-qa_' + _SUFFIXES[role], 'spec-denied')
                    mounts[0]['Source'] = 'kan140_rollback_' + _SUFFIXES[role]
            body = json.dumps(data, ensure_ascii=True, separators=(',', ':'), allow_nan=False).encode('ascii')
            # Python equality conflates True/1 and 1/1.0; JSON must not.
            canonical = lambda item: json.dumps(item, sort_keys=True, separators=(',', ':'), allow_nan=False)
            _require(canonical(data) == canonical(expected), 'spec-denied')
        except EngineError:
            raise
        except (KeyError, TypeError, ValueError, RecursionError):
            raise EngineError('spec-denied') from None
        _require(len(body) <= MAX_BYTES, 'request-limit')
        self._ready()
        # Consume the snapshot BEFORE sending: a timeout must not enable replay.
        self._services.pop(sid)
        return self._request('POST', path + '?version=' + str(params['version']), body)

    @staticmethod
    def _raise_for_status(response):
        _require(type(response) is _Response and 200 <= response.status < 300, 'http-failed')
