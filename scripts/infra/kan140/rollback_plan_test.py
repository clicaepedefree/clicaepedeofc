"""Offline, in-memory validation of partial rollback plans."""
import copy
import itertools
import unittest
from unittest.mock import patch

import rollback_plan as planner


def fixture():
    records, actual = {}, {}
    volumes = dict(zip(planner.ROLES, ('kan140_rollback_' + s
                                      for s in planner.volume_transfer.SUFFIXES)))
    destinations = copy.deepcopy(planner.managed.DESTINATIONS)
    for index, role in enumerate(planner.ROLES):
        service = {'ID': str(index + 1) * 25, 'Version': {'Index': 10},
                   'CreatedAt': 'original-time', 'Endpoint': {'VirtualIPs': []},
                   'Spec': {'Name': 'clica-evolution-qa_' + role,
                            'Mode': {'Replicated': {'Replicas': 1}},
                            'TaskTemplate': {'ContainerSpec': {
                                'Image': role + '@sha256:' + 'a' * 64,
                                'Mounts': [{'Type': 'volume',
                                            'Source': planner.managed.OLD_VOLUMES[role],
                                            'Target': destinations[role], 'ReadOnly': False,
                                            'VolumeOptions': {'NoCopy': True}}],
                                'CapabilityAdd': ['NET_BIND_SERVICE']},
                                'Resources': {'Limits': {'MemoryBytes': 512}},
                                'Placement': {'Constraints': ['node.role == manager']}},
                            'EndpointSpec': {'Mode': 'vip'},
                            'FutureField': {'nested': [None, {'enabled': True, 'count': 1}]}}}
        records[role] = {'service': service, 'container_id': 'unused'}
        actual[role] = copy.deepcopy(service)
        actual[role]['Spec']['Mode']['Replicated']['Replicas'] = 0
        actual[role]['Version']['Index'] += 1
    return records, actual, volumes, destinations


def mount(service):
    return service['Spec']['TaskTemplate']['ContainerSpec']['Mounts'][0]


