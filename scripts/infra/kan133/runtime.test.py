"""Offline safety branches; never invoke Docker or read host credentials."""
import copy
import hashlib
import json
import os
from pathlib import Path
import stat
import unittest
from unittest import mock
import runtime as r


def fixture():
    images = {role: role + '@sha256:' + 'a' * 64 for role in r.ROLES}
    compose = {'services': {}, 'volumes': {},
               'configs': {name: {'file': str(r.ROOT / 'configs' / filename)}
                           for name, filename in r.CONFIG_FILES.items()},
               'secrets': {name: {'file': str(r.ROOT / 'mount-secrets' / filename)}
                           for name, filename in r.SECRET_FILES.items()}}
    for role in r.ROLES:
        volume = r.VOLUMES[role].removeprefix('kan140_qa_')
        compose['volumes'][volume] = {'external': True, 'name': r.VOLUMES[role]}
        compose['services'][role] = {
            'image': images[role], 'volumes': [volume + ':' + r.TARGETS[role]],
            'labels': {'clicaepede.owner': 'easypanel-compose-qa', 'clicaepede.generation': '1'}}
    raw = json.dumps(compose).encode()
    owner = {'schema': 1, 'state': 'active', 'runtime': 'compose', 'generation': 1,
             'project': 'clica-qa', 'source': {'path': str(r.ROOT / 'compose.json'),
                                           'sha256': hashlib.sha256(raw).hexdigest()},
             'services': images, 'volumes': r.VOLUMES.copy(),
             'mount_hashes': {item['file']: hashlib.sha256(b'fixture-mount').hexdigest()
                              for item in (*compose['configs'].values(), *compose['secrets'].values())}}
    return owner, compose, raw


def container(owner, role='evolution'):
    return {'Id': 'a' * 64, 'Config': {'Image': owner['services'][role], 'Labels': {
        'com.docker.compose.project': owner['project'], 'com.docker.compose.service': role,
        'clicaepede.owner': 'easypanel-compose-qa', 'clicaepede.generation': '1'}},
        'State': {'Running': True, 'Health': {'Status': 'healthy'}},
        'Mounts': [{'Destination': r.TARGETS[role], 'Type': 'volume',
                    'Name': r.VOLUMES[role], 'RW': True}]}


def swarm_fixture():
    owner, _, _ = fixture()
    owner.update(runtime='swarm', project=r.SWARM_PROJECT, volumes=r.SWARM_VOLUMES.copy(),
                 mount_hashes={}, swarm_services={})
    source = {'project': r.SWARM_PROJECT, 'services': {}}
    for index, role in enumerate(r.ROLES):
        sid = str(index + 1) * 25
        spec = {'Name': r.SWARM_PROJECT + '_' + role,
                'Labels': {'com.docker.stack.namespace': r.SWARM_PROJECT},
                'Mode': {'Replicated': {'Replicas': 1}},
                'TaskTemplate': {'Resources': {'Limits': {'MemoryBytes': 100000000}},
                                 'ContainerSpec': {
                                     'Image': owner['services'][role],
                                     'Secrets': [{'SecretID': 's' * 25}],
                                     'Configs': [{'ConfigID': 'c' * 25}],
                                     'Mounts': [{'Type': 'volume', 'Source': r.SWARM_VOLUMES[role],
                                                 'Target': r.TARGETS[role], 'ReadOnly': False}]}}}
        source['services'][role] = {'service_id': sid, 'spec': spec}
        owner['swarm_services'][role] = {
            'service_id': sid, 'container_spec_sha256': r.spec_hash(spec['TaskTemplate']['ContainerSpec'])}
    raw = json.dumps(source).encode()
    owner['source'] = {'path': str(r.ROOT / 'swarm.json'), 'sha256': hashlib.sha256(raw).hexdigest()}
    receipt = json.dumps({'schema': 1, 'generation': 1, 'runtime': 'swarm',
                          'project': r.SWARM_PROJECT, 'source_sha256': owner['source']['sha256'],
                          'compose_controller_disabled': True}).encode()
    owner['handoff'] = {'path': str(r.ROOT / 'compose-disabled.json'),
                        'sha256': hashlib.sha256(receipt).hexdigest()}
    return owner, source, raw, receipt


