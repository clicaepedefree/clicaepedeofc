"""KAN140 native domain transaction. Import only; no CLI, SSH or service control.

Operator/coordinator contract (hold backup.lock AND fence panel/domain/file
writers for the entire transaction, including recovery):
  begin(expected_route_sha256) while the legacy route is still intact;
  registerNative(before_deploy_gate) AFTER all three old writers are quiesced,
    copy verified and real inline source installed, BEFORE FIRST native deploy;
  coordinator deploys once, producing the Compose domain service aliases;
  cutLegacy(native_preproof_gate) ONLY after new health/ownership, DIRECT native
    backend API 401-invalid-key/200-valid-key, native proxy config and generated
    alias proof. This is backend/config preproof, NOT public HTTPS proof;
  verifyNative(post_cut_gate) requires attributed EXTERNAL native HTTPS
    401-invalid-key/200-valid-key, TLS/redirect and proxy/access checks AFTER cut.
Legacy priority 100 can shadow the native computed priority while the old
backend is down. A pre-cut public request can therefore hit the stopped old
target: do not require it as native preproof or emit an early public PASS.
The data copy is verified before registration/deploy, never inferred from a
route snapshot, domain acknowledgement, backend response or public probe.
Rollback: coordinator fences/quiesces managed writers; rollbackRoutes(gate)
deletes our native domain and restores only the two exact legacy selectors.
Old restart and any reverse data transfer happen LATER in the coordinator.
This module never deploys, stops, starts, changes priority, volumes or data.

Operator read-only evidence for ROUTE (not read from a host by this module):
SHA256 7345f5a9ddc189d8e3a27e6c06a0119cf385cf132447ccd0c88a69fbc2f1eade.
Pass that expected hash to begin for these exact original bytes; the unit fixture
models the four-router layout, not its formatting or byte hash. This file has
ONLY two priority-3 kan131 panel blockers and two priority-100 Evolution routers.
panel_access.access_guards live in a DIFFERENT custom config. The operator MUST
separately pin and verify that file's bytes AND expected IP/panel deny rules,
including on resume and rollback. fence() must check those external pins/rules
as well as exclusive writers at every invocation. This module neither reads nor
writes that other file, merges its guards into ROUTE, nor claims to validate it.

Official contracts verified 2026-11-23:
https://easypanel.io/docs/api (base /api)
https://easypanel.io/docs/api/domains/listDomains (GET, optional project/service)
https://easypanel.io/docs/api/domains/createDomain (POST; updates Traefik)
https://easypanel.io/docs/api/domains/deleteDomain (POST, id)
The public response schema is unspecified; the operator has verified the actual
listDomains response is a bare list ([] when empty). panel_client does NOT allow
the GET.
Supply read_domains: an operator-verified, authoritative, exhaustive ADMIN read
of GET /api/listDomains WITHOUT filters, returning that list of full domain
definitions directly. No guessed envelopes, private client calls or credentials here.
Do not normalize away routing-affecting fields; unknown matching fields fail
closed. Confirm installed createDomain does not start CPU workloads and that
the first deploy generates aliases from registered domains. Neither behavior
is proved by the public wording or unit tests.

Files is an optional Linux/root adapter for the operator, never invoked on
import. Its private directory must already exist, root:root 0700; journal and
embedded before/intent snapshots are root:root 0600. A hash check alone cannot
exclude a concurrent writer between check and rename: fence() MUST assert real
exclusive writer fencing, not merely existence of backup.lock. All writes use
expected-version CAS, same-directory atomic replace, fsync, no symlink traversal.
Snapshots are forensic only: rollback always merges into CURRENT remaining JSON.
"""

import copy
import hashlib
import json
import os
from pathlib import Path
import stat
import tempfile

import panel_client


ROUTE = Path('/etc/easypanel/traefik/config/kan131-qa.yaml')
PRIVATE = Path('/etc/clicaepede/kan140/native-routing')
JOURNAL = PRIVATE / 'transaction.json'
LIMIT = 2 * 1024 * 1024
SELECTORS = ('kan131-evolution-qa-http', 'kan131-evolution-qa-https')
LEGACY_SERVICE = 'kan132-evolution'
HOST = panel_client.HOSTNAME