class RollbackPlanTests(unittest.TestCase):
    def assert_rejected(self, args, code=None):
        with self.assertRaises(planner.PlanError) as caught:
            planner.build_plan(*args)
        if code:
            self.assertEqual(str(caught.exception), code)

    def test_all_stopped_originals_preserve_full_specs_and_snapshots(self):
        args = fixture()
        before = copy.deepcopy(args)
        with patch('builtins.open', side_effect=AssertionError('IO')), \
                patch('subprocess.run', side_effect=AssertionError('process')):
            result = planner.build_plan(*args)
        self.assertEqual(args, before)
        self.assertEqual(set(result), set(planner.ROLES))
        for role, row in result.items():
            self.assertEqual(set(row), {'service_id', 'spec', 'current', 'rebound', 'replicas'})
            expected = copy.deepcopy(args[0][role]['service']['Spec'])
            expected['Mode']['Replicated']['Replicas'] = 0
            expected['TaskTemplate']['ContainerSpec']['Mounts'][0]['Source'] = args[2][role]
            self.assertEqual(row['spec'], expected)
            self.assertEqual(row['current'], args[1][role])
            self.assertFalse(row['rebound'])
            self.assertEqual(row['replicas'], 0)
            self.assertEqual(row['service_id'], args[1][role]['ID'])
        result['postgres']['spec']['FutureField']['nested'].append('changed')
        result['postgres']['current']['Spec']['FutureField']['nested'].clear()
        self.assertEqual(args, before)

    def test_every_partial_rebind_and_writer_combination(self):
        for states in itertools.product(('original', 'stopped', 'running'), repeat=3):
            with self.subTest(states=states):
                args = fixture()
                for role, state in zip(planner.ROLES, states):
                    if state != 'original':
                        mount(args[1][role])['Source'] = args[2][role]
                    args[1][role]['Spec']['Mode']['Replicated']['Replicas'] = int(state == 'running')
                if 'original' in states and 'running' in states:
                    self.assert_rejected(args, 'mixed-writer-partial-rebind')
                    continue
                result = planner.build_plan(*args)
                for role, state in zip(planner.ROLES, states):
                    self.assertEqual(result[role]['rebound'], state != 'original')
                    self.assertEqual(result[role]['replicas'], int(state == 'running'))
                    self.assertEqual(result[role]['spec']['Mode']['Replicated']['Replicas'], 0)
                    if state == 'stopped':
                        self.assertEqual(result[role]['spec'], args[1][role]['Spec'])

    def test_exact_roles_in_every_argument(self):
        for index in range(4):
            for change in ('missing', 'extra', 'foreign', 'not-map'):
                with self.subTest(index=index, change=change):
                    args = list(fixture())
                    if change == 'not-map':
                        args[index] = []
                    elif change == 'missing':
                        del args[index]['redis']
                    else:
                        args[index]['foreign'] = args[index]['redis']
                        if change == 'foreign':
                            del args[index]['redis']
                    self.assert_rejected(args, 'roles')

    def test_fixed_runtime_maps_cannot_be_reconfigured(self):
        for index in (2, 3):
            for value in ('foreign', '', None, True):
                args = fixture()
                args[index]['postgres'] = value
                self.assert_rejected(args, 'rollback-volumes' if index == 2 else 'destinations')
        args = fixture()
        args[2]['postgres'], args[2]['redis'] = args[2]['redis'], args[2]['postgres']
        self.assert_rejected(args, 'rollback-volumes')

    def test_identity_format_and_role_identity(self):
        for value in ('a' * 24, 'a' * 26, 'A' * 25, '_' * 25, 'a' * 24 + '\n', None, 1):
            for original in (False, True):
                args = fixture()
                service = args[0]['postgres']['service'] if original else args[1]['postgres']
                service['ID'] = value
                self.assert_rejected(args, 'service-id')
        args = fixture()
        args[1]['postgres']['ID'] = args[1]['redis']['ID']
        self.assert_rejected(args, 'service-id')
        args = fixture()
        args[0]['redis']['service']['ID'] = args[0]['postgres']['service']['ID']
        args[1]['redis']['ID'] = args[1]['postgres']['ID']
        self.assert_rejected(args, 'service-id')

    def test_version_integer_not_bool_and_monotonic(self):
        for original in (False, True):
            for value in (-1, True, False, 10.0, '10', None):
                args = fixture()
                service = args[0]['postgres']['service'] if original else args[1]['postgres']
                service['Version']['Index'] = value
                self.assert_rejected(args, 'service-version')
        args = fixture()
        args[1]['postgres']['Version']['Index'] = 9
        self.assert_rejected(args, 'service-version')
        for value in (10, 100000):
            args[1]['postgres']['Version']['Index'] = value
            planner.build_plan(*args)

    def test_mount_contract_on_original_and_actual(self):
        for original in (False, True):
            for field, value in (('Source', 'foreign'), ('Source', 'kan140_qa_postgres_data'),
                                 ('Source', 'kan140_rollback_redis_data'),
                                 ('Target', '/wrong'), ('Type', 'bind'),
                                 ('ReadOnly', True), ('ReadOnly', 0), ('ReadOnly', None)):
                with self.subTest(original=original, field=field, value=value):
                    args = fixture()
                    service = args[0]['postgres']['service'] if original else args[1]['postgres']
                    mount(service)[field] = value
                    self.assert_rejected(args)
            for mounts in ([], [{}, {}], {}, None):
                args = fixture()
                service = args[0]['postgres']['service'] if original else args[1]['postgres']
                service['Spec']['TaskTemplate']['ContainerSpec']['Mounts'] = mounts
                self.assert_rejected(args)
        args = fixture()
        mount(args[0]['postgres']['service'])['Source'] = args[2]['postgres']
        self.assert_rejected(args, 'original-volume')

    def test_omitted_readonly_false_preserved_not_normalized(self):
        args = fixture()
        del mount(args[0]['postgres']['service'])['ReadOnly']
        del mount(args[1]['postgres'])['ReadOnly']
        result = planner.build_plan(*args)
        self.assertNotIn('ReadOnly', result['postgres']['spec']['TaskTemplate']['ContainerSpec']['Mounts'][0])
        mount(args[1]['postgres'])['ReadOnly'] = False
        self.assert_rejected(args, 'service-spec-drift')

    def test_replicas_and_modes_fail_closed(self):
        for original in (False, True):
            for value in (True, False, -1, 2, 0.0, None, '0'):
                args = fixture()
                service = args[0]['postgres']['service'] if original else args[1]['postgres']
                service['Spec']['Mode']['Replicated']['Replicas'] = value
                self.assert_rejected(args, 'service-replicas')
        args = fixture()
        args[1]['postgres']['Spec']['Mode']['Replicated']['Replicas'] = 1
        self.assert_rejected(args, 'original-writer')
        for mode in ({'Global': {}}, {'Replicated': {'Replicas': 0}, 'Global': {}}):
            args = fixture()
            args[1]['postgres']['Spec']['Mode'] = mode
            self.assert_rejected(args)

    def test_whole_spec_drift_including_caps_and_unknown_nested_fields(self):
        changes = (
            lambda s: s.update(Name='foreign'),
            lambda s: s.update(Labels={'injected': 'yes'}),
            lambda s: s.pop('EndpointSpec'),
            lambda s: s['EndpointSpec'].update(Mode='dnsrr'),
            lambda s: s['TaskTemplate']['ContainerSpec'].update(Image='foreign'),
            lambda s: s['TaskTemplate']['ContainerSpec'].update(CapabilityAdd=['SYS_ADMIN']),
            lambda s: s['TaskTemplate']['ContainerSpec'].update(CapabilityDrop=['ALL']),
            lambda s: s['TaskTemplate']['Resources']['Limits'].update(MemoryBytes=1024),
            lambda s: s['FutureField']['nested'][1].update(enabled=1),
            lambda s: s['FutureField']['nested'][1].update(count=True),
            lambda s: s['FutureField']['nested'].append('extra'),
            lambda s: s['TaskTemplate']['ContainerSpec']['Mounts'][0]['VolumeOptions'].update(NoCopy=1),
        )
        for rebound in (False, True):
            for change in changes:
                args = fixture()
                if rebound:
                    mount(args[1]['postgres'])['Source'] = args[2]['postgres']
                change(args[1]['postgres']['Spec'])
                self.assert_rejected(args, 'service-spec-drift')

    def test_malformed_shapes_raise_only_planerror(self):
        for original in (False, True):
            for value in (None, [], {}, {'ID': 'a' * 25},
                          {'ID': 'a' * 25, 'Version': None},
                          {'ID': 'a' * 25, 'Version': {'Index': 10}, 'Spec': []}):
                args = fixture()
                if original:
                    args[0]['postgres']['service'] = value
                else:
                    args[1]['postgres'] = value
                self.assert_rejected(args)
        for value in (float('nan'), float('inf'), {'not-json'}):
            args = fixture()
            args[1]['postgres']['Spec']['FutureField'] = value
            self.assert_rejected(args)


if __name__ == '__main__':
    unittest.main()