class SwarmOwnershipTests(unittest.TestCase):
    def setUp(self):
        self.owner, self.source, raw, receipt = swarm_fixture()
        self.files = {r.MANIFEST: json.dumps(self.owner).encode(),
                      r.SENTINEL: b'{"schema":1,"generation":1}',
                      r.ROOT / 'swarm.json': raw, r.ROOT / 'compose-disabled.json': receipt}
        for patch in (
                mock.patch.object(r, 'trusted_bytes', side_effect=lambda p, **kw: self.files[Path(p)]),
                mock.patch.object(r.os.path, 'lexists', side_effect=lambda p: Path(p) in self.files)):
            patch.start()
            self.addCleanup(patch.stop)

    def save_owner(self):
        self.files[r.MANIFEST] = json.dumps(self.owner).encode()

    def test_explicit_swarm_active_and_no_compose_mount_reads(self):
        self.assertEqual(r.load(), self.owner)

    def test_source_and_receipt_bytes_hash_drift_reject(self):
        for path in (r.ROOT / 'swarm.json', r.ROOT / 'compose-disabled.json'):
            original = self.files[path]
            self.files[path] += b' '
            with self.subTest(path=path), self.assertRaises(r.OwnershipError):
                r.load()
            self.files[path] = original

    def test_fixture_namespace_and_volumes_are_programmatically_patchable(self):
        volumes = {role: 'owned_fixture_' + role for role in r.ROLES}
        with mock.patch.object(r, 'SWARM_PROJECT', 'owned-fixture'), \
                mock.patch.object(r, 'SWARM_VOLUMES', volumes):
            owner, _, raw, receipt = swarm_fixture()
            self.files.update({r.MANIFEST: json.dumps(owner).encode(),
                               r.ROOT / 'swarm.json': raw,
                               r.ROOT / 'compose-disabled.json': receipt})
            self.assertEqual(r.load(), owner)

    def test_owner_states_and_invalid_contract_fields(self):
        original = copy.deepcopy(self.owner)
        for change in ({'state': state} for state in ('prepared', 'draining', 'blocked', 'rollback', '')):
            self.owner = dict(original, **change)
            self.save_owner()
            with self.subTest(change=change), self.assertRaises(r.OwnershipError):
                r.load()
        for change in ({'project': 'other'}, {'volumes': r.VOLUMES}, {'mount_hashes': {'x': 'a' * 64}},
                       {'swarm_services': {}}, {'unknown': 1}, {'generation': 2}):
            self.owner = dict(original, **change)
            self.save_owner()
            with self.subTest(change=change), self.assertRaises(r.OwnershipError):
                r.load()

    def test_service_id_hash_and_source_path_pins(self):
        original = copy.deepcopy(self.owner)
        for field, value in (('service_id', 'short'), ('service_id', 'A' * 25),
                             ('service_id', '9' * 25), ('container_spec_sha256', 'b' * 64),
                             ('container_spec_sha256', 'bad')):
            self.owner = copy.deepcopy(original)
            self.owner['swarm_services']['redis'][field] = value
            self.save_owner()
            with self.subTest(field=field, value=value), self.assertRaises(r.OwnershipError):
                r.load()
        self.owner = copy.deepcopy(original)
        self.owner['source']['path'] = str(r.ROOT / 'compose.json')
        self.save_owner()
        with self.assertRaises(r.OwnershipError):
            r.load()

    def test_missing_drifted_or_stale_controller_receipt_fails(self):
        path = r.ROOT / 'compose-disabled.json'
        original = self.files[path]
        for change in ({'compose_controller_disabled': False}, {'runtime': 'compose'},
                       {'generation': 2}, {'source_sha256': 'b' * 64}, {'schema': True},
                       {'extra': 1}):
            receipt = dict(json.loads(original), **change)
            self.files[path] = json.dumps(receipt).encode()
            self.owner['handoff']['sha256'] = hashlib.sha256(self.files[path]).hexdigest()
            self.save_owner()
            with self.subTest(change=change), self.assertRaises(r.OwnershipError):
                r.load()
        del self.files[path]
        with self.assertRaises(r.OwnershipError):
            r.load()

    def test_source_mode_mount_and_reference_drift_even_when_rehashed(self):
        original = copy.deepcopy(self.source)
        for kind in ('mode', 'volume', 'target', 'readonly', 'secret', 'config', 'extra'):
            source = copy.deepcopy(original)
            spec = source['services']['postgres']['spec']
            cs = spec['TaskTemplate']['ContainerSpec']
            if kind == 'mode':
                spec['Mode'] = {'Global': {}}
            elif kind == 'volume':
                cs['Mounts'][0]['Source'] = r.VOLUMES['postgres']
            elif kind == 'target':
                cs['Mounts'][0]['Target'] = '/wrong'
            elif kind == 'readonly':
                cs['Mounts'][0]['ReadOnly'] = True
            elif kind in ('secret', 'config'):
                cs['Secrets' if kind == 'secret' else 'Configs'][0][
                    'SecretID' if kind == 'secret' else 'ConfigID'] = 'short'
            else:
                source['extra'] = True
            raw = json.dumps(source).encode()
            self.files[r.ROOT / 'swarm.json'] = raw
            self.owner['source']['sha256'] = hashlib.sha256(raw).hexdigest()
            self.owner['swarm_services']['postgres']['container_spec_sha256'] = r.spec_hash(cs)
            self.save_owner()
            with self.subTest(kind=kind), self.assertRaises(r.OwnershipError):
                r.load()


