"""KAN140 in-memory EasyPanel sidecar; no CLI or automatic orchestration.

Only the trusted root orchestrator imports this file on the server. It supplies
credentials decrypted from its SSH-encrypted payload, never argv/env/tempfiles.
Source content is executable infrastructure: the caller MUST authenticate and
validate root-owned source/pins and fence writers BEFORE create (which deploys).
This module neither obtains credentials nor establishes SSH nor writes files.
Python strings cannot guarantee cryptographic memory erasure; do not dump locals.

Contracts reviewed 2026-11-22 against official pages and their embedded OpenAPI:
https://easypanel.io/docs/api
https://easypanel.io/docs/api/authentication/login
https://easypanel.io/docs/api/authentication/logout
https://easypanel.io/docs/api/projects/inspectProject
https://easypanel.io/docs/api/projects/getDockerContainers
https://easypanel.io/docs/api/services/compose/inspectComposeService
https://easypanel.io/docs/api/services/compose/createComposeService
https://easypanel.io/docs/api/services/compose/stopComposeService
https://easypanel.io/docs/api/services/compose/updateComposeSourceInline
https://easypanel.io/docs/api/services/compose/deployComposeService
https://easypanel.io/docs/api/services/compose/startComposeService
https://easypanel.io/docs/api/domains/createDomain
https://easypanel.io/docs/api/domains/deleteDomain
https://easypanel.io/docs/services/compose

getServiceContainers/destroyDomain are LOCAL aliases, not guessed API paths.
The documented wire names are getDockerContainers/deleteDomain. Container query
is a single `service` string; caller supplies its independently verified Docker
Compose project identity (the API reference does not specify its derivation).
Create auto-deploys; stop disables the controller; start enables it. Updating
inline source alone does not deploy. No retry, including after ambiguous failure.
Domain schema: destinationType=service, serviceDestination.composeService,
serviceDestination.path; NOT type=compose or servicePath. https=True requests
native TLS, with the caller-confirmed ACME resolver. No redirect flag exists in
this schema: verify native HTTP->HTTPS behavior at the cutover gate, do not claim
it was proved by constructing a request. No custom proxy route is installed.
Response schemas are unconstrained in the published OpenAPI (null is an example,
not a useful inspect schema). Reads return bounded private JSON to the trusted
caller; never log/repr those values. Errors expose only local static codes.

Host-file compatibility investigation (no server inspected or modified):
EasyPanel documents `docker compose up --build -d`, not stack deploy, and does
not specify the execution namespace or any configs.file/secrets.file rewriting.
Docker's bind-mount documentation places source paths on the daemon host:
https://docs.docker.com/engine/storage/bind-mounts/
In upstream Compose v2.39.4 create.go, buildContainerConfigMounts constructs a
read-only bind from config.File, without reading/stat-ing the config content.
buildContainerSecretMounts stat-s secret.File but only WARNS on missing files,
then constructs a read-only bind with CreateHostPath=false. Both retain absolute
source paths. File-backed uid/gid/mode overrides are ignored in that version;
the host files' ownership/mode must already be correct for workload users.
https://raw.githubusercontent.com/docker/compose/v2.39.4/pkg/compose/create.go
The upstream maintainer explicitly recommends absolute daemon-host paths:
https://github.com/docker/compose/issues/11867
Therefore a missing panel-container mount alone does NOT prove incompatibility.
Inference: /etc/clicaepede/kan140/{configs,mount-secrets} can work as native
daemon-side binds, even if the Compose CLI cannot see those paths. This is NOT
proof for the installed EasyPanel build/its preprocessing/Compose version.
Coordinator gate: establish actual panel mounts, deployment execution namespace,
Compose version and any file validation/preprocessing using read-only metadata
and a separate approved non-secret rehearsal BEFORE create's automatic deploy.
If client-side reads are actually required, a same-absolute-path read-only mount
of only configs and mount-secrets into the panel is a possible operator-approved
fallback, not an action of this client. It changes the panel service, can restart
its task, and exposes those files to the panel. Do not mount the whole canonical
tree (which may include credentials), copy secrets into inline YAML, or silently
relocate paths. No such service update has been performed or automated here.
"""

import http.client
import json
import math
import re
from types import MappingProxyType
from urllib.parse import urlencode


