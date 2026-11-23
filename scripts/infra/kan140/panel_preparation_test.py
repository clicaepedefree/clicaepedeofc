import json
from pathlib import Path
import subprocess
import unittest
from unittest import mock

import panel_preparation as p


class PreparationTests(unittest.TestCase):
    def setup_case(self):
        self.saved, self.calls = [], []
        self.prep = p.Preparation(mock.Mock(), mock.Mock(), Path('/fixture'), self.saved.append,
                                  nonce='a' * 32)
        self.record = {'enabled': True, 'source': {'type': 'inline', 'content': json.dumps(self.prep.source)}}
        def call(operation, payload, **kwargs):
            self.calls.append(operation)
            if operation == 'inspectProject':
                return {'project': {'name': 'clica-qa'}, 'services': []}
            if operation == 'inspectComposeService':
                return self.record
            if operation == 'listActions':
                return [{'projectName':'clica-qa','serviceName':'evolution-qa','status':'success'}]
            if operation == 'stopComposeService':
                self.record['enabled'] = False
            return None
        self.prep.api.call.side_effect = call
        self.prep.docker.run.return_value = subprocess.CompletedProcess([], 0, b'fixture-container')
        item = {'Config': {'Image':p.IMAGE, 'Labels':{p.LABEL:'a'*32, 'com.docker.compose.project':'fixture-project'}},
                'HostConfig': {'NetworkMode':'none', 'RestartPolicy':{'Name':'no'}},
                'Mounts': [{'Type':'bind','RW':False,'Source':str(self.prep.root/'fixture-secret'),
                            'Destination':'/run/secrets/fixture-secret'},
                           {'Type':'bind','RW':False,'Source':str(self.prep.root/'fixture-config'),
                            'Destination':'/run/configs/fixture-config'}],
                'State':{'Status':'exited','ExitCode':0}}
        item['Config'].update(Entrypoint=self.prep.source['services']['evolution']['entrypoint'],
                              Cmd=self.prep.source['services']['evolution']['command'])
        self.prep.docker.data.return_value = [item]
        return item

    def test_fixture_source_has_no_live_volumes_or_network(self):
        source = p.fixture_source(Path('/fixture'), 'a' * 32)
        service = source['services']['evolution']
        self.assertEqual(service['network_mode'], 'none')
        self.assertEqual(service['restart'], 'no')
        self.assertNotIn('volumes', source)
        self.assertNotIn('ports', service)

    def test_success_records_intent_before_mutation_and_disables_controller(self):
        self.setup_case()
        result = self.prep.run()
        self.assertEqual([x['phase'] for x in self.saved], ['creating','disabled-verified'])
        self.assertEqual(self.calls.count('createComposeService'), 1)
        self.assertFalse(result['controller_enabled'])
        self.assertFalse(result['production_cutover'])

    def test_nonempty_project_never_creates_anything(self):
        self.setup_case()
        self.prep.api.call.return_value = {'project':{'name':'clica-qa'},'services':[{}]}
        self.prep.api.call.side_effect = None
        with self.assertRaisesRegex(p.Rejected, 'project-not-empty'):
            self.prep.run()
        self.assertEqual(len(self.prep.api.call.call_args_list), 1)
        self.assertEqual(self.saved, [])

    def test_unproven_action_schema_fails_closed_and_stops_owned_controller(self):
        self.setup_case()
        original = self.prep.api.call.side_effect
        self.prep.api.call.side_effect = lambda operation,*a,**kw: ([{'status':'unknown'}] if operation=='listActions' else original(operation,*a,**kw))
        with self.assertRaises(p.Rejected):
            self.prep.run()
        self.assertEqual(self.calls.count('createComposeService'), 1)
        self.assertIn('stopComposeService', self.calls)
        self.assertEqual(self.saved[-1]['phase'], 'needs-reconciliation')

    def test_source_mismatch_prevents_reconciliation_mutation(self):
        self.setup_case()
        self.record['source']['content'] = '{}'
        with self.assertRaisesRegex(p.Rejected, 'native-source-drift'):
            self.prep.reconcile()
        self.assertNotIn('stopComposeService', self.calls)

    def test_ambiguous_create_cannot_stop_foreign_source(self):
        self.setup_case()
        original = self.prep.api.call.side_effect
        def call(operation, *args, **kwargs):
            if operation == 'createComposeService':
                self.record['source']['content'] = '{}'
                raise p.panel_client.PanelError('transport-failed')
            return original(operation, *args, **kwargs)
        self.prep.api.call.side_effect = call
        with self.assertRaisesRegex(p.Rejected, 'native-source-drift'):
            self.prep.run()
        self.assertNotIn('stopComposeService', self.calls)

    def test_missing_binds_or_noop_entrypoint_never_proves_file_access(self):
        for mutation in ('binds', 'entrypoint'):
            item = self.setup_case()
            if mutation == 'binds':item['Mounts']=[]
            else:item['Config']['Entrypoint']=['/bin/true']
            with self.subTest(mutation=mutation), self.assertRaises(p.Rejected):
                self.prep.run()

    def test_interruption_during_create_reconciles_exact_source_before_stop(self):
        self.setup_case()
        class Interrupted(BaseException):
            pass
        original = self.prep.api.call.side_effect
        def call(operation, *args, **kwargs):
            if operation == 'createComposeService':
                self.calls.append(operation)
                raise Interrupted()
            return original(operation, *args, **kwargs)
        self.prep.api.call.side_effect = call
        with self.assertRaises(Interrupted):
            self.prep.run()
        self.assertEqual(self.calls.count('createComposeService'), 1)
        self.assertLess(self.calls.index('inspectComposeService'), self.calls.index('stopComposeService'))
        self.assertFalse(self.record['enabled'])

    def test_fixture_running_with_restart_or_live_mount_cannot_pass(self):
        for mutation in ('restart', 'volume', 'exit'):
            item = self.setup_case()
            if mutation == 'restart':item['HostConfig']['RestartPolicy']['Name']='always'
            elif mutation == 'volume':item['Mounts']=[{'Type':'volume','RW':True}]
            else:item['State']['ExitCode']=1
            with self.subTest(mutation=mutation), self.assertRaises(p.Rejected):
                self.prep.run()
            self.assertEqual(self.saved[-1]['phase'], 'needs-reconciliation')

    def test_pending_action_is_not_terminal(self):
        rows=[{'projectName':'clica-qa','serviceName':'evolution-qa','status':'running'}]
        self.assertFalse(p.actions_terminal(rows))

    def test_materialization_is_exact_disabled_fixture_and_never_recreates(self):
        self.setup_case()
        self.record['enabled'] = False
        self.prep.docker.run.side_effect = [subprocess.CompletedProcess([],0,b''),
                                           subprocess.CompletedProcess([],0,b'fixture-container')]
        result = self.prep.materialize_fixture()
        self.assertEqual(result['status'], 'pass')
        self.assertNotIn('createComposeService', self.calls)
        self.assertLess(self.calls.index('updateComposeSourceInline'), self.calls.index('deployComposeService'))
        self.assertEqual(self.calls.count('deployComposeService'), 1)
        self.assertFalse(self.record['enabled'])

    def test_materialization_rejects_stale_proof_container(self):
        self.setup_case()
        self.record['enabled'] = False
        with self.assertRaisesRegex(p.Rejected, 'fixture-preexisting-container'):
            self.prep.materialize_fixture()
        self.assertNotIn('deployComposeService', self.calls)

    def test_materialization_refuses_enabled_or_foreign_controller(self):
        for foreign in (False, True):
            self.setup_case()
            if foreign:self.record['source']['content']='{}'
            with self.assertRaises(p.Rejected):self.prep.materialize_fixture()
            self.assertNotIn('updateComposeSourceInline', self.calls)
            self.assertNotIn('deployComposeService', self.calls)

    def test_failed_error_checkpoint_does_not_prevent_controller_stop(self):
        item = self.setup_case()
        item['State']['ExitCode'] = 1
        def save(record):
            if record['phase'] == 'needs-reconciliation':
                raise OSError('fixture-disk-failure')
            self.saved.append(record)
        self.prep.save = save
        with self.assertRaises(OSError):
            self.prep.run()
        self.assertIn('stopComposeService', self.calls)


if __name__ == '__main__':
    unittest.main()