class SwarmRuntimeTests(unittest.TestCase):
    def setUp(self):
        self.owner, self.source, _, _ = swarm_fixture()
        for patch in (mock.patch.object(r, 'load', return_value=self.owner),
                      mock.patch.object(r, 'swarm_source', return_value=self.source),
                      mock.patch.object(r, 'validate_handoff')):
            patch.start()
            self.addCleanup(patch.stop)
        self.executor = mock.Mock()
        self.active = r.Runtime(self.executor)
        entry = self.source['services']['evolution']
        self.service = {'ID': entry['service_id'], 'Spec': copy.deepcopy(entry['spec'])}
        self.task = {'ID': 't' * 25, 'ServiceID': self.service['ID'], 'NodeID': 'node',
                     'DesiredState': 'running', 'Spec': copy.deepcopy(self.service['Spec']['TaskTemplate']),
                     'Status': {'State': 'running', 'ContainerStatus': {'ContainerID': 'a' * 64}}}
        self.item = {'Id': 'a' * 64, 'Config': {'Image': self.owner['services']['evolution'],
                     'Labels': {'com.docker.swarm.service.id': self.service['ID'],
                                'com.docker.swarm.task.id': self.task['ID'],
                                'com.docker.stack.namespace': r.SWARM_PROJECT}},
                     'State': {'Running': True, 'Health': {'Status': 'healthy'}},
                     'HostConfig': {'RestartPolicy': {'Name': 'no'}},
                     'Mounts': [{'Type': 'volume', 'Name': r.SWARM_VOLUMES['evolution'],
                                 'Destination': r.TARGETS['evolution'], 'RW': True}]}
        self.executor.run.side_effect = lambda args: (self.task['ID'] if args[1:3] == ['service', 'ps']
                                                     else 'node' if args[1] == 'info' else '')
        self.executor.docker_json.side_effect = lambda *args: (
            [self.service] if args[0] == 'service' else [self.task] if '--type' in args else [self.item])

    def test_exact_active_task_only_and_container_recreation_allowed(self):
        self.assertEqual(self.active.containers('evolution'), [self.item])
        self.item['Id'] = 'b' * 64
        self.task['Status']['ContainerStatus']['ContainerID'] = self.item['Id']
        self.assertEqual(self.active.containers('evolution'), [self.item])

    def test_only_known_defaults_can_be_omitted_on_either_side(self):
        original = copy.deepcopy(self.task['Spec'])
        explicit = copy.deepcopy(original)
        explicit['Runtime'] = 'container'
        explicit['RestartPolicy'] = {'Condition': 'any', 'Delay': 5000000000, 'MaxAttempts': 0}
        explicit['ContainerSpec'].update(DNSConfig={}, StopGracePeriod=10000000000)
        for task_spec, service_spec in ((original, explicit), (explicit, original),
                                         (explicit, explicit), (original, original)):
            self.task['Spec'] = copy.deepcopy(task_spec)
            self.service['Spec']['TaskTemplate'] = copy.deepcopy(service_spec)
            with mock.patch.object(self.active, 'service', return_value=self.service):
                self.assertEqual(self.active.tasks('evolution'), [self.task])
            self.assertEqual(self.task['Spec'], task_spec)
            self.assertEqual(self.service['Spec']['TaskTemplate'], service_spec)

    def test_native_default_omission_preserves_exact_service_and_source_pins(self):
        template = self.source['services']['evolution']['spec']['TaskTemplate']
        template['Runtime'] = 'container'
        template['ContainerSpec'].update(DNSConfig={}, StopGracePeriod=10000000000)
        self.owner['swarm_services']['evolution']['container_spec_sha256'] = r.spec_hash(
            template['ContainerSpec'])
        self.service['Spec']['TaskTemplate'] = copy.deepcopy(template)
        self.task['Spec'] = copy.deepcopy(template)
        del self.task['Spec']['Runtime']
        self.assertEqual(self.active.containers('evolution'), [self.item])
        del self.task['Spec']['ContainerSpec']['DNSConfig']
        del self.task['Spec']['ContainerSpec']['StopGracePeriod']
        self.assertEqual(self.active.containers('evolution'), [self.item])
        self.service['Spec']['TaskTemplate']['ContainerSpec'].pop('DNSConfig')
        with self.assertRaises(r.OwnershipError):
            self.active.service('evolution')

    def test_default_normalization_rejects_task_drift_and_explicit_nulls(self):
        original = copy.deepcopy(self.task['Spec'])
        cases = [('Runtime', value) for value in (None, '', 'plugin', {}, False)]
        cases += [('RestartPolicy', value) for value in (None, {}, False,
                  {'Condition': 'none', 'Delay': 5000000000, 'MaxAttempts': 0},
                  {'Condition': 'any', 'Delay': 6000000000, 'MaxAttempts': 0},
                  {'Condition': 'any', 'Delay': 5000000000, 'MaxAttempts': False})]
        cases += [('DNSConfig', value) for value in (None, [], False,
                  {'Nameservers': ['192.0.2.1']}, {'Search': ['unexpected.invalid']},
                  {'Options': ['ndots:5']}, {'unknown': []})]
        cases += [('StopGracePeriod', value) for value in (None, False, '10000000000',
                  10000000000.0, 0, 9999999999, 10000000001, -1)]
        cases += [('Image', 'other@sha256:' + 'b' * 64),
                  ('Secrets', [{'SecretID': 'z' * 25}]),
                  ('Configs', [{'ConfigID': 'z' * 25}]),
                  ('LogDriver', {'Name': 'json-file'}),
                  ('Networks', [{'Target': 'n' * 25}]), ('UnexpectedTaskField', {})]
        for field, value in cases:
            self.task['Spec'] = copy.deepcopy(original)
            target = (self.task['Spec'] if field in ('Runtime', 'RestartPolicy', 'LogDriver', 'Networks',
                      'UnexpectedTaskField') else self.task['Spec']['ContainerSpec'])
            target[field] = value
            with self.subTest(field=field, value=value), self.assertRaises(r.OwnershipError):
                self.active.tasks('evolution')

    def test_pinned_nondefaults_are_not_normalized_away(self):
        template = self.service['Spec']['TaskTemplate']
        template['ContainerSpec'].update(DNSConfig={'Nameservers': ['192.0.2.2']},
                                         StopGracePeriod=30000000000)
        template['LogDriver'] = {'Name': 'local', 'Options': {'max-size': '1m'}}
        template['Networks'] = [{'Target': 'n' * 25}]
        self.task['Spec'] = copy.deepcopy(template)
        with mock.patch.object(self.active, 'service', return_value=self.service):
            self.assertEqual(self.active.tasks('evolution'), [self.task])
            for field in ('DNSConfig', 'StopGracePeriod', 'LogDriver', 'Networks'):
                self.task['Spec'] = copy.deepcopy(template)
                target = (self.task['Spec']['ContainerSpec'] if field in
                          ('DNSConfig', 'StopGracePeriod') else self.task['Spec'])
                del target[field]
                with self.subTest(field=field), self.assertRaises(r.OwnershipError):
                    self.active.tasks('evolution')
            for field, replacement in (
                    ('DNSConfig', {'Nameservers': ['192.0.2.3']}),
                    ('StopGracePeriod', 10000000000),
                    ('LogDriver', {'Name': 'local', 'Options': {'max-size': '2m'}}),
                    ('Networks', [{'Target': 'z' * 25}])):
                self.task['Spec'] = copy.deepcopy(template)
                target = (self.task['Spec']['ContainerSpec'] if field in
                          ('DNSConfig', 'StopGracePeriod') else self.task['Spec'])
                target[field] = replacement
                with self.subTest(changed=field), self.assertRaises(r.OwnershipError):
                    self.active.tasks('evolution')

    def test_explicit_null_template_defaults_reject_even_when_task_matches(self):
        original = copy.deepcopy(self.task['Spec'])
        for field in ('Runtime', 'DNSConfig', 'StopGracePeriod'):
            template = copy.deepcopy(original)
            target = template if field == 'Runtime' else template['ContainerSpec']
            target[field] = None
            self.service['Spec']['TaskTemplate'] = template
            self.task['Spec'] = copy.deepcopy(template)
            with mock.patch.object(self.active, 'service', return_value=self.service), \
                    self.subTest(field=field), self.assertRaises(r.OwnershipError):
                self.active.tasks('evolution')
    def test_terminal_and_shutdown_desired_tasks_not_returned(self):
        for state, desired in (('shutdown', 'shutdown'), ('failed', 'running'), ('running', 'shutdown')):
            self.task['Status']['State'], self.task['DesiredState'] = state, desired
            with self.subTest(state=state, desired=desired):
                self.assertEqual(self.active.containers('evolution'), [])

    def test_pending_task_without_container_is_not_a_container(self):
        self.task['Status'] = {'State': 'pending'}
        self.task['NodeID'] = ''
        self.assertEqual(self.active.containers('evolution'), [])

    def test_service_spec_drift_all_pins_fail_closed(self):
        original = copy.deepcopy(self.service)
        for kind in ('id', 'mode', 'replicas', 'image', 'volume', 'secret', 'config', 'resources'):
            self.service = copy.deepcopy(original)
            spec = self.service['Spec']
            cs = spec['TaskTemplate']['ContainerSpec']
            if kind == 'id':
                self.service['ID'] = 'z' * 25
            elif kind == 'mode':
                spec['Mode'] = {'Global': {}}
            elif kind == 'replicas':
                spec['Mode']['Replicated']['Replicas'] = 2
            elif kind == 'image':
                cs['Image'] = 'image:latest'
            elif kind == 'volume':
                cs['Mounts'][0]['Source'] = 'old-volume'
            elif kind in ('secret', 'config'):
                cs['Secrets' if kind == 'secret' else 'Configs'][0][
                    'SecretID' if kind == 'secret' else 'ConfigID'] = 'z' * 25
            else:
                spec['TaskTemplate']['Resources'] = {}
            with self.subTest(kind=kind), self.assertRaises((r.OwnershipError, KeyError)):
                self.active.service('evolution')

    def test_wrong_task_spec_node_or_container_labels_mount_rejected(self):
        original_task, original_item = copy.deepcopy(self.task), copy.deepcopy(self.item)
        for kind in ('spec', 'node', 'service', 'task', 'volume', 'image', 'writer'):
            self.task, self.item = copy.deepcopy(original_task), copy.deepcopy(original_item)
            if kind == 'spec':
                self.task['Spec']['Resources'] = {}
            elif kind == 'node':
                self.task['NodeID'] = 'remote'
            elif kind in ('service', 'task'):
                self.item['Config']['Labels']['com.docker.swarm.' + kind + '.id'] = 'z' * 25
            elif kind == 'volume':
                self.item['Mounts'][0]['Name'] = 'old'
            elif kind == 'image':
                self.item['Config']['Image'] = 'wrong'
            else:
                self.item['Mounts'].append({'Type': 'bind', 'Destination': '/extra', 'RW': True})
            with self.subTest(kind=kind), self.assertRaises(r.OwnershipError):
                self.active.containers('evolution')

    def test_scale_pinned_service_id_not_container_and_requires_lock(self):
        with self.assertRaises(r.OwnershipError):
            self.active.mutate_app(True, self.service['ID'])
        with mock.patch.object(self.active, 'other_runtime_running', return_value=False), \
                mock.patch.object(self.active, 'writable_mounts'), r.mutation_scope():
            self.active.mutate_app(False, self.service['ID'])
            self.assertEqual(self.executor.run.call_args.args[0],
                             ['docker', 'service', 'scale', '--detach=true', self.service['ID'] + '=0'])
            with self.assertRaises(r.OwnershipError):
                self.active.mutate_app(True, self.item['Id'])

    def test_any_compose_owner_running_or_restartable_blocks(self):
        self.executor.run.side_effect = None
        self.executor.run.return_value = 'b' * 64
        for running, restarting, policy, blocked in ((False, False, 'no', False),
                (True, False, 'no', True), (False, True, 'no', True),
                (False, False, 'always', True), (False, False, 'unless-stopped', True),
                (False, False, 'on-failure', True)):
            item = {'State': {'Running': running, 'Restarting': restarting},
                    'HostConfig': {'RestartPolicy': {'Name': policy}}}
            self.executor.docker_json.side_effect = None
            self.executor.docker_json.return_value = [item]
            with self.subTest(policy=policy, running=running, restarting=restarting):
                self.assertEqual(self.active.other_runtime_running(), blocked)

    def test_foreign_and_duplicate_volume_writers_reject(self):
        self.executor.run.side_effect = lambda args: ('a' * 64 if
            args[-1] == 'volume=' + r.SWARM_VOLUMES['evolution'] else '')
        self.executor.docker_json.side_effect = None
        for count in (1, 2):
            self.executor.docker_json.return_value = [copy.deepcopy(self.item) for _ in range(count)]
            if count == 1:
                self.executor.docker_json.return_value[0]['Config']['Labels'][
                    'com.docker.swarm.service.id'] = 'z' * 25
            with self.assertRaises(r.OwnershipError):
                self.active.writable_mounts()