class Rejected(RuntimeError):
    """Static local error codes only; never remote bodies or credentials."""


def require(value, code):
    if not value:
        raise Rejected(code)


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def encode(value):
    raw = json.dumps(value, sort_keys=True, separators=(',', ':'),
                     ensure_ascii=True, allow_nan=False).encode('ascii')
    require(len(raw) <= LIMIT, 'record-limit')
    return raw


def decode(raw):
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, 'duplicate-json-key')
            result[key] = value
        return result

    def invalid(_):
        raise Rejected('invalid-json-number')

    require(type(raw) is bytes and 0 < len(raw) <= LIMIT, 'record-limit')
    try:
        result = json.loads(raw, object_pairs_hook=pairs, parse_constant=invalid)
    except (ValueError, UnicodeError, RecursionError):
        raise Rejected('invalid-json') from None
    require(type(result) is dict, 'invalid-json-object')
    return result


def legacy_routers():
    common = {'rule': 'Host(`' + HOST + '`)', 'priority': 100}
    return {
        SELECTORS[0]: {**common, 'entryPoints': ['http'],
                       'middlewares': ['kan131-https'], 'service': 'noop@internal'},
        SELECTORS[1]: {**common, 'entryPoints': ['https'], 'service': LEGACY_SERVICE,
                       'tls': {'certResolver': 'letsencrypt'}},
    }


def legacy_service():
    return {'loadBalancer': {'passHostHeader': True, 'servers': [
        {'url': 'http://clica-evolution-qa_evolution:8080'}]}}


def guards():
    """Only blockers owned by ROUTE; separate access guards are operator-pinned."""
    result = {}
    for entry in ('http', 'https'):
        row = {'rule': 'HostRegexp(`.+`)', 'ruleSyntax': 'v3', 'priority': 3,
               'entryPoints': [entry], 'service': 'noop@internal'}
        if entry == 'https':
            row['tls'] = {}
        result['kan131-block-panel-' + entry] = row
    return result


def validate_route(doc, protected, *, legacy):
    http = doc.get('http')
    require(type(http) is dict and type(http.get('routers')) is dict, 'route-shape')
    require(type(http.get('services')) is dict and type(http.get('middlewares')) is dict,
            'route-shape')
    routers = http['routers']
    require(all(routers.get(k) == v for k, v in protected.items()), 'protected-guard-drift')
    require(http.get('services', {}).get(LEGACY_SERVICE) == legacy_service(),
            'legacy-service-drift')
    require(http.get('middlewares', {}).get('kan131-https') == {
        'redirectScheme': {'scheme': 'https', 'permanent': True}}, 'legacy-redirect-drift')
    if legacy:
        require(all(routers.get(k) == v for k, v in legacy_routers().items()),
                'legacy-router-drift')
    return routers


