"""Offline lifecycle/fault tests: every dependency is an in-memory double."""
import copy
from contextlib import contextmanager
import importlib.util
import json
import hashlib
from pathlib import Path, PurePosixPath
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import managed_lifecycle as lifecycle


class Memory:
    def __init__(self):
        self.values = {}
        self.events = []
        self.held = False

    def exists(self, name):
        return name in self.values

    def read(self, name):
        return copy.deepcopy(self.values[name])

    def write(self, name, value):
        assert self.held, 'mutation outside backup.lock'
        self.values[name] = copy.deepcopy(value)
        if name == 'lifecycle.json':
            self.events.append(value['phase'])

    def mutation(self):
        assert self.held
        assert self.events[-1].endswith('-intent')


class SDK:
    def __init__(self, memory):
        self.memory = memory
        self.services = {}
        self.items = {}
        self.updates = []
        self.stopped = []

    def inspect_service(self, sid):
        return copy.deepcopy(self.services[sid])

    def containers(self, all):
        assert all is True
        return [{'Id': cid} for cid in self.items]

    def inspect_container(self, cid):
        return copy.deepcopy(self.items[cid])

    def _url(self, route, sid):
        return route.format(sid)

    def _post_json(self, url, params, data):
        self.memory.mutation()
        sid = url.split('/')[2]
        before = self.services[sid]
        assert params == {'version': before['Version']['Index']}
        self.updates.append(copy.deepcopy(data))
        before['Spec'] = copy.deepcopy(data)
        before['Version']['Index'] += 1
        role = data['Name'].split('_')[-1]
        replicas = data['Mode']['Replicated']['Replicas']
        for item in self.items.values():
            if item['Config']['Labels'].get('com.docker.swarm.service.id') == sid:
                item['State']['Running'] = False
        if replicas and any(m['Source'].startswith('kan140_rollback_')
                            for m in data['TaskTemplate']['ContainerSpec']['Mounts']):
            cid = ('d' if role == 'postgres' else 'e' if role == 'redis' else 'f') * 64
            self.items[cid] = container(role, cid, data['TaskTemplate']['ContainerSpec']['Image'],
                {'com.docker.swarm.service.id': sid}, data['TaskTemplate']['ContainerSpec']['Mounts'][0]['Source'])
        return object()

    def _raise_for_status(self, response):
        pass

    def update_container(self, cid, restart_policy):
        self.memory.mutation()
        self.items[cid]['HostConfig']['RestartPolicy'] = copy.deepcopy(restart_policy)

    def stop(self, cid, timeout):
        self.memory.mutation()
        self.stopped.append(cid)
        self.items[cid]['State'].update(Running=False, Restarting=False, Status='exited')


def container(role, cid, image, labels, volume=None):
    return {'Id': cid, 'Config': {'Image': image, 'Labels': labels},
            'HostConfig': {'RestartPolicy': {'Name': 'no'}},
            'Mounts': [] if volume is None else [{'Type': 'volume', 'Name': volume,
                        'Destination': lifecycle.managed.DESTINATIONS[role], 'RW': True}],
            'State': {'Running': True, 'Restarting': False, 'Status': 'running',
                      'Health': {'Status': 'healthy'}}}