class OwnershipTests(unittest.TestCase):
    def setUp(self):
        self.owner, self.compose, self.raw = fixture()
        self.files = {r.MANIFEST: json.dumps(self.owner).encode(),
                      r.SENTINEL: b'{"schema":1,"generation":1}',
                      r.ROOT / 'compose.json': self.raw}
        self.files.update({Path(path): b'fixture-mount' for path in self.owner['mount_hashes']})
        self.stack = mock.patch.object(r, 'trusted_bytes', side_effect=lambda p, **kw: self.files[Path(p)])
        self.reader = self.stack.start()
        self.addCleanup(self.stack.stop)
        patch = mock.patch.object(r.os.path, 'lexists', side_effect=lambda p: Path(p) in self.files)
        patch.start()
        self.addCleanup(patch.stop)

    def test_legacy_only_when_both_absent(self):
        self.files.clear()
        self.assertIsNone(r.load())

    def test_valid_active_contract(self):
        self.assertEqual(r.load(), self.owner)

    def test_missing_manifest_with_sentinel_rejected(self):
        del self.files[r.MANIFEST]
        with self.assertRaises(r.OwnershipError):
            r.load()

    def test_missing_sentinel_with_manifest_rejected(self):
        del self.files[r.SENTINEL]
        with self.assertRaises(r.OwnershipError):
            r.load()

    def test_states_schema_images_and_volumes_fail_closed(self):
        for change in ({'state': 'transitional'}, {'state': 'blocked'}, {'runtime': 'swarm'},
                       {'generation': True}, {'schema': True}, {'generation': 0},
                       {'generation': 2}, {'project': '../x'}, {'volumes': {}},
                       {'services': dict.fromkeys(r.ROLES, 'image:latest')}, {'unknown': 1}):
            with self.subTest(change=change):
                value = dict(self.owner, **change)
                self.files[r.MANIFEST] = json.dumps(value).encode()
                with self.assertRaises(r.OwnershipError):
                    r.load()

    def test_malformed_manifest_sentinel_and_source_rejected(self):
        for path in list(self.files):
            with self.subTest(path=path):
                before = self.files[path]
                self.files[path] = b'{'
                with self.assertRaises(r.OwnershipError):
                    r.load()
                self.files[path] = before

    def test_source_drift_rejected(self):
        self.files[r.ROOT / 'compose.json'] += b' '
        with self.assertRaises(r.OwnershipError):
            r.load()

    def test_mount_content_or_reference_drift_rejected(self):
        for path in self.owner['mount_hashes']:
            self.files[Path(path)] = b'fixture-drift'
            with self.subTest(path=path), self.assertRaises(r.OwnershipError):
                r.load()
            self.files[Path(path)] = b'fixture-mount'

    def test_mount_sources_use_separate_traversal_and_readonly_policy(self):
        r.load()
        for path in self.owner['mount_hashes']:
            self.reader.assert_any_call(Path(path), mount_source=True)

    def test_duplicate_json_fields_and_bool_sentinel_rejected(self):
        for raw in (b'{"schema":1,"generation":1,"generation":1}',
                    b'{"schema":true,"generation":1}',
                    b'{"schema":1,"generation":true}'):
            self.files[r.SENTINEL] = raw
            with self.assertRaises(r.OwnershipError):
                r.load()

    def test_source_semantic_drift_even_when_hash_updated_rejected(self):
        for field in ('image', 'labels', 'volumes'):
            compose = copy.deepcopy(self.compose)
            compose['services']['evolution'][field] = {} if field == 'labels' else 'wrong'
            raw = json.dumps(compose).encode()
            self.files[r.ROOT / 'compose.json'] = raw
            owner = copy.deepcopy(self.owner)
            owner['source']['sha256'] = hashlib.sha256(raw).hexdigest()
            self.files[r.MANIFEST] = json.dumps(owner).encode()
            with self.assertRaises(r.OwnershipError):
                r.load()


