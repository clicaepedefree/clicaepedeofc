"""OFFLINE-reviewed coordinator library. No CLI, credentials, retries or routing.

Not a GO-live approval. Dependencies are supplied by a trusted installer; no
network client/daemon is constructed here. backup.lock covers even staging and
failure containment. SIGTERM callers must use interruption_handlers(). SIGKILL
leaves the durable fence and intent for manual reconciliation.

Unimplemented gates: installed Engine SDK full-ServiceSpec transport review,
exclusive daemon-mutator exclusion, worker/instance-webhook pause evidence,
backup/restore rehearsal approval, and final domain/routing gate. They cannot be
inferred from this offline suite. No automatic replay of ambiguous mutations or
partially completed rollback; no fallback to original source volumes.
"""
import copy
from contextlib import contextmanager
import hashlib
import json
import re
import signal
import time

import managed_cutover as managed
import panel_client as panel
import panel_preparation as preparation
import volume_transfer

PROJECT = 'clica-qa_evolution-qa'
ROLES = managed.ROLES
REQUIRED_GATES = frozenset(('exclusive-daemon', 'workers-paused',
                            'instance-webhooks-disabled', 'restore-rehearsed',
                            'native-preparation-pass', 'engine-full-spec-reviewed'))


class Rejected(RuntimeError):
    pass


class Interrupted(BaseException):
    pass


def require(value, code):
    if not value:
        raise Rejected(code)