class Harness:
    def __init__(self):
        self.files = Memory()
        self.sdk = SDK(self.files)
        self.calls = []
        self.copies = []
        self.data = 'legacy-data'
        self.copied = {}
        self.rollback_epoch = 0
        self.enabled = False
        self.source = {'dummy': True}
        self.owner = None
        self.now = 0
        root = PurePosixPath('/etc/clicaepede/kan140')
        volumes = dict(zip(lifecycle.ROLES, ('kan140_qa_' + s for s in lifecycle.volume_transfer.SUFFIXES)))
        rollback = {r: v.replace('kan140_qa_', 'kan140_rollback_') for r, v in volumes.items()}
        self.compose = {'services': {}, 'configs': {}, 'secrets': {}}
        self.records = {}
        for index, role in enumerate(lifecycle.ROLES):
            image = role + '@sha256:' + str(index + 1) * 64
            self.compose['services'][role] = {'image': image, 'secrets': [], 'configs': []}
            sid = str(index + 1) * 25
            spec = {'Name': 'clica-evolution-qa_' + role,
                    'Labels': {'com.docker.stack.namespace': 'clica-evolution-qa'},
                    'Mode': {'Replicated': {'Replicas': 1}},
                    'TaskTemplate': {'ContainerSpec': {'Image': image, 'Mounts': [
                        {'Type': 'volume', 'Source': lifecycle.managed.OLD_VOLUMES[role],
                         'Target': lifecycle.managed.DESTINATIONS[role]}]},
                        'Placement': {'Constraints': ['node.role == manager']}},
                    'UpdateConfig': {'Order': 'stop-first'}, 'EndpointSpec': {'Mode': 'vip'}}
            service = {'ID': sid, 'Version': {'Index': 10}, 'Spec': spec}
            self.sdk.services[sid] = copy.deepcopy(service)
            self.records[role] = {'service': service}
            cid = str(index + 4) * 64
            self.sdk.items[cid] = container(role, cid, image,
                {'com.docker.swarm.service.id': sid}, lifecycle.managed.OLD_VOLUMES[role])
        self.stage = {'generation': 2, 'compose': self.compose, 'records': self.records,
                      'mount_hashes': {}, 'source_sha256': lifecycle.digest(self.compose)}
        self.dummy = container('evolution', 'a' * 64, 'dummy',
            {'com.docker.compose.project': lifecycle.PROJECT,
             'com.docker.compose.service': 'evolution'})
        self.dummy['State'].update(Running=False, Status='exited')
        self.sdk.items[self.dummy['Id']] = copy.deepcopy(self.dummy)

        @contextmanager
        def locked(path):
            assert not self.files.held
            self.files.held = True
            try:
                yield
            finally:
                self.files.held = False

        self.backup = SimpleNamespace(ROOT=Path('not-a-real-kan133-root'), locked=locked, Executor=lambda: None)
        self.runtime = SimpleNamespace(ROOT=root, VOLUMES=volumes, SWARM_VOLUMES=rollback,
            SWARM_PROJECT='clica-evolution-qa', spec_hash=lifecycle.digest,
            trusted_bytes=lambda *args, **kwargs: b'', load=lambda: copy.deepcopy(self.owner),
            publish=self.publish, Runtime=lambda executor: self.active())
        fixture = SimpleNamespace(reconcile=self.reconcile, wait_container=lambda: copy.deepcopy(self.dummy),
                                  source={'dummy': True})
        self.c = lifecycle.Coordinator(api=self, engine=lifecycle.Engine(self.sdk, full_spec_reviewed=True),
            backup=self.backup, runtime=self.runtime, stage=self.staging, transfer=self.transfer,
            fixture=fixture, gates=lambda: lifecycle.REQUIRED_GATES, files=self.files,
            rollback_freshness=lambda expected, **kw: copy.deepcopy(expected) if
                self.data == self.copied.get('rollback') else [dict(row, digest='f' * 64) for row in expected],
            rollback_targets=SimpleNamespace(capture=lambda expected, **kw: self.target_snapshot(),
                verify=lambda receipt, **kw: lifecycle.same(receipt, self.target_snapshot())),
            monotonic=lambda: self.now, sleep=self.sleep, seconds=2)

    def target_snapshot(self):
        assert 'rollback' in self.copied
        return tuple({'role': r, 'epoch': self.rollback_epoch} for r in lifecycle.ROLES)

    def sleep(self, seconds):
        self.now += max(0.01, seconds)

    def reconcile(self):
        self.files.mutation()
        assert self.source == {'dummy': True} and self.enabled is False

    def staging(self):
        self.files.mutation()
        self.files.write('compose.json', self.compose)
        return copy.deepcopy(self.stage)

    def transfer(self, phase):
        self.files.mutation()
        assert self.c.swarm_zero()
        self.c.quiescent(set(self.runtime.VOLUMES.values()) if phase == 'rollback'
                         else set(lifecycle.managed.OLD_VOLUMES.values()))
        assert phase not in self.copied, 'fresh volumes only'
        self.copies.append(phase)
        self.copied[phase] = self.data
        if phase == 'rollback':
            self.rollback_epoch += 1
        return tuple({'digest': 'b' * 64, 'entries': 1, 'bytes': len(self.data)} for _ in range(3))

    def publish(self, owner):
        self.files.mutation()
        assert owner['generation'] > self.files.read('managed')['generation']
        if owner['runtime'] == 'swarm':
            assert self.files.read('ownership.json')['state'] == 'recovering'
            assert self.c.rollback_healthy(self.c.state['rollback_services'])
        self.files.write('managed', {'schema': 1, 'generation': owner['generation']})
        self.files.write('ownership.json', owner)
        self.owner = copy.deepcopy(owner)

    def deploy(self):
        self.sdk.items.pop(self.dummy['Id'], None)
        for index, role in enumerate(lifecycle.ROLES):
            cid = str(index + 7) * 64
            self.sdk.items[cid] = container(role, cid, self.compose['services'][role]['image'],
                {'com.docker.compose.project': lifecycle.PROJECT, 'com.docker.compose.service': role,
                 'clicaepede.owner': 'easypanel-compose-qa', 'clicaepede.generation': '2'},
                self.runtime.VOLUMES[role])
            self.sdk.items[cid]['HostConfig']['RestartPolicy']['Name'] = 'unless-stopped'

    def call(self, operation, payload, **kwargs):
        if operation == 'inspectComposeService':
            return {'enabled': self.enabled, 'source': {'type': 'inline', 'content': json.dumps(self.source)}}
        if operation == 'listActions':
            return [{'projectName': 'clica-qa', 'serviceName': 'evolution-qa', 'status': 'done'}]
        self.files.mutation()
        self.calls.append(operation)
        if operation == 'stopComposeService':
            self.enabled = False
        elif operation == 'updateComposeSourceInline':
            self.source = json.loads(payload['content'])
        elif operation == 'deployComposeService':
            assert self.enabled is False and self.source == self.compose
            assert self.files.read('lifecycle.json')['data_authority'] == 'managed-may-have-written'
            self.deploy()
        elif operation == 'startComposeService':
            assert self.c.verify_compose() and self.c.swarm_zero()
            self.enabled = True
        else:
            raise AssertionError(operation)
        return None  # Legitimate HTTP200 VOID ACK, not state evidence.

    def active(self):
        def service(role):
            return self.sdk.inspect_service(self.records[role]['service']['ID'])

        def containers(role):
            sid = self.records[role]['service']['ID']
            return [copy.deepcopy(c) for c in self.sdk.items.values()
                    if c['Config']['Labels'].get('com.docker.swarm.service.id') == sid
                    and c['State']['Running']]

        return SimpleNamespace(service=service, containers=containers, revalidate=lambda: None,
                               writable_mounts=lambda: None)