class Files:
    """Fixed paths; external fencing closes the final CAS/rename race.

    Inject an alternate store for pure tests: read_route()->bytes,
    read_record()->bytes|None, cas_route(expected_sha, bytes),
    cas_record(expected_sha|None, bytes). A CAS failure MUST NOT write.
    A write may take effect then raise; callers recover by authoritative read.
    """

    def __init__(self, fence):
        self.fence = fence

    def _parents(self, path):
        require(os.name == 'posix' and os.geteuid() == 0, 'linux-root-required')
        require(self.fence() is True, 'writer-fence-required')
        for parent in path.parents:
            info = parent.lstat()
            require(stat.S_ISDIR(info.st_mode) and info.st_uid == 0
                    and not info.st_mode & 0o022, 'unsafe-parent')
        if path == JOURNAL:
            info = PRIVATE.lstat()
            require(info.st_gid == 0 and stat.S_IMODE(info.st_mode) == 0o700,
                    'private-directory-required')

    def _read(self, path, *, missing=False):
        self._parents(path)
        try:
            fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        except FileNotFoundError:
            require(missing, 'route-missing')
            return None
        with os.fdopen(fd, 'rb') as stream:
            before = os.fstat(stream.fileno())
            require(stat.S_ISREG(before.st_mode) and before.st_uid == 0
                    and before.st_nlink == 1 and before.st_size <= LIMIT
                    and not before.st_mode & 0o022, 'unsafe-file')
            if path == JOURNAL:
                require(before.st_gid == 0 and stat.S_IMODE(before.st_mode) == 0o600,
                        'private-record-required')
            raw = stream.read(LIMIT + 1)
            identity = lambda s: (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns,
                                  s.st_ctime_ns, s.st_mode, s.st_uid, s.st_gid, s.st_nlink)
            require(identity(before) == identity(os.fstat(stream.fileno()))
                    == identity(path.lstat()) and len(raw) == before.st_size,
                    'file-read-drift')
            return raw

    def read_route(self):
        return self._read(ROUTE)

    def read_record(self):
        return self._read(JOURNAL, missing=True)

    def _cas(self, path, expected, raw):
        decode(raw)
        self._parents(path)
        current = self._read(path, missing=path == JOURNAL)
        require((None if current is None else digest(current)) == expected, 'cas-conflict')
        info = None if path == JOURNAL else path.lstat()
        mode = 0o600 if info is None else stat.S_IMODE(info.st_mode)
        group = 0 if info is None else info.st_gid
        fd, name = tempfile.mkstemp(dir=path.parent, suffix='.tmp')
        temporary = Path(name)
        try:
            with os.fdopen(fd, 'wb') as stream:
                os.fchown(stream.fileno(), 0, group)
                os.fchmod(stream.fileno(), mode)
                stream.write(raw)
                stream.flush()
                os.fsync(stream.fileno())
            # Recheck immediately before every target write under the fence.
            current = self._read(path, missing=path == JOURNAL)
            require((None if current is None else digest(current)) == expected, 'cas-conflict')
            require(self.fence() is True, 'writer-fence-required')
            os.replace(temporary, path)
            parent = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
            try:
                os.fsync(parent)
            finally:
                os.close(parent)
        finally:
            if temporary.exists():
                temporary.unlink()

    def cas_route(self, expected, raw):
        self._cas(ROUTE, expected, raw)

    def cas_record(self, expected, raw):
        self._cas(JOURNAL, expected, raw)