BASE_URL = 'http://127.0.0.1:3000/api'
PROJECT = 'clica-qa'
SERVICE = 'evolution-qa'
HOSTNAME = 'evolution-staging.clicaepede.com.br'
MAX_RESPONSE = 2 * 1024 * 1024
MAX_REQUEST = 2 * 1024 * 1024
MAX_SOURCE = 1024 * 1024
OPERATIONS = MappingProxyType({
    'listDomains': ('GET', 'listDomains'),
    'getAction': ('GET', 'getAction'),
    'listActions': ('GET', 'listActions'),
    'inspectProject': ('GET', 'inspectProject'),
    'inspectComposeService': ('GET', 'inspectComposeService'),
    'getServiceContainers': ('GET', 'getDockerContainers'),
    'createComposeService': ('POST', 'createComposeService'),
    'stopComposeService': ('POST', 'stopComposeService'),
    'updateComposeSourceInline': ('POST', 'updateComposeSourceInline'),
    'deployComposeService': ('POST', 'deployComposeService'),
    'startComposeService': ('POST', 'startComposeService'),
    'createDomain': ('POST', 'createDomain'),
    'destroyDomain': ('POST', 'deleteDomain'),
})
_ERRORS = frozenset(('invalid-input', 'operation-denied', 'domain-denied',
                     'session-required', 'session-active', 'transport-failed',
                     'http-failed', 'response-limit', 'invalid-response',
                     'login-failed', 'logout-failed'))


class PanelError(RuntimeError):
    """No remote message, status text, body, headers, URL or credentials."""

    def __init__(self, code):
        self.code = code if code in _ERRORS else 'invalid-response'
        super().__init__(self.code)


def _require(condition):
    if not condition:
        raise PanelError('invalid-input')


def _text(value, limit=128):
    _require(type(value) is str and 0 < len(value) <= limit)
    try:
        size = len(value.encode('utf-8'))
    except UnicodeError:
        raise PanelError('invalid-input') from None
    _require(size <= limit)
    return value


def project_payload():
    return {'projectName': PROJECT}


def actions_payload():
    return {**service_payload(), 'limit': 20}


def action_payload(verified_action_id):
    value = _text(verified_action_id)
    _require(re.fullmatch(r'[A-Za-z0-9_-]+', value) is not None)
    return {'id': value}


def service_payload():
    return {**project_payload(), 'serviceName': SERVICE}


def containers_payload(verified_compose_project):
    """Identity must come from root-verified runtime metadata, not a guess."""
    value = _text(verified_compose_project)
    _require(re.fullmatch(r'[a-z0-9][a-z0-9_-]*', value) is not None)
    return {'service': value}


def inline_source_payload(content, *, trusted_source=False):
    _require(trusted_source is True)
    return {**service_payload(), 'content': _text(content, MAX_SOURCE)}


def create_compose_payload(content, *, trusted_source=False):
    source = inline_source_payload(content, trusted_source=trusted_source)
    return {**service_payload(), 'source': {'type': 'inline',
                                          'content': source['content']}}


def deploy_compose_payload(*, force_rebuild=False):
    _require(type(force_rebuild) is bool)
    return {**service_payload(), 'forceRebuild': force_rebuild}


def create_domain_payload(domain_id, *, certificate_resolver):
    """Resolver name must be confirmed by root operator on this installation."""
    _require(re.fullmatch(r'[A-Za-z0-9_-]+', _text(domain_id)) is not None)
    _require(re.fullmatch(r'[A-Za-z0-9_-]+', _text(certificate_resolver)) is not None)
    return {'id': domain_id, 'host': HOSTNAME, 'path': '/', 'https': True,
            'wildcard': False, 'certificateResolver': certificate_resolver,
            'middlewares': [], 'destinationType': 'service',
            'serviceDestination': {**service_payload(), 'composeService': 'evolution',
                                   'port': 8080, 'protocol': 'http', 'path': '/'}}


def destroy_domain_payload(inspected_domain):
    """Delete only a root-verified native Evolution route, never an arbitrary id."""
    _require(type(inspected_domain) is dict)
    expected = create_domain_payload(inspected_domain.get('id'),
                                    certificate_resolver=inspected_domain.get('certificateResolver'))
    _require(inspected_domain == expected)
    return {'id': expected['id']}


def _validate(operation, payload, trusted_source):
    _require(type(payload) is dict)
    if operation == 'listDomains':
        expected = {}
    elif operation == 'getAction':
        expected = action_payload(payload.get('id'))
    elif operation == 'listActions':
        expected = actions_payload()
        _require(type(payload.get('limit')) is int)
    elif operation == 'inspectProject':
        expected = project_payload()
    elif operation == 'getServiceContainers':
        expected = containers_payload(payload.get('service'))
    elif operation == 'createComposeService':
        source = payload.get('source')
        _require(type(source) is dict)
        expected = create_compose_payload(source.get('content'), trusted_source=trusted_source)
    elif operation == 'updateComposeSourceInline':
        expected = inline_source_payload(payload.get('content'), trusted_source=trusted_source)
    elif operation == 'deployComposeService':
        expected = deploy_compose_payload(force_rebuild=payload.get('forceRebuild', False))
        if 'forceRebuild' not in payload:
            expected.pop('forceRebuild')
    elif operation == 'createDomain':
        expected = create_domain_payload(payload.get('id'),
                                         certificate_resolver=payload.get('certificateResolver'))
        _require(type(payload.get('https')) is bool and type(payload.get('wildcard')) is bool)
        _require(type(payload.get('serviceDestination')) is dict
                 and type(payload['serviceDestination'].get('port')) is int)
    elif operation == 'destroyDomain':
        _require(set(payload) == {'id'})
        _require(re.fullmatch(r'[A-Za-z0-9_-]+', _text(payload.get('id'))) is not None)
        expected = payload
    else:
        expected = service_payload()
    _require(payload == expected)


