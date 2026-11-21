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
        with r.mutation_scope():
            self.active.mutate_app(True, 'a' * 64)
        self.assertEqual(self.executor.run.call_args.args[0], ['docker', 'start', 'a' * 64])

    def test_replaced_id_refuses_mutation(self):
        self.executor.run.side_effect = ['', '', 'a' * 64]
        with r.mutation_scope(), self.assertRaises(r.OwnershipError):
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