class RuntimeTests(unittest.TestCase):
    def setUp(self):
        self.owner, _, _ = fixture()
        patch = mock.patch.object(r, 'load', return_value=self.owner)
        self.load = patch.start()
        self.addCleanup(patch.stop)
        self.executor = mock.Mock()
        self.executor.run.return_value = 'a' * 64
        self.item = container(self.owner)
        self.executor.docker_json.return_value = [self.item]
        self.active = r.Runtime(self.executor)

    def test_exact_container(self):
        self.assertEqual(self.active.containers('evolution'), [self.item])

    def test_missing_duplicate_and_short_container_ids_rejected(self):
        for ids in ('', 'a' * 12, 'a' * 64 + ' ' + 'b' * 64):
            self.executor.run.return_value = ids
            with self.assertRaises(r.OwnershipError):
                self.active.containers('evolution')

    def test_wrong_image_mount_generation_project_service_rejected(self):
        variants = []
        for field in ('com.docker.compose.project', 'com.docker.compose.service',
                      'clicaepede.generation', 'clicaepede.owner', 'com.docker.compose.oneoff',
                      'com.docker.swarm.service.name'):
            item = copy.deepcopy(self.item)
            item['Config']['Labels'][field] = 'wrong'
            variants.append(item)
        item = copy.deepcopy(self.item)
        item['Config']['Image'] = 'image:latest'
        variants.append(item)
        for field, value in (('Type', 'bind'), ('Name', 'legacy'), ('RW', False)):
            item = copy.deepcopy(self.item)
            item['Mounts'][0][field] = value
            variants.append(item)
        for item in variants:
            self.executor.docker_json.return_value = [item]
            with self.assertRaises(r.OwnershipError):
                self.active.containers('evolution')

    def test_mutation_requires_lock_scope(self):
        with self.assertRaises(r.OwnershipError):
            self.active.mutate_app(True, 'a' * 64)
        self.executor.run.assert_not_called()

    def test_mutation_only_exact_existing_id_no_create(self):
        self.executor.run.side_effect = ['', '', 'a' * 64, '']
        with mock.patch.object(self.active, 'writable_mounts'), r.mutation_scope():
            self.active.mutate_app(True, 'a' * 64)
        self.assertEqual(self.executor.run.call_args.args[0], ['docker', 'start', 'a' * 64])

    def test_replaced_id_refuses_mutation(self):
        self.executor.run.side_effect = ['', '', 'a' * 64]
        with mock.patch.object(self.active, 'writable_mounts'), \
                r.mutation_scope(), self.assertRaises(r.OwnershipError):
            self.active.mutate_app(False, 'b' * 64)
        self.assertEqual(self.executor.run.call_count, 3)

    def test_legacy_desired_one_blocks_without_running_task(self):
        name = 'clica-evolution-qa_evolution'
        self.executor.run.side_effect = [name, '']
        self.executor.docker_json.return_value = [
            {'Spec': {'Name': name, 'Mode': {'Replicated': {'Replicas': 1}}}}]
        self.assertTrue(self.active.legacy_running())

    def test_legacy_desired_zero_requires_no_lingering_task(self):
        name = 'clica-evolution-qa_evolution'
        for running in ('', 'b' * 64):
            self.executor.run.side_effect = [name, running]
            self.executor.docker_json.return_value = [
                {'Spec': {'Name': name, 'Mode': {'Replicated': {'Replicas': 0}}}}]
            with self.subTest(running=bool(running)):
                self.assertEqual(self.active.legacy_running(), bool(running))

    def test_legacy_unsupported_mode_or_inspection_failure_rejects(self):
        name = 'clica-evolution-qa_evolution'
        self.executor.run.side_effect = [name]
        self.executor.docker_json.return_value = [{'Spec': {'Name': name, 'Mode': {'Global': {}}}}]
        with self.assertRaises(r.OwnershipError):
            self.active.legacy_running()
        self.executor.run.side_effect = [name]
        self.executor.docker_json.side_effect = OSError('fixture-docker-unavailable')
        with self.assertRaises(OSError):
            self.active.legacy_running()

    def test_running_legacy_refuses_mutation(self):
        with r.mutation_scope(), self.assertRaises(r.OwnershipError):
            self.active.mutate_app(False, 'a' * 64)
        self.executor.docker_json.assert_not_called()

    def test_ownership_switch_before_mutation_rejected(self):
        self.load.return_value = dict(self.owner, generation=2)
        with r.mutation_scope(), self.assertRaises(r.OwnershipError):
            self.active.mutate_app(True, 'a' * 64)
        self.executor.run.assert_not_called()

    def test_legacy_session_cannot_survive_switch(self):
        self.load.return_value = None
        active = r.Runtime(self.executor)
        self.load.return_value = self.owner
        with self.assertRaises(r.OwnershipError):
            active.revalidate()


