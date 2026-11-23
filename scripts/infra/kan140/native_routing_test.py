"""Pure transaction tests. No network, credentials, SSH, CLI or host changes.

These tests do NOT prove native TLS, aliases, proxy isolation or writer/data
safety on the installed panel. All gate callbacks here are test doubles.
"""

import copy
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch

import native_routing as nr


def fixture():
    # Actual operator-observed layout; separate IP/panel access guards are NOT here.
    return {'http': {'routers': {
                         'kan131-block-panel-http': {
                             'rule': 'HostRegexp(`.+`)', 'ruleSyntax': 'v3', 'priority': 3,
                             'entryPoints': ['http'], 'service': 'noop@internal'},
                         'kan131-block-panel-https': {
                             'rule': 'HostRegexp(`.+`)', 'ruleSyntax': 'v3', 'priority': 3,
                             'entryPoints': ['https'], 'service': 'noop@internal', 'tls': {}},
                         **nr.legacy_routers()},
                     'services': {nr.LEGACY_SERVICE: nr.legacy_service()},
                     'middlewares': {'kan131-https': {
                         'redirectScheme': {'scheme': 'https', 'permanent': True}}}}}


class Memory:
    def __init__(self):
        self.route, self.record = nr.encode(fixture()), None
        self.fail = None
        self.race = None
        self.writes = []

    def read_route(self):
        return self.route

    def read_record(self):
        return self.record

    def cas(self, target, expected, raw):
        if self.race == target:
            self.race = None
            doc = nr.decode(getattr(self, target))
            doc['concurrent'] = 'preserve'
            doc['_race_generation'] = doc.get('_race_generation', 0) + 1
            setattr(self, target, nr.encode(doc))
        current = getattr(self, target)
        nr.require((nr.digest(current) if current is not None else None) == expected,
                   'cas-conflict')
        if self.fail == (target, 'before'):
            self.fail = None
            raise OSError('injected')
        setattr(self, target, raw)
        self.writes.append(target)
        if self.fail == (target, 'after'):
            self.fail = None
            raise OSError('injected')

    def cas_route(self, expected, raw):
        self.cas('route', expected, raw)

    def cas_record(self, expected, raw):
        self.cas('record', expected, raw)


class API:
    def __init__(self):
        self.domains, self.calls = [], []
        self.fail, self.read_fail = None, False

    def read(self):
        if self.read_fail:
            raise OSError('private remote detail')
        return copy.deepcopy(self.domains)

    def call(self, operation, payload, **kwargs):
        self.calls.append(operation)
        if self.fail == (operation, 'before'):
            raise OSError('private remote detail')
        if operation == 'createDomain':
            self.domains.append(copy.deepcopy(payload))
        elif operation == 'destroyDomain':
            assert kwargs['domain_evidence'] == self.domains[0]
            self.domains = [row for row in self.domains if row['id'] != payload['id']]
        else:
            raise AssertionError('no service operations allowed')
        if self.fail == (operation, 'after'):
            raise OSError('private remote detail')


