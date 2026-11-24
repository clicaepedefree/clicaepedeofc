"""Fault injection for explicit partial recovery; no Docker or production data."""
import copy
import importlib.util
import os
from pathlib import Path
import stat
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import managed_lifecycle as lifecycle
from managed_lifecycle_test import Harness, container


class PartialRecoveryTests(unittest.TestCase):
    def test_cutover_without_either_recovery_verifier_is_blocked_before_first_mutation(self):
        for name, reason in [('source_freshness', 'rollback-freshness-unavailable'),
                             ('target_continuity', 'rollback-target-proof-unavailable')]:
            h = Harness()
            setattr(h.c, name, None)
            with self.assertRaisesRegex(lifecycle.Rejected, reason):
                h.c.cutover()
            self.assertEqual(h.files.values, {})
            self.assertEqual(h.sdk.updates, [])
            self.assertEqual(h.calls, [])

    def test_fresh_coordinator_after_each_real_publication_write_validates_files_and_runtime(self):
        def load(name, file):
            spec = importlib.util.spec_from_file_location(name, Path(__file__).resolve().parents[1] / 'kan133' / file)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            return module
        runtime = load('partial_real_runtime', 'runtime.py')
        with patch.dict('sys.modules', {'runtime': runtime}):
            backup = load('partial_real_backup', 'backup.py')
        for target_name in ('managed', 'ownership.json'):
            for after in (False, True):
                with self.subTest(target=target_name, after=after), tempfile.TemporaryDirectory() as folder:
                    root = Path(folder).resolve()
                    h = self.interrupted('publish-swarm')
                    h.runtime.ROOT = root
                    h.runtime.load, h.runtime.publish = runtime.load, runtime.publish
                    source, receipt, owner = h.c.rollback_documents(h.c.state['rollback_services'])
                    values = copy.deepcopy(h.files.values)
                    values['lifecycle.json']['rollback_publication'] = owner
                    values['swarm.json'], values['compose-disabled.json'] = source, receipt
                    real_stat, real_open, real_close = Path.lstat, os.open, os.close
                    real_replace, real_fsync = os.replace, os.fsync
                    directories = {root, *root.parents}
                    directory_fd = 2 ** 30
                    def metadata(path, *args, **kwargs):
                        info = real_stat(path, *args, **kwargs)
                        if path in directories:
                            return SimpleNamespace(st_uid=0, st_mode=stat.S_IFDIR | 0o700)
                        return info
                    def open_path(path, flags, *args, **kwargs):
                        if Path(path) == root:
                            return directory_fd
                        return real_open(path, flags, *args, **kwargs)
                    fired = []
                    def replace(source_path, destination):
                        if Path(destination) == root / target_name and not fired:
                            fired.append(True)
                            if after:
                                real_replace(source_path, destination)
                            raise lifecycle.Interrupted()
                        return real_replace(source_path, destination)
                    # Real atomic file writes and owner parsing; only OS root metadata
                    # and directory fsync are abstracted for non-root/Windows unit CI.
                    with patch.object(runtime, 'ROOT', root), \
                            patch.object(runtime, 'MANIFEST', root / 'ownership.json'), \
                            patch.object(runtime, 'SENTINEL', root / 'managed'), \
                            patch.object(runtime, '_lock_depth', 1), \
                            patch.object(runtime, 'trusted_bytes', side_effect=lambda path, **kw: Path(path).read_bytes()), \
                            patch.object(Path, 'lstat', metadata), \
                            patch.object(os, 'geteuid', return_value=0, create=True), \
                            patch.object(os, 'O_DIRECTORY', getattr(os, 'O_DIRECTORY', 0), create=True), \
                            patch.object(os, 'open', open_path), \
                            patch.object(os, 'close', lambda fd: None if fd == directory_fd else real_close(fd)), \
                            patch.object(os, 'fsync', lambda fd: None if fd == directory_fd else real_fsync(fd)), \
                            patch.object(backup.os, 'fchmod', create=True), patch.object(backup, 'sync_dir'):
                        files = lifecycle.Files(backup, runtime)
                        for name, value in values.items():
                            files.write(name, value)
                        def fresh():
                            return lifecycle.Coordinator(api=h, engine=h.c.engine, backup=h.backup,
                                runtime=h.runtime, stage=lambda: self.fail('restaged'),
                                transfer=lambda phase: self.fail('recopied'), fixture=None,
                                gates=lambda: lifecycle.REQUIRED_GATES, files=files,
                                rollback_freshness=h.c.source_freshness,
                                rollback_targets=h.c.target_continuity,
                                monotonic=lambda: h.now, sleep=h.sleep, seconds=2)
                        with patch.object(os, 'replace', replace), self.assertRaises(lifecycle.Interrupted):
                            fresh().reconcile_partial()
                        self.assertTrue(fired)
                        count = len(h.sdk.updates)
                        fresh().reconcile_partial()
                        self.assertEqual(runtime.load(), owner)
                        self.assertEqual(len(h.sdk.updates), count)

    def interrupted(self, phase, after=False):
        h = Harness()
        h.c.cutover()
        h.data = 'latest-managed-write-not-original-bytes'
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
        self.assertTrue(fired)
        h.c.mutate = original
        # Model the canonical loader after a direct completion of publication.
        def load():
            value = h.files.read('ownership.json')
            if value.get('state') != 'active':
                raise lifecycle.Rejected('ownership-fenced')
            return value
        h.runtime.load = load
        def freshness(expected, *, deadline=None):
            if h.data != h.copied.get('rollback'):
                return [dict(row, digest='f' * 64) for row in expected]
            return copy.deepcopy(expected)
        h.c.source_freshness = freshness
        return h

    def unchanged_after_rejection(self, h, reason):
        calls, copies, updates = list(h.calls), list(h.copies), len(h.sdk.updates)
        journal = h.files.read('lifecycle.json')
        with self.assertRaisesRegex(lifecycle.Rejected, reason):
            h.c.reconcile_partial()
        self.assertEqual(h.calls, calls)
        self.assertEqual(h.copies, copies)
        self.assertEqual(len(h.sdk.updates), updates)
        self.assertEqual(h.files.read('lifecycle.json'), journal)
        self.assertTrue(h.files.exists('managed'))

    def test_resume_every_verified_rebind_restart_and_publication_fault_without_recopy(self):
        phases = ['rebind-' + r for r in lifecycle.ROLES] + [
            'write-swarm-source', 'write-disabled-receipt',
            *['resume-' + r for r in lifecycle.ROLES], 'publish-swarm']
        for phase in phases:
            for after in (False, True):
                with self.subTest(phase=phase, after=after):
                    h = self.interrupted(phase, after)
                    count = len(h.sdk.updates)
                    self.assertEqual(h.c.reconcile_partial()['runtime'], 'swarm')
                    self.assertEqual(h.copies, ['cutover', 'rollback'])
                    self.assertEqual(h.copied['rollback'], 'latest-managed-write-not-original-bytes')
                    self.assertFalse(h.enabled)
                    self.assertEqual(h.files.read('ownership.json')['generation'], 3)
                    self.assertEqual(h.files.read('managed')['generation'], 3)
                    for spec in h.sdk.updates[count:]:
                        self.assertTrue(spec['TaskTemplate']['ContainerSpec']['Mounts'][0]['Source'].startswith('kan140_rollback_'))
                    # Re-reading a finished publication does not republish/restart.
                    updates, calls = len(h.sdk.updates), list(h.calls)
                    h.c.reconcile_partial()
                    self.assertEqual(len(h.sdk.updates), updates)
                    self.assertEqual(h.calls, calls)

    def test_copy_timeout_even_after_data_was_copied_is_not_accepted_without_durable_proof(self):
        for after in (False, True):
            h = self.interrupted('transfer-rollback', after)
            self.unchanged_after_rejection(h, 'rollback-copy-unproven')

    def test_half_publication_completes_only_exact_recorded_owner(self):
        h = self.interrupted('publish-swarm')
        planned = h.files.read('lifecycle.json')['rollback_publication']
        h.files.values['managed'] = {'schema': 1, 'generation': 3}
        updates = len(h.sdk.updates)
        h.c.reconcile_partial()
        self.assertEqual(h.files.read('ownership.json'), planned)
        self.assertEqual(len(h.sdk.updates), updates)
        self.assertNotIn('publish-swarm-done', h.files.events)
        self.assertIn('complete-publish-swarm-done', h.files.events)

    def test_half_publication_without_owner_intent_cannot_be_inferred(self):
        h = self.interrupted('publish-swarm')
        h.files.values['managed'] = {'schema': 1, 'generation': 3}
        del h.files.values['lifecycle.json']['rollback_publication']
        self.unchanged_after_rejection(h, 'rollback-publication-unproven')

    def test_conflicting_publication_intent_blocks_before_rebind_at_every_generation(self):
        for generation in (1, 2):
            h = self.interrupted('rebind-redis')
            h.files.values['managed']['generation'] = generation
            h.files.values['lifecycle.json']['rollback_publication'] = {'foreign': True}
            self.unchanged_after_rejection(h, 'rollback-publication-drift')

    def test_stopped_again_managed_writer_cannot_make_old_copy_authoritative(self):
        h = self.interrupted('rebind-redis')
        # Container state is quiescent now, but newer managed bytes exist.
        h.data = 'new-write-after-copy-and-after-writer-stopped-again'
        self.unchanged_after_rejection(h, 'rollback-source-diverged')

    def test_recreated_rollback_target_blocks_even_when_managed_source_still_matches_copy(self):
        h = self.interrupted('rebind-redis')
        h.rollback_epoch += 1  # Replacement data/volume at the same canonical name.
        self.unchanged_after_rejection(h, 'rollback-target-replaced')

    def test_old_journal_without_target_pin_or_checker_is_not_backfilled(self):
        h = self.interrupted('rebind-redis')
        del h.files.values['lifecycle.json']['rollback_targets']
        self.unchanged_after_rejection(h, 'rollback-targets-unproven')
        h = self.interrupted('rebind-redis')
        h.c.target_continuity = None
        self.unchanged_after_rejection(h, 'rollback-target-proof-unavailable')

    def test_interruption_between_copy_and_target_pin_cannot_infer_continuity(self):
        h = Harness()
        h.c.cutover()
        def interrupted(expected, **kwargs):
            raise lifecycle.Interrupted()
        h.c.target_continuity.capture = interrupted
        with self.assertRaises(lifecycle.Interrupted):
            h.c.recover()
        self.assertIn('rollback_copy', h.files.read('lifecycle.json'))
        self.assertNotIn('rollback_targets', h.files.read('lifecycle.json'))
        self.unchanged_after_rejection(h, 'rollback-targets-unproven')

    def test_missing_or_truthy_freshness_is_not_accepted_as_content_proof(self):
        for callback in (None, lambda expected, **kw: True):
            h = self.interrupted('rebind-redis')
            h.c.source_freshness = callback
            self.unchanged_after_rejection(h, 'rollback-freshness-unavailable|rollback-copy-unproven')

    def test_managed_source_change_during_resume_is_rejected_before_publication(self):
        h = self.interrupted('rebind-redis')
        original = h.sdk._post_json
        def changed(url, params, data):
            result = original(url, params, data)
            if data['Mode']['Replicated']['Replicas'] == 1:
                h.data = 'new-managed-write-not-in-rollback'
            return result
        h.sdk._post_json = changed
        with self.assertRaisesRegex(lifecycle.Rejected, 'rollback-source-diverged'):
            h.c.reconcile_partial()
        self.assertEqual(h.files.read('ownership.json')['state'], 'recovering')
        self.assertNotIn('publish-swarm-done', h.files.events)

    def test_foreign_partial_source_or_owner_never_overwritten(self):
        for filename, value in [('swarm.json', {'foreign': True}),
                                ('compose-disabled.json', {'foreign': True}),
                                ('ownership.json', {'schema': 1, 'state': 'active', 'generation': 99}),
                                ('managed', {'schema': 1, 'generation': 99})]:
            h = self.interrupted('rebind-redis')
            h.files.values[filename] = value
            self.unchanged_after_rejection(h, 'drift')
            self.assertEqual(h.files.read(filename), value)

    def test_missing_gates_and_wrong_data_authority_block_all_writes(self):
        h = self.interrupted('rebind-redis')
        h.c.gates = lambda: lifecycle.REQUIRED_GATES - {'exclusive-daemon'}
        self.unchanged_after_rejection(h, 'external-gates-unproven')
        h.c.gates = lambda: lifecycle.REQUIRED_GATES
        h.files.values['lifecycle.json']['data_authority'] = 'legacy'
        self.unchanged_after_rejection(h, 'partial-recovery-unproven')

    def test_boolean_schema_or_generation_does_not_match_numeric_fence(self):
        for filename, value in [('managed', {'schema': True, 'generation': 2}),
                                ('managed', {'schema': 1, 'generation': True}),
                                ('ownership.json', {'schema': True, 'state': 'recovering', 'generation': 3})]:
            h = self.interrupted('rebind-redis')
            h.files.values[filename] = value
            self.unchanged_after_rejection(h, 'rollback-owner-drift')

    def test_foreign_writer_on_return_volume_is_rejected_before_any_rebind(self):
        h = self.interrupted('rebind-redis')
        h.sdk.items['0' * 64] = container('postgres', '0' * 64, 'foreign', {},
                                        h.runtime.SWARM_VOLUMES['postgres'])
        self.unchanged_after_rejection(h, 'partial-rollback-foreign-writer')

    def test_managed_writer_returned_after_copy_blocks_stale_snapshot_resume(self):
        h = self.interrupted('rebind-redis')
        item = next(c for c in h.sdk.items.values()
                    if c['Config']['Labels'].get('com.docker.compose.project') == lifecycle.PROJECT)
        item['State']['Running'] = True
        self.unchanged_after_rejection(h, 'writer-not-quiescent')

    def test_new_fault_during_reconciliation_keeps_exact_intent_for_next_explicit_reconcile(self):
        h = self.interrupted('rebind-redis')
        original = h.sdk._post_json
        fired = []
        def ambiguous(url, params, data):
            result = original(url, params, data)
            if not fired:
                fired.append(True)
                raise lifecycle.Interrupted()
            return result
        h.sdk._post_json = ambiguous
        with self.assertRaises(lifecycle.Interrupted):
            h.c.reconcile_partial()
        h.sdk._post_json = original
        self.assertTrue(h.files.events[-1].endswith('-intent'))
        h.c.reconcile_partial()
        self.assertEqual(h.copies, ['cutover', 'rollback'])


if __name__ == '__main__':
    unittest.main()