class LifecycleTests(unittest.TestCase):
    def test_before_deploy_hook_locked_after_source_and_before_single_deploy(self):
        h = Harness()
        def register():
            h.files.mutation()
            self.assertEqual(h.files.events[-1], 'register-native-domain-intent')
            self.assertEqual(h.source, h.compose)
            self.assertFalse(h.enabled)
            self.assertNotIn('deployComposeService', h.calls)
            self.assertEqual(h.files.read('lifecycle.json')['data_authority'], 'legacy')
        h.c.before_deploy = register
        h.c.cutover()
        self.assertEqual(h.calls.count('deployComposeService'), 1)
        self.assertLess(h.files.events.index('register-native-domain-done'),
                        h.files.events.index('deploy-once-intent'))

    def test_hook_failure_keeps_legacy_authority_and_reports_manual_recovery(self):
        h = Harness()
        def fail():
            raise lifecycle.Rejected('registration-failed')
        h.c.before_deploy = fail
        with self.assertRaisesRegex(lifecycle.Rejected, 'registration-failed'):
            h.c.cutover()
        self.assertNotIn('deployComposeService', h.calls)
        with self.assertRaisesRegex(lifecycle.Rejected, 'manual-reconciliation-required') as caught:
            h.c.recover()
        self.assertEqual(caught.exception.recovery_state, h.files.read('lifecycle.json'))
        self.assertEqual(caught.exception.recovery_state['data_authority'], 'legacy')
        self.assertIn('original CURRENT', caught.exception.allowable_recovery)
        self.assertNotIn('rollback', h.copies)

    def test_workload_callback_pending_and_rejection_propagates_after_base_validation(self):
        h = self.ready_poll()
        seen = []
        h.c.workload_check = lambda item: seen.append(item['Id'])
        item = next(c for c in h.sdk.items.values()
                    if c['Config']['Labels'].get('com.docker.compose.project') == lifecycle.PROJECT)
        item['State']['Health']['Status'] = 'starting'
        self.assertFalse(h.c.verify_compose())
        self.assertEqual(len(seen), 3)
        def reject(item):
            raise lifecycle.Rejected('workload-contract')
        h.c.workload_check = reject
        with self.assertRaisesRegex(lifecycle.Rejected, 'workload-contract'):
            h.c.verify_compose()
        item['Config']['Image'] = 'foreign'
        with self.assertRaisesRegex(lifecycle.Rejected, 'compose-identity'):
            h.c.validate_managed(item)

    def test_rollback_publication_waits_for_all_roles_without_canonical_runtime(self):
        h = Harness()
        h.c.cutover()
        h.runtime.Runtime = lambda executor: self.fail('canonical Runtime used before publication')
        original = h.c.sleep
        delayed = []
        def settle(seconds):
            self.assertEqual(h.owner['runtime'], 'compose')
            self.assertEqual(h.files.read('ownership.json')['state'], 'recovering')
            delayed.append(True)
            for item in h.sdk.items.values():
                if item['Mounts'] and item['Mounts'][0].get('Name', '').startswith('kan140_rollback_'):
                    item['State']['Health']['Status'] = 'healthy'
            original(seconds)
        post = h.sdk._post_json
        def starting(url, params, data):
            result = post(url, params, data)
            if data['Mode']['Replicated']['Replicas']:
                for item in h.sdk.items.values():
                    if item['State']['Running']:
                        item['State']['Health']['Status'] = 'starting'
            return result
        h.sdk._post_json = starting
        h.c.sleep = settle
        h.c.recover()
        self.assertEqual(len(delayed), 3)
        self.assertEqual(h.owner['runtime'], 'swarm')
        self.assertLess(h.files.events.index('resume-evolution-done'), h.files.events.index('publish-swarm-intent'))

    def test_rollback_timeout_or_identity_fault_never_publishes_good_owner(self):
        for fault in ('health', 'image', 'mount', 'spec'):
            with self.subTest(fault=fault):
                h = Harness()
                h.c.cutover()
                post = h.sdk._post_json
                def corrupt(url, params, data):
                    result = post(url, params, data)
                    if data['Mode']['Replicated']['Replicas']:
                        item = next(c for c in h.sdk.items.values() if c['State']['Running'])
                        if fault == 'health':
                            item['State']['Health']['Status'] = 'starting'
                        elif fault == 'image':
                            item['Config']['Image'] = 'foreign'
                        elif fault == 'mount':
                            item['Mounts'][0]['Name'] = 'stale-original'
                        else:
                            h.sdk.services[url.split('/')[2]]['Spec']['EndpointSpec']['Mode'] = 'dnsrr'
                    return result
                h.sdk._post_json = corrupt
                with self.assertRaises(lifecycle.Rejected):
                    h.c.recover()
                self.assertEqual(h.owner['runtime'], 'compose')
                self.assertEqual(h.files.read('ownership.json')['state'], 'recovering')
                self.assertEqual(h.files.read('managed')['generation'], 2)
                self.assertNotIn('publish-swarm-intent', h.files.events)

    def test_cutover_order_void_ack_and_generation(self):
        h = Harness()
        self.assertEqual(h.c.cutover(), {'runtime': 'compose', 'generation': 2, 'routing_included': False})
        self.assertEqual(h.calls, ['updateComposeSourceInline', 'deployComposeService', 'startComposeService'])
        self.assertEqual(h.copies, ['cutover'])
        self.assertEqual(h.owner['project'], lifecycle.PROJECT)
        self.assertLess(h.files.events.index('fence-done'), h.files.events.index('scale-evolution-0-intent'))
        self.assertFalse(h.files.held)

    def test_current_data_rollback_full_spec_fixed_volumes(self):
        h = Harness()
        h.c.cutover()
        h.data = 'managed-latest-write'
        self.assertEqual(h.c.recover()['generation'], 3)
        self.assertEqual(h.copied['rollback'], 'managed-latest-write')
        self.assertEqual(h.owner['runtime'], 'swarm')
        self.assertFalse(h.enabled)
        for role in lifecycle.ROLES:
            spec = h.sdk.services[h.records[role]['service']['ID']]['Spec']
            self.assertEqual(spec['TaskTemplate']['ContainerSpec']['Mounts'][0]['Source'], h.runtime.SWARM_VOLUMES[role])
            self.assertEqual(spec['EndpointSpec'], {'Mode': 'vip'})
            self.assertEqual(spec['TaskTemplate']['Placement'], {'Constraints': ['node.role == manager']})
            self.assertEqual(spec['Mode']['Replicated']['Replicas'], 1)
            pin = h.owner['swarm_services'][role]
            self.assertEqual(pin['container_spec_sha256'], lifecycle.digest(spec['TaskTemplate']['ContainerSpec']))
        self.assertEqual(h.files.read('compose-disabled.json')['source_sha256'], h.owner['source']['sha256'])
        self.assertEqual(h.files.read('managed')['generation'], 3)

    def ready_poll(self):
        h = Harness()
        h.c.cutover()
        h.c.end = h.now + 2
        return h

    def test_pending_zero_partial_and_starting_then_healthy(self):
        h = self.ready_poll()
        rows = [copy.deepcopy(c) for c in h.sdk.items.values()
                if c['Config']['Labels'].get('com.docker.compose.project') == lifecycle.PROJECT]
        for c in rows:
            del h.sdk.items[c['Id']]
        self.assertFalse(h.c.verify_compose())
        for c in rows:
            c['State'].update(Running=False, Status='created')
            c['State']['Health']['Status'] = 'starting'
            h.sdk.items[c['Id']] = c
            self.assertFalse(h.c.verify_compose())
        def advance(seconds):
            for c in rows:
                c['State'].update(Running=True, Status='running')
                c['State']['Health']['Status'] = 'healthy'
            h.sleep(seconds)
        h.c.sleep = advance
        h.c.wait(h.c.verify_compose)

    def test_poll_identity_mount_and_terminal_health_fail_closed(self):
        changes = [('image', lambda c: c['Config'].update(Image='foreign')),
                   ('owner', lambda c: c['Config']['Labels'].update({'clicaepede.owner': 'foreign'})),
                   ('generation', lambda c: c['Config']['Labels'].update({'clicaepede.generation': '9'})),
                   ('mount', lambda c: c['Mounts'][0].update(Name='old-volume')),
                   ('health', lambda c: c['State']['Health'].update(Status='unhealthy'))]
        for name, change in changes:
            with self.subTest(name=name):
                h = self.ready_poll()
                item = next(c for c in h.sdk.items.values()
                            if c['Config']['Labels'].get('com.docker.compose.project') == lifecycle.PROJECT)
                change(item)
                with self.assertRaises(lifecycle.Rejected):
                    h.c.verify_compose()

    def test_stop_foreign_project_collision_and_engine_toctou(self):
        h = self.ready_poll()
        h.enabled = False
        item = next(c for c in h.sdk.items.values()
                    if c['Config']['Labels'].get('com.docker.compose.project') == lifecycle.PROJECT)
        item['Config']['Image'] = 'foreign'
        with h.backup.locked(h.backup.ROOT), self.assertRaises(lifecycle.Rejected):
            h.c.stop_new()
        self.assertNotIn(item['Id'], h.sdk.stopped)
        with self.assertRaisesRegex(lifecycle.Rejected, 'container-concurrent-change'):
            h.c.engine.stop(item['Id'], 'invalid-pin')

    def test_cutover_fault_matrix_before_and_after_every_mutation(self):
        reference = Harness()
        reference.c.cutover()
        phases = [p[:-7] for p in reference.files.events if p.endswith('-intent')]
        for phase in phases:
            for after in (False, True):
                with self.subTest(phase=phase, after=after):
                    h = Harness()
                    original = h.c.mutate
                    fired = []
                    def fault(name, operation):
                        if name == phase and not fired:
                            fired.append(True)
                            def fail():
                                if after:
                                    operation()
                                raise lifecycle.Interrupted()
                            return original(name, fail)
                        return original(name, operation)
                    h.c.mutate = fault
                    with self.assertRaises(lifecycle.Interrupted):
                        h.c.cutover()
                    self.assertFalse(h.files.held)
                    self.assertLessEqual(h.calls.count('deployComposeService'), 1)
                    self.assertNotIn('createComposeService', h.calls)
                    self.assertNotIn('rollback', h.copies)
                    if h.files.exists('managed'):
                        self.assertFalse(h.enabled)
                    calls = list(h.calls)
                    with self.assertRaises(lifecycle.Rejected):
                        h.c.cutover()
                    self.assertEqual(h.calls, calls)

    def test_rollback_fault_matrix_never_replays_or_resumes_originals(self):
        reference = Harness()
        reference.c.cutover()
        start = len(reference.files.events)
        reference.c.recover()
        phases = [p[:-7] for p in reference.files.events[start:] if p.endswith('-intent')]
        for phase in phases:
            for after in (False, True):
                with self.subTest(phase=phase, after=after):
                    h = Harness()
                    h.c.cutover()
                    original = h.c.mutate
                    fired = []
                    def fault(name, operation):
                        if name == phase and not fired:
                            fired.append(True)
                            def fail():
                                if after:
                                    operation()
                                raise lifecycle.Interrupted()
                            return original(name, fail)
                        return original(name, operation)
                    h.c.mutate = fault
                    with self.assertRaises(lifecycle.Interrupted):
                        h.c.recover()
                    self.assertTrue(h.files.exists('managed'))
                    self.assertFalse(h.files.held)
                    for spec in h.sdk.updates[3:]:
                        if spec['Mode']['Replicated']['Replicas']:
                            self.assertTrue(spec['TaskTemplate']['ContainerSpec']['Mounts'][0]['Source'].startswith('kan140_rollback_'))
                    with self.assertRaisesRegex(lifecycle.Rejected, 'manual-reconciliation-required'):
                        h.c.recover()

    def test_missing_engine_gate_blocks_all_mutations(self):
        h = Harness()
        h.c.engine.reviewed = False
        with self.assertRaisesRegex(lifecycle.Rejected, 'engine-full-spec-unavailable'):
            h.c.cutover()
        self.assertEqual(h.files.values, {})
        self.assertEqual(h.calls, [])

    def test_missing_external_gate_blocks_all_mutations(self):
        h = Harness()
        h.c.gates = lambda: lifecycle.REQUIRED_GATES - {'workers-paused'}
        with self.assertRaises(lifecycle.Rejected):
            h.c.cutover()
        self.assertEqual(h.files.values, {})

    def test_incomplete_copy_and_partial_rollback_require_manual_reconciliation(self):
        h = Harness()
        h.transfer = lambda phase: None
        h.c.transfer = h.transfer
        with self.assertRaisesRegex(lifecycle.Rejected, 'transfer-evidence'):
            h.c.cutover()
        with self.assertRaisesRegex(lifecycle.Rejected, 'manual-reconciliation-required'):
            h.c.recover()

    def test_engine_version_drift_refuses_post(self):
        h = Harness()
        before = h.sdk.inspect_service('1' * 25)
        h.sdk.services['1' * 25]['Version']['Index'] += 1
        with self.assertRaisesRegex(lifecycle.Rejected, 'service-concurrent-change'):
            h.c.engine.update(before, before['Spec'])
        self.assertEqual(h.sdk.updates, [])

    def test_canonical_runtime_api_exists(self):
        path = Path(__file__).resolve().parents[1] / 'kan133' / 'runtime.py'
        spec = importlib.util.spec_from_file_location('lifecycle_kan133_runtime_test', path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        for name in ('service', 'containers', 'revalidate', 'writable_mounts'):
            self.assertTrue(callable(getattr(module.Runtime, name)))

    def test_containment_has_separate_budget_after_deadline(self):
        h = Harness()
        h.c.cutover()
        h.now = 10
        old_end = h.c.end
        with h.backup.locked(h.backup.ROOT):
            h.c.contain()
        self.assertEqual(h.c.end, old_end)
        self.assertEqual(len(h.sdk.stopped), 3)
        self.assertFalse(h.enabled)
        self.assertTrue(all(not item['State']['Running'] for item in h.sdk.items.values()))

    def test_containment_never_stops_foreign_inline_source(self):
        h = Harness()
        h.c.cutover()
        h.source = {'foreign':'unrelated-controller'}
        before = list(h.calls)
        with h.backup.locked(h.backup.ROOT), self.assertRaisesRegex(lifecycle.Rejected, 'contain-source-drift'):
            h.c.contain()
        self.assertEqual(h.calls, before)
        self.assertEqual(h.sdk.stopped, [])

    def test_failed_conformance_does_not_disable_owned_containment(self):
        h=Harness()
        h.c.cutover()
        def reject(item):raise lifecycle.Rejected('fixture-invalid-conformance')
        h.c.workload_check=reject
        with self.assertRaisesRegex(lifecycle.Rejected,'fixture-invalid-conformance'):
            h.c.verify_compose()
        with h.backup.locked(h.backup.ROOT):h.c.contain()
        self.assertEqual(len(h.sdk.stopped),3)
        self.assertFalse(h.enabled)

    def test_native_serialization_and_real_runtime_load_agree_on_rollback(self):
        base = Path(__file__).resolve().parents[1] / 'kan133'
        def load(name, filename):
            spec = importlib.util.spec_from_file_location(name, base / filename)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            return module
        runtime = load('lifecycle_real_runtime', 'runtime.py')
        with patch.dict('sys.modules', {'runtime':runtime}):
            backup = load('lifecycle_real_backup', 'backup.py')
        h = Harness()
        h.c.cutover()
        h.c.recover()
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            owner = copy.deepcopy(h.owner)
            source = h.files.read('swarm.json')
            owner['source']['path'] = str(root / 'swarm.json')
            receipt = h.files.read('compose-disabled.json')
            owner['handoff']['path'] = str(root / 'compose-disabled.json')
            # Permissions/trusted-root checks are covered by runtime's own suite;
            # this test uses the ACTUAL atomic writer and ACTUAL owner validator.
            with patch.object(runtime, 'ROOT', root), patch.object(runtime, 'MANIFEST', root/'ownership.json'), \
                 patch.object(runtime, 'SENTINEL', root/'managed'), \
                 patch.object(runtime, 'trusted_bytes', side_effect=lambda path,**kw:Path(path).read_bytes()), \
                 patch.object(backup.os, 'fchmod', create=True), patch.object(backup, 'sync_dir'):
                files = lifecycle.Files(backup, runtime)
                files.write('swarm.json', source)
                files.write('compose-disabled.json', receipt)
                for name, pin in (('swarm.json', owner['source']['sha256']),
                                  ('compose-disabled.json', owner['handoff']['sha256'])):
                    self.assertEqual(hashlib.sha256((root/name).read_bytes()).hexdigest(), pin)
                files.write('ownership.json', {'schema': 1, 'state': 'recovering', 'generation': 3})
                files.write('managed', {'schema': 1, 'generation': 2})
                with self.assertRaises(runtime.OwnershipError):
                    runtime.load()
                files.write('ownership.json', owner)
                files.write('managed', {'schema':1,'generation':3})
                self.assertEqual(runtime.load(), owner)

    def test_signal_baseexception_unwinds_and_restores_handlers(self):
        handlers = {}
        def install(sig, handler):
            previous = handlers.get(sig, 'original')
            handlers[sig] = handler
            return previous
        with patch.object(lifecycle.signal, 'signal', side_effect=install):
            with self.assertRaises(lifecycle.Interrupted):
                with lifecycle.interruption_handlers():
                    handler = handlers[lifecycle.signal.SIGTERM]
                    try:
                        handler(lifecycle.signal.SIGTERM, None)
                    finally:
                        handler(lifecycle.signal.SIGTERM, None)  # No second interruption of cleanup.
            self.assertEqual(set(handlers.values()), {'original'})


if __name__ == '__main__':
    unittest.main()