class TrustedFileTests(unittest.TestCase):
    def test_publish_monotonic_generation_rejects_stale_and_malformed_sentinel(self):
        info = mock.Mock(st_uid=0, st_mode=stat.S_IFDIR | 0o700)
        for previous, generation in (({'schema': 1, 'generation': 8}, 8),
                                     ({'schema': 1, 'generation': 8}, 7),
                                     ({'schema': 1, 'generation': True}, 9),
                                     ({'schema': 1, 'generation': 8, 'extra': 1}, 9)):
            with self.subTest(previous=previous, generation=generation), \
                    mock.patch.object(r.os, 'geteuid', return_value=0, create=True), \
                    mock.patch.object(Path, 'lstat', return_value=info), \
                    mock.patch.object(Path, 'resolve', autospec=True, side_effect=lambda p, **kw: p), \
                    mock.patch.object(r.os.path, 'lexists', return_value=True), \
                    mock.patch.object(r, 'trusted_bytes', return_value=json.dumps(previous).encode()), \
                    mock.patch.object(r.os, 'replace') as replace, r.mutation_scope():
                with self.assertRaises(r.OwnershipError):
                    r.publish({'generation': generation})
                replace.assert_not_called()

    def test_publish_sentinel_is_durable_before_manifest_and_never_deleted(self):
        import tempfile
        info = mock.Mock(st_uid=0, st_mode=stat.S_IFDIR | 0o700)
        stream = mock.MagicMock()
        stream.__enter__.return_value = stream
        stream.fileno.return_value = 10
        events = []
        with mock.patch.object(r.os, 'geteuid', return_value=0, create=True), \
                mock.patch.object(Path, 'lstat', return_value=info), \
                mock.patch.object(Path, 'resolve', autospec=True, side_effect=lambda p, **kw: p), \
                mock.patch.object(r.os.path, 'lexists', return_value=False), \
                mock.patch.object(tempfile, 'mkstemp', side_effect=[(10, 'temp-one'), (11, 'temp-two')]), \
                mock.patch.object(r.os, 'fdopen', return_value=stream), \
                mock.patch.object(r.os, 'fchmod', create=True), \
                mock.patch.object(r.os, 'O_DIRECTORY', 0, create=True), \
                mock.patch.object(r.os, 'open', return_value=20), \
                mock.patch.object(r.os, 'close'), \
                mock.patch.object(r.os, 'fsync', side_effect=lambda fd: events.append(('sync', fd))), \
                mock.patch.object(r.os, 'replace', side_effect=lambda src, dst: events.append(('replace', dst))), \
                mock.patch.object(r.os, 'unlink') as unlink, \
                mock.patch.object(r, 'load'), r.mutation_scope():
            r.publish({'generation': 9})
        self.assertEqual(events, [('sync', 10), ('replace', r.SENTINEL), ('sync', 20),
                                  ('sync', 10), ('replace', r.MANIFEST), ('sync', 20)])
        unlink.assert_not_called()

    def test_control_and_mount_permissions_are_distinct(self):
        path = Path('D:/fixture/file') if os.name == 'nt' else Path('/fixture/file')
        data = b'fixture-bytes'
        for mount_source, mode, parent_mode, accepted in (
                (False, 0o600, 0o700, True), (False, 0o444, 0o700, False),
                (True, 0o444, 0o700, True), (True, 0o600, 0o700, False),
                (True, 0o444, 0o755, False)):
            info = mock.Mock(st_dev=1, st_ino=2, st_mode=stat.S_IFREG | mode,
                             st_uid=0, st_gid=0, st_nlink=1, st_size=len(data),
                             st_mtime_ns=100, st_ctime_ns=200)
            parent = mock.Mock(st_uid=0, st_mode=stat.S_IFDIR | parent_mode)
            stream = mock.MagicMock()
            stream.__enter__.return_value = stream
            stream.fileno.return_value = 10
            stream.read.return_value = data
            with self.subTest(mount=mount_source, mode=mode, parent=parent_mode), \
                    mock.patch.object(Path, 'resolve', return_value=path), \
                    mock.patch.object(Path, 'lstat', autospec=True,
                                      side_effect=lambda p: info if p == path else parent), \
                    mock.patch.object(r.os, 'O_NOFOLLOW', 0, create=True), \
                    mock.patch.object(r.os, 'O_NONBLOCK', 0, create=True), \
                    mock.patch.object(r.os, 'open', return_value=10), \
                    mock.patch.object(r.os, 'fdopen', return_value=stream), \
                    mock.patch.object(r.os, 'fstat', return_value=info):
                if accepted:
                    self.assertEqual(r.trusted_bytes(path, mount_source=mount_source), data)
                else:
                    with self.assertRaises(r.OwnershipError):
                        r.trusted_bytes(path, mount_source=mount_source)

    def test_file_identity_ignores_only_atime(self):
        fields = dict(st_dev=1, st_ino=2, st_mode=stat.S_IFREG | 0o600, st_uid=0,
                      st_gid=0, st_nlink=1, st_size=12, st_mtime_ns=100, st_ctime_ns=200,
                      st_atime_ns=300)
        first = mock.Mock(**fields)
        second = mock.Mock(**dict(fields, st_atime_ns=400))
        self.assertEqual(r.file_identity(first), r.file_identity(second))
        for name in fields:
            if name == 'st_atime_ns':
                continue
            changed = mock.Mock(**dict(fields, **{name: fields[name] + 1}))
            self.assertNotEqual(r.file_identity(first), r.file_identity(changed))

    def test_publish_requires_lock_even_for_root(self):
        with mock.patch.object(r.os, 'geteuid', return_value=0, create=True), \
                mock.patch.object(r.os, 'replace') as replace:
            with self.assertRaises(r.OwnershipError):
                r.publish({'generation': 1})
        replace.assert_not_called()

    def test_symlink_ancestor_rejected_before_open(self):
        with mock.patch.object(Path, 'resolve', return_value=Path('/other')), \
                mock.patch.object(r.os, 'open') as opened:
            with self.assertRaises(r.OwnershipError):
                r.trusted_bytes(Path('/trusted/file'))
        opened.assert_not_called()

    def test_untrusted_ancestor_rejected(self):
        path = Path('/trusted/file')
        for uid, mode in ((1000, stat.S_IFDIR | 0o700), (0, stat.S_IFDIR | 0o777)):
            with mock.patch.object(Path, 'resolve', return_value=path), \
                    mock.patch.object(Path, 'lstat', return_value=mock.Mock(st_uid=uid, st_mode=mode)), \
                    mock.patch.object(r.os, 'open') as opened:
                with self.assertRaises(r.OwnershipError):
                    r.trusted_bytes(path)
            opened.assert_not_called()


if __name__ == '__main__':
    unittest.main()