def encoded(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode('ascii')


def digest(value):
    return hashlib.sha256(encoded(value)).hexdigest()


def container_pin(item):
    return digest({key: item[key] for key in ('Id', 'Config', 'Mounts', 'HostConfig')})


@contextmanager
def interruption_handlers():
    """Main-thread opt-in: first signal unwinds; further signals allow cleanup."""
    seen = False

    def interrupt(signum, frame):
        nonlocal seen
        if not seen:
            seen = True
            raise Interrupted()

    previous = {}
    try:
        for sig in (signal.SIGINT, signal.SIGTERM):
            previous[sig] = signal.signal(sig, interrupt)
        yield
    finally:
        for sig, handler in previous.items():
            signal.signal(sig, handler)


class Files:
    """Native trusted storage; backup.atomic_json fsyncs file and directory."""
    def __init__(self, backup, runtime):
        self.backup, self.runtime = backup, runtime

    def exists(self, name):
        import os
        return os.path.lexists(self.runtime.ROOT / name)

    def read(self, name):
        return self.runtime.json_object(self.runtime.trusted_bytes(self.runtime.ROOT / name))

    def write(self, name, value):
        path = self.runtime.ROOT / name
        if self.exists(name):
            self.runtime.trusted_bytes(path)
        # Keep the native writer's insertion order equal to digest()'s bytes.
        self.backup.atomic_json(path, json.loads(encoded(value)))


class Engine:
    """Injected Docker APIClient only, not shell strings or partial SDK specs.

    SDK private HTTP helpers are deliberately gated: their installed behavior
    must be reviewed before use. update_service() public kwargs can silently
    reconstruct/drop ServiceSpec fields and are NOT a safe substitute.
    """
    def __init__(self, sdk, *, full_spec_reviewed=False):
        self.sdk, self.reviewed = sdk, full_spec_reviewed

    def ready(self):
        require(self.reviewed is True and all(callable(getattr(self.sdk, name, None))
                for name in ('inspect_service', 'containers', 'inspect_container',
                             'update_container', 'stop', '_url', '_post_json',
                             '_raise_for_status')), 'engine-full-spec-unavailable')

    def service(self, sid):
        return self.sdk.inspect_service(sid)

    def update(self, before, spec):
        self.ready()
        require(self.service(before['ID']) == before, 'service-concurrent-change')
        version = before['Version']['Index']
        require(type(version) is int and version >= 0, 'service-version')
        response = self.sdk._post_json(
            self.sdk._url('/services/{0}/update', before['ID']),
            params={'version': version}, data=copy.deepcopy(spec))
        self.sdk._raise_for_status(response)
        after = self.service(before['ID'])
        require(after['ID'] == before['ID'] and after['Spec'] == spec,
                'service-update-unproven')
        return after

    def inventory(self):
        rows = self.sdk.containers(all=True)
        require(isinstance(rows, list) and len(rows) <= 512, 'inventory-limit')
        ids = [row['Id'] for row in rows]
        require(len(set(ids)) == len(ids) and all(re.fullmatch(r'[a-f0-9]{64}', cid)
                for cid in ids), 'inventory-identity')
        items = [self.sdk.inspect_container(cid) for cid in ids]
        require([item['Id'] for item in items] == ids, 'inventory-drift')
        return items

    def stop(self, cid, expected_pin):
        require(container_pin(self.sdk.inspect_container(cid)) == expected_pin,
                'container-concurrent-change')
        self.sdk.update_container(cid, restart_policy={'Name': 'no'})
        self.sdk.stop(cid, timeout=30)
        item = self.sdk.inspect_container(cid)
        require(item['State']['Running'] is False and item['State']['Restarting'] is False
                and item['HostConfig']['RestartPolicy']['Name'] == 'no', 'container-not-stopped')


class Coordinator:
    """Single-attempt cutover and explicit data-aware recover().

    backup/runtime are kan133 modules (same module instance for mutation_scope).
    stage() is managed.stage_mounts with injected Docker; transfer(phase) binds
    volume_transfer.transfer_managed(phase, private_config). Both execute only
    when this library is explicitly invoked by an external trusted caller.
    fixture is an existing preparation.Preparation built from its trusted journal.
    gates is a callable rechecking operator evidence, not a deployment flag.
    """
    def __init__(self, *, api, engine, backup, runtime, stage, transfer, fixture,
                 gates, files=None, before_deploy=None, workload_check=None, seconds=600,
                 monotonic=time.monotonic, sleep=time.sleep):
        require(type(seconds) in (int, float) and 0 < seconds <= 900, 'deadline-policy')
        self.api, self.engine, self.backup, self.runtime = api, engine, backup, runtime
        self.stage, self.transfer, self.fixture, self.gates = stage, transfer, fixture, gates
        self.files = files or Files(backup, runtime)
        self.clock, self.sleep, self.seconds = monotonic, sleep, seconds
        self.state = None
        require(before_deploy is None or callable(before_deploy), 'before-deploy-hook')
        self.before_deploy = before_deploy
        require(workload_check is None or callable(workload_check), 'workload-check-hook')
        self.workload_check = workload_check

    def checkpoint(self, phase, **values):
        self.state.update(values)
        self.state['phase'] = phase
        self.files.write('lifecycle.json', copy.deepcopy(self.state))

    def mutate(self, phase, operation):
        self.checkpoint(phase + '-intent')
        result = operation()
        self.checkpoint(phase + '-done')
        return result

    def wait(self, predicate):
        while self.clock() < self.end:
            if predicate():
                return
            self.sleep(min(0.2, max(0, self.end - self.clock())))
        raise Rejected('settle-timeout')

    def native(self):
        return preparation.service_record(self.api.call('inspectComposeService', panel.service_payload()))

    def idle(self):
        self.wait(lambda: preparation.actions_terminal(
            self.api.call('listActions', panel.actions_payload())))

    def api_mutation(self, phase, operation, payload, **kwargs):
        return self.mutate(phase, lambda: self.api.call(operation, payload, **kwargs))

    def preflight(self):
        require(self.gates() == REQUIRED_GATES, 'external-gates-unproven')
        self.engine.ready()
        require(not any((self.backup.ROOT / name).exists() for name in
                        ('maintenance.json', 'restore_lease.json')), 'maintenance-pending')

    def validate_stage(self):
        stage = self.state['stage']
        require(stage['generation'] == 2 and stage['source_sha256'] == digest(stage['compose']),
                'stage-source-drift')
        require(self.files.read('compose.json') == stage['compose'], 'stage-file-drift')
        paths = {entry['file'] for kind in ('configs', 'secrets')
                 for entry in stage['compose'][kind].values()}
        require(set(stage['mount_hashes']) == paths, 'mount-pin-set')
        for path, pin in stage['mount_hashes'].items():
            require(hashlib.sha256(self.runtime.trusted_bytes(path, mount_source=True)).hexdigest()
                    == pin, 'mount-pin-drift')
        require(set(stage['records']) == set(ROLES), 'stage-records')

    def service(self, role):
        saved = self.state['stage']['records'][role]['service']
        actual = self.engine.service(saved['ID'])
        expected = copy.deepcopy(saved['Spec'])
        replicas = actual['Spec']['Mode']['Replicated']['Replicas']
        require(type(replicas) is int and replicas in (0, 1), 'swarm-replicas')
        expected['Mode']['Replicated']['Replicas'] = replicas
        require(actual['ID'] == saved['ID'] and actual['Spec'] == expected, 'swarm-spec-drift')
        return actual

    def scale(self, role, replicas):
        before = self.service(role)
        spec = copy.deepcopy(before['Spec'])
        spec['Mode']['Replicated']['Replicas'] = replicas
        self.mutate('scale-' + role + '-' + str(replicas), lambda: self.engine.update(before, spec))

    def swarm_zero(self):
        ids = {self.service(role)['ID'] for role in ROLES}
        desired = all(self.service(role)['Spec']['Mode']['Replicated']['Replicas'] == 0 for role in ROLES)
        return desired and not any(c['Config']['Labels'].get('com.docker.swarm.service.id') in ids
                                  and (c['State']['Running'] or c['State']['Restarting'])
                                  for c in self.engine.inventory())

    def quiescent(self, volumes):
        for c in self.engine.inventory():
            if any(m.get('Name') in volumes and m.get('RW') is True for m in c['Mounts']):
                require(c['State']['Running'] is False and c['State']['Restarting'] is False
                        and c['HostConfig']['RestartPolicy']['Name'] == 'no', 'writer-not-quiescent')

    def stop_new(self):
        require(self.native().get('enabled') is False, 'controller-not-disabled')
        self.idle()
        for item in self.engine.inventory():
            labels = item['Config']['Labels']
            if labels.get('com.docker.compose.project') == PROJECT:
                if item['Id'] == self.state.get('fixture_id'):
                    require(container_pin(item) == self.state['fixture_pin'], 'fixture-container-drift')
                else:
                    self.validate_managed(item, conformance=False)
                self.mutate('stop-' + item['Id'], lambda cid=item['Id'], pin=container_pin(item):
                            self.engine.stop(cid, pin))
        self.quiescent(set(self.runtime.VOLUMES.values()))
        self.idle()
        require(self.native().get('enabled') is False, 'controller-reenabled')

    def validate_managed(self, item, *, conformance=True):
        """Validate immutable workload identity even when not yet running."""
        labels = item['Config']['Labels']
        role = labels.get('com.docker.compose.service')
        require(labels.get('com.docker.compose.project') == PROJECT and role in ROLES,
                'foreign-compose-role')
        definition = self.state['stage']['compose']['services'][role]
        require(item['Config']['Image'] == definition['image']
                and labels.get('clicaepede.owner') == 'easypanel-compose-qa'
                and labels.get('clicaepede.generation') == '2'
                and labels.get('com.docker.compose.oneoff', 'false').lower() == 'false'
                and not labels.get('com.docker.swarm.service.id'), 'compose-identity')
        data = [m for m in item['Mounts'] if m['Type'] == 'volume']
        require(len(data) == 1 and data[0]['Name'] == self.runtime.VOLUMES[role]
                and data[0]['Destination'] == managed.DESTINATIONS[role]
                and data[0]['RW'] is True, 'compose-data-mount')
        expected = set()
        for secret in definition['secrets']:
            expected.add((self.state['stage']['compose']['secrets'][secret]['file'], '/run/secrets/' + secret))
        for config in definition['configs']:
            expected.add((self.state['stage']['compose']['configs'][config['source']]['file'], config['target']))
        binds = [m for m in item['Mounts'] if m['Type'] == 'bind']
        require(len(binds) == len(expected) and
                {(m['Source'], m['Destination']) for m in binds} == expected and
                all(m['RW'] is False for m in binds), 'compose-bind-mounts')
        if conformance and self.workload_check is not None:
            self.workload_check(item)

    def verify_compose(self):
        self.validate_stage()
        rows = [c for c in self.engine.inventory()
                if c['Config']['Labels'].get('com.docker.compose.project') == PROJECT]
        workloads = []
        for item in rows:
            if item['Id'] == self.state.get('fixture_id'):
                require(container_pin(item) == self.state['fixture_pin'] and
                        item['State']['Running'] is False and
                        item['HostConfig']['RestartPolicy']['Name'] == 'no', 'fixture-container-drift')
                continue
            self.validate_managed(item)
            workloads.append(item)
        roles = [c['Config']['Labels']['com.docker.compose.service'] for c in workloads]
        require(len(roles) <= 3 and len(set(roles)) == len(roles), 'compose-count')
        require(self.swarm_zero(), 'legacy-writer-returned')
        pending = len(workloads) != 3
        for item in workloads:
            state = item['State']
            health = state.get('Health', {}).get('Status')
            require(health in (None, 'starting', 'healthy', 'unhealthy'), 'compose-health-shape')
            require(health != 'unhealthy' and state.get('Status') not in ('dead', 'exited')
                    and not state.get('OOMKilled', False), 'compose-unhealthy')
            pending |= (state['Running'] is not True or state['Restarting'] is not False
                        or health != 'healthy')
        return not pending

    def copy_data(self, phase):
        result = self.mutate('transfer-' + phase, lambda: self.transfer(phase))
        require(isinstance(result, (tuple, list)) and len(result) == 3, 'transfer-evidence')
        for row in result:
            require(set(row) == {'digest', 'entries', 'bytes'} and
                    re.fullmatch(r'[a-f0-9]{64}', row['digest']) and
                    type(row['entries']) is int and row['entries'] > 0 and
                    type(row['bytes']) is int and row['bytes'] >= 0, 'transfer-evidence')
        self.checkpoint('copied-' + phase, **{phase + '_copy': result})

    def rollback_service(self, role, records):
        saved = records[role]
        actual = self.engine.service(saved['service_id'])
        expected = copy.deepcopy(saved['spec'])
        replicas = actual['Spec']['Mode']['Replicated']['Replicas']
        require(type(replicas) is int and replicas in (0, 1), 'rollback-replicas')
        expected['Mode']['Replicated']['Replicas'] = replicas
        require(actual['ID'] == saved['service_id'] and actual['Spec'] == expected,
                'rollback-service-drift')
        mounts = expected['TaskTemplate']['ContainerSpec']['Mounts']
        require(len(mounts) == 1 and mounts[0]['Type'] == 'volume'
                and mounts[0]['Source'] == self.runtime.SWARM_VOLUMES[role]
                and mounts[0]['Target'] == managed.DESTINATIONS[role]
                and mounts[0].get('ReadOnly', False) is False, 'rollback-mount-shape')
        return actual

    def rollback_healthy(self, records, roles=ROLES):
        services = {r: self.rollback_service(r, records) for r in ROLES}
        rows = self.engine.inventory()
        ready = True
        for role in ROLES:
            service = services[role]
            writers = []
            for item in rows:
                state = item['State']
                live = state['Running'] or state['Restarting']
                attached = any(m.get('Name') == self.runtime.SWARM_VOLUMES[role]
                               and m.get('RW') is True for m in item['Mounts'])
                owned = item['Config']['Labels'].get('com.docker.swarm.service.id') == service['ID']
                if attached and (live or item['HostConfig']['RestartPolicy']['Name'] != 'no'):
                    require(owned, 'rollback-foreign-writer')
                if not owned or not live:
                    continue
                require(item['Config']['Image'] == service['Spec']['TaskTemplate']['ContainerSpec']['Image'],
                        'rollback-container-identity')
                require(len(item['Mounts']) == 1 and attached
                        and item['Mounts'][0]['Type'] == 'volume'
                        and item['Mounts'][0]['Destination'] == managed.DESTINATIONS[role],
                        'rollback-container-mount')
                writers.append(item)
            require(len(writers) <= 1, 'rollback-container-count')
            if role in roles:
                ready &= (service['Spec']['Mode']['Replicated']['Replicas'] == 1
                          and len(writers) == 1 and writers[0]['State']['Running'] is True
                          and writers[0]['State']['Restarting'] is False
                          and not writers[0]['State'].get('OOMKilled', False)
                          and writers[0]['State'].get('Health', {}).get('Status') == 'healthy')
        return ready

    def contain(self):
        # Never resume old volumes, even if deploy's response was ambiguous.
        previous_end = self.end
        self.end = self.clock() + 90
        try:
            record = self.native()
            spec = record.get('source')
            require(isinstance(spec, dict) and spec.get('type') == 'inline'
                    and isinstance(spec.get('content'), str), 'contain-source-unproven')
            try:
                source = json.loads(spec['content'])
            except (TypeError, ValueError):
                raise Rejected('contain-source-unproven') from None
            allowed = [self.state['stage']['compose']]
            if 'fixture_source' in self.state:
                allowed.append(self.state['fixture_source'])
            require(source in allowed, 'contain-source-drift')
            self.api_mutation('contain-disable', 'stopComposeService', panel.service_payload())
            require(self.native().get('enabled') is False, 'controller-not-disabled')
            self.stop_new()
        finally:
            self.end = previous_end

    def cutover(self):
        with self.backup.locked(self.backup.ROOT):
            self.end = self.clock() + self.seconds
            self.preflight()
            require(not self.files.exists('lifecycle.json') and self.runtime.load() is None,
                    'replay-or-existing-owner')
            self.state = {'schema': 1, 'phase': 'initial', 'project': PROJECT,
                          'data_authority': 'legacy',
                          'recovery_policy': {
                              'legacy': 'manual: original CURRENT data to FRESH rollback volumes; never staged copies',
                              'managed-may-have-written': 'current managed data only; partial rollback requires manual reconciliation'}}
            self.checkpoint('initial')
            try:
                require(self.fixture is not None, 'existing-fixture-required')
                self.mutate('fixture-reconcile', self.fixture.reconcile)
                item = self.fixture.wait_container()
                require(item['Config']['Labels'].get('com.docker.compose.project') == PROJECT,
                        'fixture-project-unproven')
                fixture_source = self.fixture.source
                preparation.source_matches(self.native(), fixture_source)
                self.checkpoint('fixture-pinned', fixture_id=item['Id'], fixture_pin=container_pin(item),
                                fixture_source=copy.deepcopy(fixture_source))
                stage = self.mutate('stage', self.stage)
                self.checkpoint('staged', stage=stage)
                self.validate_stage()
                self.mutate('fence', lambda: self.files.write('managed', {'schema': 1, 'generation': 1}))
                for role in ('evolution', 'postgres', 'redis'):
                    self.scale(role, 0)
                    self.wait(lambda role=role: not any(
                        c['Config']['Labels'].get('com.docker.swarm.service.id') == self.service(role)['ID']
                        and (c['State']['Running'] or c['State']['Restarting']) for c in self.engine.inventory()))
                self.wait(self.swarm_zero)
                self.quiescent(set(managed.OLD_VOLUMES.values()))
                self.copy_data('cutover')
                self.validate_stage()
                self.api_mutation('materialize-real', 'updateComposeSourceInline',
                    panel.inline_source_payload(encoded(stage['compose']).decode(), trusted_source=True), trusted_source=True)
                preparation.source_matches(self.native(), stage['compose'])
                require(self.native().get('enabled') is False, 'controller-enabled-before-deploy')
                self.idle()
                if self.before_deploy is not None:
                    self.mutate('register-native-domain', self.before_deploy)
                self.checkpoint('managed-write-boundary', data_authority='managed-may-have-written')
                self.api_mutation('deploy-once', 'deployComposeService', panel.deploy_compose_payload())
                self.idle()
                # Read-only polling never reissues deploy/create/start.
                self.wait(self.verify_compose)
                self.api_mutation('enable-existing', 'startComposeService', panel.service_payload())
                require(self.native().get('enabled') is True, 'controller-enable-unproven')
                self.idle()
                self.wait(self.verify_compose)
                owner = {'schema': 1, 'state': 'active', 'runtime': 'compose', 'generation': 2,
                         'project': PROJECT, 'source': {'path': str(self.runtime.ROOT / 'compose.json'),
                         'sha256': stage['source_sha256']}, 'services': {r: stage['compose']['services'][r]['image'] for r in ROLES},
                         'volumes': self.runtime.VOLUMES, 'mount_hashes': stage['mount_hashes']}
                self.mutate('publish-compose', lambda: self.runtime.publish(owner))
                require(self.runtime.load() == owner, 'owner-publication-unproven')
                self.checkpoint('compose-active-route-gated')
                return {'runtime': 'compose', 'generation': 2, 'routing_included': False}
            except BaseException:
                try:
                    if self.files.exists('managed'):
                        self.contain()
                except BaseException:
                    # Original exception survives; durable last intent is not erased.
                    pass
                raise

    def recover(self):
        with self.backup.locked(self.backup.ROOT):
            self.end = self.clock() + self.seconds
            self.preflight()
            self.state = self.files.read('lifecycle.json')
            recoverable = (self.state.get('schema') == 1 and self.state.get('project') == PROJECT
                    and 'cutover_copy' in self.state and not self.state.get('rollback_started')
                    and self.state.get('data_authority') == 'managed-may-have-written')
            if not recoverable:
                error = Rejected('manual-reconciliation-required')
                error.recovery_state = copy.deepcopy(self.state)
                error.allowable_recovery = self.state.get('recovery_policy', {}).get(
                    self.state.get('data_authority'), 'manual: establish current data authority before any copy or start')
                raise error
            self.validate_stage()
            require(self.files.exists('managed'), 'fence-missing')
            self.checkpoint('rollback-starting', rollback_started=True)
            try:
                # Invalidate any previous active owner without removing its durable fence.
                self.mutate('fence-rollback', lambda: self.files.write('ownership.json',
                    {'schema': 1, 'state': 'recovering', 'generation': 3}))
                self.contain()
                self.wait(self.swarm_zero)
                self.copy_data('rollback')  # CURRENT managed -> FRESH fixed rollback volumes.
                records = {}
                for role in ROLES:
                    before = self.service(role)
                    spec = copy.deepcopy(before['Spec'])
                    mounts = spec['TaskTemplate']['ContainerSpec']['Mounts']
                    require(len(mounts) == 1 and mounts[0]['Source'] == managed.OLD_VOLUMES[role]
                            and mounts[0]['Target'] == managed.DESTINATIONS[role], 'rollback-mount-shape')
                    mounts[0]['Source'] = self.runtime.SWARM_VOLUMES[role]
                    records[role] = {'service_id': before['ID'], 'spec': spec}
                    self.checkpoint('rollback-rebind-planned-' + role,
                                    rollback_services=copy.deepcopy(records))
                    self.mutate('rebind-' + role, lambda b=before, s=spec: self.engine.update(b, s))
                    self.checkpoint('rollback-rebound-' + role, rollback_services=copy.deepcopy(records))
                source = {'project': self.runtime.SWARM_PROJECT, 'services': records}
                pin = {'path': str(self.runtime.ROOT / 'swarm.json'), 'sha256': digest(source)}
                receipt = {'schema': 1, 'generation': 3, 'runtime': 'swarm',
                           'project': self.runtime.SWARM_PROJECT, 'source_sha256': pin['sha256'],
                           'compose_controller_disabled': True}
                self.mutate('write-swarm-source', lambda: self.files.write('swarm.json', source))
                self.mutate('write-disabled-receipt', lambda: self.files.write('compose-disabled.json', receipt))
                owner = {'schema': 1, 'state': 'active', 'runtime': 'swarm', 'generation': 3,
                         'project': self.runtime.SWARM_PROJECT, 'source': pin, 'mount_hashes': {},
                         'services': {r: records[r]['spec']['TaskTemplate']['ContainerSpec']['Image'] for r in ROLES},
                         'volumes': self.runtime.SWARM_VOLUMES,
                         'swarm_services': {r: {'service_id': records[r]['service_id'],
                             'container_spec_sha256': self.runtime.spec_hash(records[r]['spec']['TaskTemplate']['ContainerSpec'])} for r in ROLES},
                         'handoff': {'path': str(self.runtime.ROOT / 'compose-disabled.json'), 'sha256': digest(receipt)}}
                # Read the exact newly rebound specs directly; canonical consumers stay fenced.
                for role in ('postgres', 'redis', 'evolution'):
                    self.rollback_healthy(records, roles=())
                    service = self.rollback_service(role, records)
                    spec = copy.deepcopy(service['Spec'])
                    spec['Mode']['Replicated']['Replicas'] = 1
                    self.mutate('resume-' + role, lambda b=service, s=spec: self.engine.update(b, s))
                    self.wait(lambda role=role: self.rollback_healthy(records, roles=(role,)))
                self.quiescent(set(self.runtime.VOLUMES.values()))
                require(self.native().get('enabled') is False, 'controller-reenabled')
                self.idle()
                self.wait(lambda: self.rollback_healthy(records))
                self.mutate('publish-swarm', lambda: self.runtime.publish(owner))
                require(self.runtime.load() == owner, 'rollback-owner-unproven')
                self.checkpoint('swarm-active-route-gated')
                return {'runtime': 'swarm', 'generation': 3, 'routing_included': False}
            except BaseException:
                # Keep fence, partial destinations and full intent. Re-running is
                # forbidden; a reviewed reconciler must resolve partial rebinds.
                raise