class RoutingTest(unittest.TestCase):
    def setUp(self):
        self.store, self.api = Memory(), API()
        self.fenced = True
        self.external_access_guards_valid = True
        self.routing = self.make()
        self.routing.begin(nr.digest(self.store.route))

    def make(self):
        return nr.Routing(self.api, self.store, self.api.read, domain_id='kan140-native-evo',
                          fence=lambda: self.fenced and self.external_access_guards_valid)

    def test_pending_create_cannot_be_called_rolled_back_from_empty_inventory(self):
        self.api.fail=('createDomain','before')
        with self.assertRaises(nr.Rejected):self.routing.registerNative(lambda:True)
        with self.assertRaisesRegex(nr.Rejected,'native-create-outcome-unknown'):
            self.routing.rollbackRoutes(lambda:True)
        row=nr.decode(self.store.record)
        self.assertFalse(row['restored'])
        self.assertFalse(row['delete_verified'])
        # Completion after the timeout can be observed and deleted, not retried.
        self.api.domains.append(copy.deepcopy(self.routing.domain))
        self.routing.rollbackRoutes(lambda:True)
        self.assertEqual(self.api.calls.count('createDomain'),1)
        self.assertEqual(self.api.domains,[])
        self.assertTrue(nr.decode(self.store.record)['restored'])

    def register(self):
        return self.routing.registerNative(lambda: True)

    def cut(self):
        self.register()
        return self.routing.cutLegacy(lambda: True)

    def assertLegacy(self):
        nr.validate_route(nr.decode(self.store.route), self.routing.protected, legacy=True)

    def test_actual_four_router_layout_begins_without_external_guards_in_file(self):
        doc = nr.decode(self.store.route)
        blockers = {'kan131-block-panel-http', 'kan131-block-panel-https'}
        self.assertEqual(set(doc['http']['routers']), blockers | set(nr.SELECTORS))
        self.assertEqual(set(nr.guards()), blockers)
        self.assertEqual(set(self.routing.protected), blockers)
        self.assertEqual(set(doc['http']['services']), {nr.LEGACY_SERVICE})
        self.assertEqual(set(doc['http']['middlewares']), {'kan131-https'})
        self.assertEqual(self.api.read(), [])
        self.assertEqual(self.api.calls, [])
        self.assertFalse(nr.decode(self.store.record)['external_verified'])

    def test_non_evolution_blocker_drift_rejected_at_begin(self):
        for key in nr.guards():
            for change in ({'priority': 4}, {'service': 'foreign'},
                           {'rule': 'Host(`foreign.test`)'}, {'entryPoints': ['other']}):
                with self.subTest(key=key, change=change):
                    self.store = Memory()
                    doc = nr.decode(self.store.route)
                    doc['http']['routers'][key].update(change)
                    self.store.route = nr.encode(doc)
                    routing = self.make()
                    with self.assertRaisesRegex(nr.Rejected, 'protected-guard-drift'):
                        routing.begin(nr.digest(self.store.route))
                    self.assertIsNone(self.store.record)
                    self.assertEqual(self.store.writes, [])

    def test_external_access_guard_drift_refused_by_operator_fence(self):
        # The module never reads that other file. This models the mandatory
        # operator pin/rule check in fence(), not proof of actual live guards.
        for stage in ('register', 'cut', 'verify', 'rollback'):
            with self.subTest(stage=stage):
                self.setUp()
                if stage in ('cut', 'verify', 'rollback'):
                    self.register()
                if stage in ('verify', 'rollback'):
                    self.routing.cutLegacy(lambda: True)
                before = (self.store.route, self.store.record, list(self.api.calls))
                self.external_access_guards_valid = False
                operation = {'register': self.routing.registerNative,
                             'cut': self.routing.cutLegacy,
                             'verify': self.routing.verifyNative,
                             'rollback': self.routing.rollbackRoutes}[stage]
                with self.assertRaisesRegex(nr.Rejected, 'writer-fence-required'):
                    operation(lambda: True)
                self.assertEqual((self.store.route, self.store.record, self.api.calls), before)

    def test_direct_backend_and_config_preproof_can_cut_without_public_pass(self):
        self.register()
        evidence = {'direct_native_api_invalid_key_401': True,
                    'direct_native_api_valid_key_200': True,
                    'native_proxy_config': True, 'generated_alias': True,
                    'healthy': True, 'ownership': True}
        for key in evidence:
            with self.subTest(missing=key):
                evidence[key] = False
                with self.assertRaisesRegex(nr.Rejected, 'native-preproof-required'):
                    self.routing.cutLegacy(lambda: all(evidence.values()))
                self.assertLegacy()
                evidence[key] = True
        result = self.routing.cutLegacy(lambda: all(evidence.values()))
        self.assertFalse(result['external_verified'])
        self.assertFalse(nr.decode(self.store.record)['external_verified'])
        with self.assertRaisesRegex(nr.Rejected, 'external-native-gate-required'):
            self.routing.verifyNative(lambda: False)
        self.assertFalse(nr.decode(self.store.record)['external_verified'])

    def test_public_https_cannot_pass_before_cut(self):
        self.register()
        public_gate = MagicMock(return_value=True)
        with self.assertRaisesRegex(nr.Rejected, 'cut-required'):
            self.routing.verifyNative(public_gate)
        public_gate.assert_not_called()
        self.assertFalse(nr.decode(self.store.record)['external_verified'])
        self.routing.cutLegacy(lambda: True)
        self.assertTrue(self.routing.verifyNative(public_gate)['external_verified'])
        public_gate.assert_called_once_with()

    def test_copy_gate_cannot_be_replaced_by_successful_backend_api(self):
        evidence = {'old_evo_pg_redis_quiesced': True, 'copy_verified': False,
                    'real_inline_installed': True, 'backend_api_401_200': True}
        with self.assertRaisesRegex(nr.Rejected, 'before-deploy-gate-required'):
            self.routing.registerNative(lambda: all(evidence.values()))
        self.assertEqual(self.api.calls, [])
        self.assertLegacy()
        evidence['copy_verified'] = True
        result = self.routing.registerNative(lambda: all(evidence.values()))
        self.assertEqual(self.api.calls, ['createDomain'])
        self.assertFalse(result['external_verified'])

    def test_payload_register_before_first_deploy_leaves_legacy_intact(self):
        raw = self.store.route
        result = self.register()
        self.assertEqual(raw, self.store.route)
        self.assertEqual(self.api.calls, ['createDomain'])
        self.assertEqual(self.api.domains, [nr.panel_client.create_domain_payload(
            'kan140-native-evo', certificate_resolver='letsencrypt')])
        self.assertFalse(result['external_verified'])

    def test_gates_block_registration_cut_and_verification(self):
        with self.assertRaisesRegex(nr.Rejected, 'before-deploy-gate-required'):
            self.routing.registerNative(lambda: False)
        self.assertEqual(self.api.calls, [])
        self.register()
        with self.assertRaisesRegex(nr.Rejected, 'native-preproof-required'):
            self.routing.cutLegacy(lambda: False)
        self.assertLegacy()
        self.routing.cutLegacy(lambda: True)
        with self.assertRaisesRegex(nr.Rejected, 'external-native-gate-required'):
            self.routing.verifyNative(lambda: False)
        self.assertFalse(nr.decode(self.store.record)['external_verified'])

    def test_cut_changes_only_exact_router_selectors(self):
        before = nr.decode(self.store.route)
        self.cut()
        for key in nr.SELECTORS:
            del before['http']['routers'][key]
        self.assertEqual(nr.decode(self.store.route), before)
        self.assertFalse(nr.decode(self.store.record)['external_verified'])
        self.assertTrue(self.routing.verifyNative(lambda: True)['external_verified'])

    def test_rollback_merges_current_state_never_whole_snapshot(self):
        self.cut()
        doc = nr.decode(self.store.route)
        doc['http']['routers']['new-foreign'] = {'rule': 'Host(`new.test`)'}
        doc['tcp'] = {'new-current-state': True}
        self.store.route = nr.encode(doc)
        result = self.make().rollbackRoutes(lambda: True)
        doc['http']['routers'].update(nr.legacy_routers())
        self.assertEqual(nr.decode(self.store.route), doc)
        self.assertEqual(self.api.domains, [])
        self.assertFalse(result['old_restarted'])
        self.assertFalse(result['data_rollback_proven'])
        self.assertEqual(self.api.calls, ['createDomain', 'destroyDomain'])

    def test_rollback_does_not_resurrect_unrelated_snapshot_entries(self):
        # Start from the actual-layout fixture, then model another owner's later
        # addition before this transaction begins. Snapshot restoration is unsafe.
        self.store = Memory()
        doc = nr.decode(self.store.route)
        doc['http']['routers']['foreign'] = {'service': 'foreign'}
        doc['tcp'] = {'old-current-state': True}
        self.store.route = nr.encode(doc)
        self.routing = self.make()
        self.routing.begin(nr.digest(self.store.route))
        self.cut()
        doc = nr.decode(self.store.route)
        del doc['http']['routers']['foreign']
        doc['tcp'] = {'new-current-state': True}
        self.store.route = nr.encode(doc)
        self.routing.rollbackRoutes(lambda: True)
        self.assertNotIn('foreign', nr.decode(self.store.route)['http']['routers'])
        self.assertEqual(nr.decode(self.store.route)['tcp'], {'new-current-state': True})
        self.assertLegacy()

    def test_ambiguous_create_after_effect_reconciles_once(self):
        self.api.fail = ('createDomain', 'after')
        self.register()
        self.make().registerNative(lambda: True)
        self.assertEqual(self.api.calls, ['createDomain'])
        self.assertEqual(len(self.api.domains), 1)

    def test_failed_create_before_effect_never_retries_across_restart(self):
        self.api.fail = ('createDomain', 'before')
        for routing in (self.routing, self.make()):
            with self.assertRaisesRegex(nr.Rejected, 'create-needs-reconciliation-no-retry'):
                routing.registerNative(lambda: True)
        self.assertEqual(self.api.calls, ['createDomain'])
        self.assertLegacy()
        with self.assertRaisesRegex(nr.Rejected,'native-create-outcome-unknown'):
            self.make().rollbackRoutes(lambda: True)
        self.assertFalse(nr.decode(self.store.record)['restored'])
        self.assertEqual(self.api.calls, ['createDomain'])

    def test_create_success_then_read_failure_reconciles_without_post(self):
        original = self.api.call
        def call(*args, **kwargs):
            original(*args, **kwargs)
            self.api.read_fail = True
        self.api.call = call
        with self.assertRaisesRegex(nr.Rejected, 'domain-read-unproven'):
            self.register()
        self.api.read_fail = False
        self.make().registerNative(lambda: True)
        self.assertEqual(self.api.calls, ['createDomain'])

    def test_successful_create_checkpoint_failure_never_creates_twice(self):
        original = self.store.cas_record
        def save(expected, raw):
            if nr.decode(raw)['native_verified']:
                self.store.fail = ('record', 'before')
            original(expected, raw)
        self.store.cas_record = save
        with self.assertRaises(OSError):
            self.register()
        self.store.cas_record = original
        self.make().registerNative(lambda: True)
        self.assertEqual(self.api.calls, ['createDomain'])

    def test_journal_cas_conflict_blocks_post_and_preserves_other_record(self):
        self.store.race = 'record'
        with self.assertRaisesRegex(nr.Rejected, 'cas-conflict'):
            self.register()
        self.assertEqual(self.api.calls, [])
        self.assertEqual(nr.decode(self.store.record)['concurrent'], 'preserve')

    def test_foreign_and_duplicate_domain_protection(self):
        domain = copy.deepcopy(self.routing.domain)
        for change in ({'id': 'foreign'}, {'path': '/other'}, {'certificateResolver': 'other'},
                       {'host': '*.clicaepede.com.br', 'wildcard': True},
                       {'host': 'EVOLUTION-STAGING.CLICAEPEDE.COM.BR.'},
                       {'unknown-routing-field': True}):
            with self.subTest(change=change):
                self.api.domains = [{**domain, **change}]
                with self.assertRaisesRegex(nr.Rejected, 'foreign-or-duplicate-domain'):
                    self.register()
        self.api.domains = [domain, domain]
        with self.assertRaisesRegex(nr.Rejected, 'domain-list-shape'):
            self.register()
        self.assertEqual(self.api.calls, [])

    def test_preexisting_exact_domain_not_adopted_or_deleted(self):
        self.api.domains = [copy.deepcopy(self.routing.domain)]
        with self.assertRaisesRegex(nr.Rejected, 'native-domain-preexists'):
            self.register()
        with self.assertRaisesRegex(nr.Rejected, 'unowned-native-domain'):
            self.routing.rollbackRoutes(lambda: True)
        self.assertEqual(self.api.calls, [])

    def test_protected_guards_fail_closed_without_writes(self):
        self.register()
        for key in self.routing.protected:
            with self.subTest(key=key):
                doc = fixture()
                del doc['http']['routers'][key]
                self.store.route = nr.encode(doc)
                raw = self.store.route
                with self.assertRaisesRegex(nr.Rejected, 'protected-guard-drift'):
                    self.routing.cutLegacy(lambda: True)
                self.assertEqual(self.store.route, raw)

    def test_non_evolution_blocker_drift_blocks_rollback_before_domain_delete(self):
        self.cut()
        doc = nr.decode(self.store.route)
        doc['http']['routers']['kan131-block-panel-https']['tls'] = {
            'certResolver': 'foreign'}
        self.store.route = nr.encode(doc)
        before = (self.store.route, self.store.record)
        with self.assertRaisesRegex(nr.Rejected, 'protected-guard-drift'):
            self.routing.rollbackRoutes(lambda: True)
        self.assertEqual((self.store.route, self.store.record), before)
        self.assertEqual(self.api.calls, ['createDomain'])

    def test_foreign_router_service_and_partial_selector_rejected(self):
        self.register()
        for kind in ('router', 'service', 'partial'):
            with self.subTest(kind=kind):
                doc = fixture()
                if kind == 'router':
                    doc['http']['routers'][nr.SELECTORS[1]]['priority'] = 101
                elif kind == 'service':
                    doc['http']['services'][nr.LEGACY_SERVICE]['loadBalancer']['servers'][0]['url'] = 'http://foreign:8080'
                else:
                    del doc['http']['routers'][nr.SELECTORS[0]]
                self.store.route = nr.encode(doc)
                raw = self.store.route
                with self.assertRaises(nr.Rejected):
                    self.routing.cutLegacy(lambda: True)
                self.assertEqual(raw, self.store.route)

    def test_foreign_rollback_selector_blocks_before_native_delete(self):
        self.cut()
        doc = nr.decode(self.store.route)
        doc['http']['routers'][nr.SELECTORS[0]] = {'service': 'foreign'}
        self.store.route = nr.encode(doc)
        with self.assertRaisesRegex(nr.Rejected, 'foreign-legacy-selector'):
            self.routing.rollbackRoutes(lambda: True)
        self.assertEqual(self.api.calls, ['createDomain'])

    def test_route_cas_rejects_concurrent_changes_cut_and_restore(self):
        self.register()
        self.store.race = 'route'
        with self.assertRaisesRegex(nr.Rejected, 'cas-conflict'):
            self.routing.cutLegacy(lambda: True)
        self.assertEqual(nr.decode(self.store.route)['concurrent'], 'preserve')
        self.assertLegacy()
        self.routing.cutLegacy(lambda: True)
        self.store.race = 'route'
        with self.assertRaisesRegex(nr.Rejected, 'cas-conflict'):
            self.routing.rollbackRoutes(lambda: True)
        self.assertEqual(nr.decode(self.store.route)['concurrent'], 'preserve')
        self.make().rollbackRoutes(lambda: True)
        self.assertLegacy()

    def test_journal_failure_before_or_after_intent_never_posts(self):
        for when in ('before', 'after'):
            with self.subTest(when=when):
                self.setUp()
                self.store.fail = ('record', when)
                with self.assertRaises(OSError):
                    self.register()
                self.assertEqual(self.api.calls, [])
                if when == 'after':
                    with self.assertRaisesRegex(nr.Rejected, 'no-retry'):
                        self.make().registerNative(lambda: True)

    def test_route_write_failure_before_and_after_effect_resumable(self):
        for when in ('before', 'after'):
            with self.subTest(when=when):
                self.setUp()
                self.register()
                self.store.fail = ('route', when)
                with self.assertRaises(OSError):
                    self.routing.cutLegacy(lambda: True)
                self.make().cutLegacy(lambda: True)
                self.make().rollbackRoutes(lambda: True)
                self.assertLegacy()
                self.assertEqual(self.api.calls, ['createDomain', 'destroyDomain'])

    def test_restore_failure_before_and_after_effect_resumable(self):
        for when in ('before', 'after'):
            with self.subTest(when=when):
                self.setUp()
                self.cut()
                self.store.fail = ('route', when)
                with self.assertRaises(OSError):
                    self.routing.rollbackRoutes(lambda: True)
                self.make().rollbackRoutes(lambda: True)
                self.assertLegacy()
                self.assertEqual(self.api.calls, ['createDomain', 'destroyDomain'])

    def test_ambiguous_delete_after_effect_reconciles(self):
        self.cut()
        self.api.fail = ('destroyDomain', 'after')
        self.routing.rollbackRoutes(lambda: True)
        self.make().rollbackRoutes(lambda: True)
        self.assertLegacy()
        self.assertEqual(self.api.calls, ['createDomain', 'destroyDomain'])

    def test_delete_failure_before_effect_no_retry_and_no_false_complete(self):
        self.cut()
        self.api.fail = ('destroyDomain', 'before')
        for routing in (self.routing, self.make()):
            with self.assertRaisesRegex(nr.Rejected, 'delete-needs-reconciliation-no-retry'):
                routing.rollbackRoutes(lambda: True)
        self.assertEqual(self.api.calls, ['createDomain', 'destroyDomain'])
        self.assertFalse(nr.decode(self.store.record)['restored'])

    def test_fence_and_rollback_quiescence_required(self):
        self.register()
        with self.assertRaisesRegex(nr.Rejected, 'managed-quiesced-gate-required'):
            self.routing.rollbackRoutes(lambda: False)
        self.fenced = False
        with self.assertRaisesRegex(nr.Rejected, 'writer-fence-required'):
            self.routing.cutLegacy(lambda: True)
        self.assertEqual(self.api.calls, ['createDomain'])

    def test_duplicate_json_keys_rejected(self):
        with self.assertRaisesRegex(nr.Rejected, 'duplicate-json-key'):
            nr.decode(b'{"http":{},"http":{}}')

    def test_authoritative_reader_unknown_schema_fails_closed(self):
        for response in (None, {'domains': []}, [{'id': 'only-id'}]):
            with self.subTest(response=response):
                self.routing.read_domains = lambda: response
                with self.assertRaisesRegex(nr.Rejected, 'domain-list-shape'):
                    self.register()
                self.assertEqual(self.api.calls, [])

    def test_snapshot_identity_and_initial_version_checked(self):
        store = Memory()
        routing = nr.Routing(self.api, store, self.api.read, domain_id='kan140-other',
                             admin_address='203.0.113.7', default_hostname='panel.example.test',
                             fence=lambda: True)
        with self.assertRaisesRegex(nr.Rejected, 'cas-conflict'):
            routing.begin('0' * 64)
        self.assertIsNone(store.record)
        row = nr.decode(self.store.record)
        row['before_route'] += ' '
        self.store.record = nr.encode(row)
        with self.assertRaisesRegex(nr.Rejected, 'snapshot-drift'):
            self.register()