class Client:
    """Fixed loopback transport; use `with Client(email, password) as panel`.

    Domain calls additionally require enable_domain_mutations=True and deletion
    requires the full root-inspected route as domain_evidence. Never thread-share.
    No credentials are read from disk, environment or command-line arguments.
    """

    def __init__(self, email, password, *, timeout=15, enable_domain_mutations=False):
        _require(type(timeout) in (int, float) and math.isfinite(timeout) and 0 < timeout <= 120)
        _require(type(enable_domain_mutations) is bool)
        _text(email, 320)
        _require(re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email) is not None)
        _text(password, 4096)
        self._credentials = {'email': email, 'password': password, 'rememberMe': False}
        self._token = None
        self._timeout = timeout
        self._domains = enable_domain_mutations

    def __repr__(self):
        return '<Client loopback credentials=redacted>'

    def _request(self, method, endpoint, payload=None):
        connection = None
        try:
            path = '/api/' + endpoint
            body = None
            headers = {'Accept': 'application/json', 'Accept-Encoding': 'identity'}
            if self._token is not None:
                headers['Authorization'] = 'Bearer ' + self._token
            if method == 'GET':
                path += '?' + urlencode(payload)
            elif payload is not None:
                body = json.dumps(payload, ensure_ascii=True, allow_nan=False).encode('ascii')
                _require(len(body) <= MAX_REQUEST)
                headers['Content-Type'] = 'application/json'
            # HTTPConnection has no proxy discovery, cookie jar, redirect or retry.
            connection = http.client.HTTPConnection('127.0.0.1', 3000, timeout=self._timeout)
            connection.request(method, path, body=body, headers=headers)
            response = connection.getresponse()
            if response.status != 200:
                raise PanelError('http-failed')
            if response.getheader('Content-Encoding', 'identity').lower() != 'identity':
                raise PanelError('invalid-response')
            raw = response.read(MAX_RESPONSE + 1)
            if len(raw) > MAX_RESPONSE:
                raise PanelError('response-limit')
            # Native 2.38 returns empty HTTP200 for void mutations. This is an
            # acknowledgement only: callers must inspect authoritative state.
            if method == 'POST' and endpoint in ({'logout'} | {
                    path for verb, path in OPERATIONS.values() if verb == 'POST'}) and raw == b'':
                return None
            try:
                return json.loads(raw.decode('utf-8'), parse_constant=_invalid_constant)
            except (ValueError, UnicodeError, RecursionError):
                raise PanelError('invalid-response') from None
        except PanelError:
            raise
        except Exception:
            raise PanelError('transport-failed') from None
        finally:
            if connection is not None:
                try:
                    connection.close()
                except Exception:
                    pass

    def __enter__(self):
        if self._token is not None or self._credentials is None:
            raise PanelError('session-active')
        try:
            result = self._request('POST', 'login', self._credentials)
            # The reference does not publish a response shape; accept only the
            # token itself or its explicit `token` field, never arbitrary keys.
            token = result.get('token') if type(result) is dict else result
            if type(token) is not str or re.fullmatch(r'[A-Za-z0-9._~+/=-]{1,8192}', token) is None:
                raise PanelError('login-failed')
            self._token = token
            return self
        finally:
            self._credentials = None

    def close(self):
        self._credentials = None
        if self._token is None:
            return
        try:
            self._request('POST', 'logout')
        except Exception:
            raise PanelError('logout-failed') from None
        finally:
            self._token = None

    def __exit__(self, exc_type, exc, tb):
        try:
            self.close()
        except PanelError:
            if exc_type is None:
                raise
            # Preserve the original failure without printing a logout exception.
        return False

    def call(self, operation, payload, *, trusted_source=False, domain_evidence=None):
        if type(operation) is not str or operation not in OPERATIONS:
            raise PanelError('operation-denied')
        if self._token is None:
            raise PanelError('session-required')
        _validate(operation, payload, trusted_source)
        if operation in ('createDomain', 'destroyDomain'):
            if not self._domains:
                raise PanelError('domain-denied')
            if operation == 'destroyDomain':
                _require(destroy_domain_payload(domain_evidence) == payload)
        method, endpoint = OPERATIONS[operation]
        return self._request(method, endpoint, payload)


def _invalid_constant(_value):
    raise ValueError('invalid-response')