class Routing:
    """Single-use durable transaction; resume by constructing with the SAME id.

    Gates are trusted fresh callbacks invoked inside the coordinator's lock.
    They return True only after their named external prerequisites are proved.
    They must NOT log keys. No gate is synthesized from API acknowledgements.
    fence() also verifies the separately pinned access-guard file and rules.
    admin_address/default_hostname are accepted only for caller compatibility;
    they do not validate access policy and are not used to construct local guards.
    """

    def __init__(self, api, store, read_domains, *, domain_id, fence,
                 admin_address=None, default_hostname=None):
        self.api, self.store, self.read_domains, self.fence = api, store, read_domains, fence
        self.domain = panel_client.create_domain_payload(domain_id, certificate_resolver='letsencrypt')
        self.protected = guards()

    def _fenced(self):
        require(self.fence() is True, 'writer-fence-required')

    def _load(self):
        self._fenced()
        raw = self.store.read_record()
        require(raw is not None, 'begin-required')
        row = decode(raw)
        require(row.get('schema') == 1 and row.get('domain') == self.domain
                and row.get('protected') == self.protected, 'transaction-identity')
        snapshot = decode(row['before_route'].encode('utf-8'))
        require(digest(row['before_route'].encode('utf-8')) == row['before_sha256'],
                'snapshot-drift')
        validate_route(snapshot, self.protected, legacy=True)
        return row, digest(raw)

    def _save(self, row, version, **changes):
        self._fenced()
        updated = {**copy.deepcopy(row), **changes}
        self.store.cas_record(version, encode(updated))
        return self._load()

    def _domains(self):
        self._fenced()
        try:
            rows = self.read_domains()
        except Exception:
            raise Rejected('domain-read-unproven') from None
        require(type(rows) is list and len(rows) <= 10000, 'domain-list-shape')
        seen, matches = set(), []
        for row in rows:
            require(type(row) is dict and type(row.get('id')) is str and row['id']
                    and type(row.get('host')) is str and row['host']
                    and type(row.get('wildcard')) is bool and row['id'] not in seen,
                    'domain-list-shape')
            seen.add(row['id'])
            host = row['host'].lower().rstrip('.')
            wildcard = row.get('wildcard') is True or host.startswith('*.')
            suffix = host.removeprefix('*.')
            overlaps = host == HOST or (wildcard and (HOST == suffix or HOST.endswith('.' + suffix)))
            if overlaps or row['id'] == self.domain['id']:
                require(row == self.domain, 'foreign-or-duplicate-domain')
                matches.append(row)
        require(len(matches) <= 1, 'foreign-or-duplicate-domain')
        return copy.deepcopy(matches[0]) if matches else None

    def begin(self, expected_route_sha256):
        self._fenced()
        require(self.store.read_record() is None, 'transaction-already-exists')
        raw = self.store.read_route()
        require(digest(raw) == expected_route_sha256, 'cas-conflict')
        validate_route(decode(raw), self.protected, legacy=True)
        require(self._domains() is None, 'native-domain-preexists')
        row = {'schema': 1, 'domain': self.domain, 'protected': self.protected,
               'before_route': raw.decode('utf-8'), 'before_sha256': digest(raw),
               'create_intent': False, 'native_verified': False,
               'cut_intent': False, 'cut_verified': False, 'external_verified': False,
               'rollback_intent': False, 'delete_intent': False,
               'delete_verified': False, 'restored': False}
        self.store.cas_record(None, encode(row))
        return self._load()[0]

    def registerNative(self, before_deploy_gate):
        """Quiesced/copied/real-inline gate; hook BEFORE the FIRST native deploy.

        Coordinator also confirms the installed createDomain implementation can
        update controller files/Traefik but cannot start workloads. Registration
        must precede override/alias generation; no second deploy is requested.
        Persist create intent before POST. An ambiguous or missing readback
        NEVER triggers another POST, even after process death/reconstruction.
        """
        row, version = self._load()
        require(not row['rollback_intent'], 'rollback-in-progress')
        require(before_deploy_gate() is True, 'before-deploy-gate-required')
        self._fenced()
        validate_route(decode(self.store.read_route()), self.protected, legacy=True)
        found = self._domains()
        if not row['create_intent']:
            require(found is None, 'native-domain-preexists')
            row, version = self._save(row, version, create_intent=True)
            try:
                self._fenced()
                self.api.call('createDomain', copy.deepcopy(self.domain))
            except Exception:
                # Readback, not the acknowledgement, decides whether create won.
                pass
            found = self._domains()
        require(found == self.domain, 'create-needs-reconciliation-no-retry')
        self._save(row, version, native_verified=True)
        return {'phase': 'native-registered-before-deploy', 'external_verified': False}

    def cutLegacy(self, native_preproof_gate):
        """Gate: healthy/ownership + DIRECT backend API 401/200 + config/alias.

        Coordinator proves the API responses belong to the new native backend,
        and native proxy config points at the generated alias for the registered
        domain. Public HTTPS is NOT a precondition: legacy priority 100 may still
        shadow native routing to a stopped old target. Only verifyNative may
        record external_verified=True after attributed public HTTPS/access proof.

        Removes ONLY the two router keys. Service, redirect, guards and unrelated
        config remain byte-value equivalent. Never adjust legacy priorities.
        """
        row, version = self._load()
        require(row['native_verified'] and not row['rollback_intent'], 'native-not-ready')
        require(native_preproof_gate() is True, 'native-preproof-required')
        self._fenced()
        require(self._domains() == self.domain, 'native-domain-missing')
        raw = self.store.read_route()
        doc = decode(raw)
        routers = validate_route(doc, self.protected, legacy=False)
        present = [key in routers for key in SELECTORS]
        if not any(present):
            require(row['cut_intent'], 'unowned-legacy-removal')
        else:
            require(all(present), 'partial-legacy-drift')
            validate_route(doc, self.protected, legacy=True)
            for key in SELECTORS:
                del routers[key]
            output = encode(doc)
            row, version = self._save(row, version, cut_intent=True,
                                      cut_before_sha256=digest(raw), cut_after_sha256=digest(output))
            self._fenced()
            require(self._domains() == self.domain, 'native-domain-missing')
            self.store.cas_route(digest(raw), output)
        current = decode(self.store.read_route())
        routers = validate_route(current, self.protected, legacy=False)
        require(not any(key in routers for key in SELECTORS), 'legacy-removal-unproven')
        self._save(row, version, cut_verified=True, external_verified=False)
        return {'phase': 'legacy-selectors-removed', 'external_verified': False}

    def verifyNative(self, post_cut_gate):
        """Post-cut EXTERNAL HTTPS 401/200 + TLS/redirect + proxy/access checks.

        Require attribution to the new native backend, not just matching status
        codes or earlier direct-backend/config evidence. Test doubles prove none
        of these external properties. External access guards remain pinned.
        """
        row, version = self._load()
        require(row['cut_verified'] and not row['rollback_intent'], 'cut-required')
        require(self._domains() == self.domain, 'native-domain-missing')
        routers = validate_route(decode(self.store.read_route()), self.protected, legacy=False)
        require(not any(key in routers for key in SELECTORS), 'legacy-still-present')
        require(post_cut_gate() is True, 'external-native-gate-required')
        self._save(row, version, external_verified=True)
        return {'phase': 'native-external-gate-passed', 'external_verified': True}

    def deleteNative(self):
        """Rollback-only; fresh full readback evidence, never arbitrary id deletion."""
        row, version = self._load()
        require(row['rollback_intent'], 'rollback-gate-required')
        found = self._domains()
        require(found is not None or not row['create_intent'] or row['native_verified']
                or row['delete_intent'], 'native-create-outcome-unknown')
        if found is not None:
            require(row['create_intent'], 'unowned-native-domain')
            require(not row['delete_intent'], 'delete-needs-reconciliation-no-retry')
            row, version = self._save(row, version, delete_intent=True)
            evidence = self._domains()
            require(evidence == self.domain, 'native-domain-drift')
            try:
                self._fenced()
                self.api.call('destroyDomain', panel_client.destroy_domain_payload(evidence),
                              domain_evidence=evidence)
            except Exception:
                pass
        require(self._domains() is None, 'delete-needs-reconciliation-no-retry')
        self._save(row, version, delete_verified=True, external_verified=False)

    def rollbackRoutes(self, managed_quiesced_gate):
        """No old restart: coordinator must handle data/writer rollback separately.

        Refuse foreign occupants BEFORE domain deletion. If either write has
        uncertain outcome, resume this method from its journal; no POST retry.
        """
        row, version = self._load()
        require(managed_quiesced_gate() is True, 'managed-quiesced-gate-required')
        self._fenced()
        raw = self.store.read_route()
        doc = decode(raw)
        routers = validate_route(doc, self.protected, legacy=False)
        for key, value in legacy_routers().items():
            require(key not in routers or routers[key] == value, 'foreign-legacy-selector')
            if key not in routers:
                require(row['cut_intent'], 'unowned-legacy-removal')
        row, version = self._save(row, version, rollback_intent=True, external_verified=False)
        self.deleteNative()
        row, version = self._load()
        # Re-read AFTER deletion: preserve changes made since the precheck.
        raw = self.store.read_route()
        doc = decode(raw)
        routers = validate_route(doc, self.protected, legacy=False)
        for key, value in legacy_routers().items():
            require(key not in routers or routers[key] == value, 'foreign-legacy-selector')
            require(key in routers or row['cut_intent'], 'unowned-legacy-removal')
        if any(key not in routers for key in SELECTORS):
            routers.update(legacy_routers())
            output = encode(doc)
            row, version = self._save(row, version, restore_intent_sha256=digest(raw),
                                      restore_after_sha256=digest(output))
            self._fenced()
            self.store.cas_route(digest(raw), output)
        validate_route(decode(self.store.read_route()), self.protected, legacy=True)
        require(self._domains() is None, 'native-delete-unproven')
        self._save(row, version, restored=True)
        return {'phase': 'routing-rollback-complete-old-restart-pending',
                'old_restarted': False, 'data_rollback_proven': False}