class PrivateFilesContractTest(unittest.TestCase):
    def test_journal_read_requires_root_0600_single_regular_file(self):
        metadata = SimpleNamespace(st_mode=nr.stat.S_IFREG | 0o600, st_uid=0,
                                   st_gid=0, st_nlink=1, st_size=2, st_dev=1,
                                   st_ino=2, st_mtime_ns=3, st_ctime_ns=4)
        stream = MagicMock()
        stream.__enter__.return_value = stream
        stream.read.return_value = b'{}'
        stream.fileno.return_value = 42
        files = nr.Files(lambda: True)
        with patch.object(files, '_parents'), \
                patch.object(nr.os, 'O_NOFOLLOW', 0x20000, create=True), \
                patch.object(nr.os, 'O_NONBLOCK', 0x800, create=True), \
                patch.object(nr.os, 'open', return_value=42), \
                patch.object(nr.os, 'fdopen', return_value=stream), \
                patch.object(nr.os, 'fstat', return_value=metadata), \
                patch.object(nr.Path, 'lstat', return_value=metadata):
            self.assertEqual(files.read_record(), b'{}')
            for attribute, wrong in (('st_uid', 1000), ('st_gid', 1000), ('st_nlink', 2),
                                     ('st_mode', nr.stat.S_IFREG | 0o640),
                                     ('st_mode', nr.stat.S_IFLNK | 0o600)):
                with self.subTest(attribute=attribute, wrong=wrong):
                    original = getattr(metadata, attribute)
                    setattr(metadata, attribute, wrong)
                    with self.assertRaises(nr.Rejected):
                        files.read_record()
                    setattr(metadata, attribute, original)

    def test_atomic_writer_checks_hash_again_before_replace(self):
        files = nr.Files(lambda: True)
        stream = MagicMock()
        stream.__enter__.return_value = stream
        stream.fileno.return_value = 42
        with patch.object(files, '_parents'), \
                patch.object(files, '_read', side_effect=[b'{}', b'{"concurrent":true}']), \
                patch.object(nr.tempfile, 'mkstemp', return_value=(42, str(nr.PRIVATE / 'test.tmp'))) as mkstemp, \
                patch.object(nr.os, 'fdopen', return_value=stream), \
                patch.object(nr.os, 'fchown', create=True) as chown, \
                patch.object(nr.os, 'fchmod', create=True) as chmod, \
                patch.object(nr.os, 'fsync'), \
                patch.object(nr.os, 'replace') as replace, \
                patch.object(nr.Path, 'exists', return_value=False):
            with self.assertRaisesRegex(nr.Rejected, 'cas-conflict'):
                files.cas_record(nr.digest(b'{}'), b'{"next":true}')
            mkstemp.assert_called_once_with(dir=nr.PRIVATE, suffix='.tmp')
            chown.assert_called_once_with(42, 0, 0)
            chmod.assert_called_once_with(42, 0o600)
            replace.assert_not_called()

    def test_private_parent_requires_root_and_exact_0700(self):
        good = SimpleNamespace(st_mode=nr.stat.S_IFDIR | 0o755, st_uid=0, st_gid=0)
        private = SimpleNamespace(st_mode=nr.stat.S_IFDIR | 0o700, st_uid=0, st_gid=0)
        metadata = lambda path: private if path == nr.PRIVATE else good
        with patch.object(nr.os, 'name', 'posix'), \
                patch.object(nr.os, 'geteuid', create=True, return_value=0), \
                patch.object(nr.Path, 'lstat', metadata):
            files = nr.Files(lambda: True)
            files._parents(nr.JOURNAL)
            for attribute, wrong in (('st_uid', 1000), ('st_gid', 1000),
                                     ('st_mode', nr.stat.S_IFDIR | 0o750),
                                     ('st_mode', nr.stat.S_IFLNK | 0o700)):
                with self.subTest(attribute=attribute, wrong=wrong):
                    original = getattr(private, attribute)
                    setattr(private, attribute, wrong)
                    with self.assertRaises(nr.Rejected):
                        files._parents(nr.JOURNAL)
                    setattr(private, attribute, original)

    def test_no_filesystem_access_without_root_and_real_fence(self):
        with patch.object(nr.os, 'name', 'posix'), \
                patch.object(nr.os, 'geteuid', create=True, return_value=1000), \
                patch.object(nr.Path, 'lstat') as inspected:
            with self.assertRaisesRegex(nr.Rejected, 'linux-root-required'):
                nr.Files(lambda: True)._parents(nr.JOURNAL)
            inspected.assert_not_called()
        with patch.object(nr.os, 'name', 'posix'), \
                patch.object(nr.os, 'geteuid', create=True, return_value=0), \
                patch.object(nr.Path, 'lstat') as inspected:
            with self.assertRaisesRegex(nr.Rejected, 'writer-fence-required'):
                nr.Files(lambda: False)._parents(nr.JOURNAL)
            inspected.assert_not_called()


if __name__ == '__main__':
    unittest.main()
