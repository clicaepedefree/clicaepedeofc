"""Offline staging tests: no Docker process, host secrets, or lifecycle calls."""
import base64
import copy
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import stat
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

import managed_cutover as cutover


class FakePath:
    """Small POSIX filesystem double, independent of host uid and permissions."""

    def __init__(self, fs, name):
        self.fs = fs
        self.name = PurePosixPath(name)

    def __str__(self):
        return str(self.name)

    def __fspath__(self):
        return str(self)

    def __eq__(self, other):
        return isinstance(other, FakePath) and self.fs is other.fs and self.name == other.name

    def __truediv__(self, name):
        return FakePath(self.fs, self.name / name)

    @property
    def parent(self):
        return FakePath(self.fs, self.name.parent)

    @property
    def parents(self):
        return tuple(FakePath(self.fs, name) for name in self.name.parents)

    def resolve(self, strict=False):
        if strict and str(self) not in self.fs.nodes:
            raise FileNotFoundError(str(self))
        return self.fs.aliases.get(str(self), self)

    def mkdir(self, mode, exist_ok):
        if str(self) not in self.fs.nodes:
            if str(self.parent) not in self.fs.nodes:
                raise FileNotFoundError(str(self.parent))
            self.fs.put(self, None, mode)

    def lstat(self):
        return SimpleNamespace(**self.fs.nodes[str(self)]['metadata'])

    stat = lstat

    def read_bytes(self):
        return self.fs.nodes[str(self)]['value']


class FakeFiles:
    def __init__(self):
        self.nodes = {}
        self.aliases = {}
        self.fds = {}

    def path(self, name):
        return FakePath(self, name)

    def put(self, path, value, mode=0o600, **metadata):
        info = dict(st_mode=(stat.S_IFDIR if value is None else stat.S_IFREG) | mode,
                    st_uid=0, st_nlink=1, st_size=len(value or b''))
        info.update(metadata)
        self.nodes[str(path)] = {'value': value, 'metadata': info}

    def open(self, path, flags, mode=0o600):
        if flags & os.O_CREAT:
            if str(path) in self.nodes and flags & os.O_EXCL:
                raise FileExistsError(str(path))
            if str(path.parent) not in self.nodes:
                raise FileNotFoundError(str(path.parent))
            self.put(path, b'', mode)
        if str(path) not in self.nodes:
            raise FileNotFoundError(str(path))
        fd = len(self.fds) + 10
        self.fds[fd] = path
        return fd

    def fdopen(self, fd, mode):
        fs, path = self, self.fds[fd]

        class Stream(io.BytesIO):
            def fileno(self):
                return fd

            def close(self):
                if not self.closed and mode == 'wb':
                    value = self.getvalue()
                    fs.nodes[str(path)]['value'] = value
                    fs.nodes[str(path)]['metadata']['st_size'] = len(value)
                super().close()

        return Stream(path.read_bytes() if mode == 'rb' else b'')

    def fchmod(self, fd, mode):
        self.nodes[str(self.fds[fd])]['metadata']['st_mode'] = stat.S_IFREG | mode


class ManagedCutoverTests(unittest.TestCase):
    def patched(self, target, **kwargs):
        patcher = patch(target, **kwargs)
        value = patcher.start()
        self.addCleanup(patcher.stop)
        return value

    def setUp(self):
        self.fs = FakeFiles()
        self.root = self.fs.path('/private/kan140')
        self.stack = self.fs.path('/private/stack.yaml')
        self.originals = self.fs.path('/private/originals')
        for path in (self.root.parent, *self.root.parent.parents):
            self.fs.put(path, None, 0o755)
        self.fs.put(self.originals, None, 0o700)
        self.raw = b'offline planner fixture\r\n'
        self.fs.put(self.stack, self.raw)
        self.patched('managed_cutover.ROOT', new=self.root)
        self.patched('managed_cutover.STACK', new=self.stack)
        self.patched('managed_cutover.ORIGINALS', new=self.originals)
        # Supply absent POSIX flags only to the fake OS, never to a real open().
        for flag, value in (('O_NOFOLLOW', 0x10000000), ('O_DIRECTORY', 0x20000000),
                            ('O_NONBLOCK', 0x40000000)):
            self.patched('managed_cutover.os.' + flag,
                         new=getattr(os, flag, value), create=True)
        self.open = self.patched('managed_cutover.os.open', side_effect=self.fs.open)
        self.patched('managed_cutover.os.fdopen', side_effect=self.fs.fdopen)
        self.patched('managed_cutover.os.fstat',
                     side_effect=lambda fd: self.fs.fds[fd].stat())
        self.patched('managed_cutover.os.fchmod', side_effect=self.fs.fchmod, create=True)
        self.sync = self.patched('managed_cutover.os.fsync')
        self.patched('managed_cutover.os.close')
        self.patched('managed_cutover.os.path.lexists',
                     side_effect=lambda path: str(path) in self.fs.nodes)
        self.process = self.patched('managed_cutover.subprocess.run',
                                    side_effect=AssertionError('Live processes forbidden'))
        self.compose = {'services': {
            role: {'image': role + '@sha256:' + str(index) * 64}
            for index, role in enumerate(cutover.ROLES, 1)}}
        self.plan = self.patched('managed_cutover.compose_plan.build_plan',
                                 return_value={'compose': self.compose})
        self.services = {}
        self.responses = {}
        self.configs = {}
        versioned = Path(__file__).resolve().parent.parent / 'kan132'
        for role in cutover.ROLES:
            references = []
            for target in sorted(cutover.CONFIG_ROLES[role]):
                filename = cutover.CONFIG_TARGETS[target]
                value = (versioned / filename).read_bytes().replace(b'\r\n', b'\n')
                self.assertEqual(hashlib.sha256(value).hexdigest(), cutover.CONFIG_PINS[filename])
                self.configs[filename] = value
                references.append({'ConfigID': filename, 'File': {'Name': target}})
                self.responses[('config', 'inspect', filename)] = [
                    {'ID': filename, 'Spec': {'Data': base64.b64encode(value).decode()}}]
            service = {'ID': 'service-' + role, 'Spec': {
                'Name': 'clica-evolution-qa_' + role,
                'Mode': {'Replicated': {'Replicas': 1}},
                'TaskTemplate': {'ContainerSpec': {
                    'Image': self.compose['services'][role]['image'], 'Configs': references,
                    'Mounts': [{'Type': 'volume', 'Source': cutover.OLD_VOLUMES[role],
                                'Target': cutover.DESTINATIONS[role]}]}}}}
            self.services[role] = service
            self.responses[('service', 'inspect', service['Spec']['Name'])] = [service]
            self.responses[('inspect', 'container-' + role)] = [
                {'State': {'Health': {'Status': 'healthy'}}}]
        self.secrets = {}
        self.exec_outputs = {}
        for name, filename in cutover.compose_plan.SECRET_FILES.items():
            value = ('synthetic-test-only-' + name + '\n').encode()
            self.secrets[filename] = value
            self.fs.put(self.originals / filename, value)
            role = 'postgres' if name == 'pg_admin_password' else 'evolution'
            self.exec_outputs[('exec', 'container-' + role, 'cat', '/run/secrets/' + name)] = value
        self.docker = Mock(spec=cutover.Docker)
        self.docker.data.side_effect = self.docker_data
        self.docker.run.side_effect = self.docker_run

    def docker_data(self, *args):
        # Exact read-only allowlist: any lifecycle/mutation command fails the test.
        if args not in self.responses:
            self.fail('Unexpected Docker data command: ' + repr(args))
        return copy.deepcopy(self.responses[args])

    def docker_run(self, *args):
        if args in self.exec_outputs:
            return SimpleNamespace(stdout=self.exec_outputs[args])
        for role, service in self.services.items():
            if args == ('ps', '-q', '--no-trunc', '--filter',
                        'label=com.docker.swarm.service.id=' + service['ID']):
                return SimpleNamespace(stdout=('container-' + role + '\n').encode())
        self.fail('Unexpected Docker run command: ' + repr(args))

    def container(self, role):
        return self.services[role]['Spec']['TaskTemplate']['ContainerSpec']

    def assert_no_staged_files(self):
        self.assertFalse(any(name.startswith(str(self.root) + '/') and
                             node['value'] is not None for name, node in self.fs.nodes.items()))

    def tearDown(self):
        self.process.assert_not_called()

    def test_baseline_passes_exact_source_bytes_and_production_pin_to_planner(self):
        for raw in (b'offline fixture\n', b'offline fixture\r\n'):
            with self.subTest(raw=raw):
                self.fs.put(self.stack, raw)
                compose, records = cutover.baseline(self.docker)
                self.plan.assert_called_with(raw, cutover.STACK_SHA, 2)
                self.assertEqual(compose, self.compose)
                self.assertEqual(set(records), set(cutover.ROLES))
                for role in cutover.ROLES:
                    self.assertEqual(records[role], {'service': self.services[role],
                                                     'container_id': 'container-' + role})
        self.plan.side_effect = cutover.compose_plan.PlanError('baseline-drift')
        self.docker.reset_mock()
        with self.assertRaisesRegex(cutover.compose_plan.PlanError, '^baseline-drift$'):
            cutover.baseline(self.docker)
        self.assertEqual(self.docker.mock_calls, [])

    def test_baseline_rejects_service_mount_and_health_drift(self):
        original = copy.deepcopy(self.responses)
        key = ('service', 'inspect', 'clica-evolution-qa_postgres')
        for field, value, code in (
                ('Name', 'other', 'legacy-service-drift'),
                ('Mode', {'Replicated': {'Replicas': 0}}, 'legacy-service-drift'),
                ('Image', 'unapproved:latest', 'legacy-service-drift'),
                ('Mounts', [], 'legacy-volume-drift'),
                ('Mounts', [self.container('postgres')['Mounts'][0]] * 2, 'legacy-volume-drift'),
                ('Mounts', [{'Type': 'bind', 'Source': '/tmp', 'Target': '/data'}], 'legacy-volume-drift'),
                ('Mounts', [dict(self.container('postgres')['Mounts'][0], ReadOnly=True)], 'legacy-volume-drift'),
                ('Mounts', [dict(self.container('postgres')['Mounts'][0], Source='other')], 'legacy-volume-drift'),
                ('Mounts', [dict(self.container('postgres')['Mounts'][0], Target='/other')], 'legacy-volume-drift'),
                ('services', [], 'legacy-service-count'),
                ('health', 'unhealthy', 'legacy-unhealthy')):
            with self.subTest(field=field, value=value):
                self.responses = copy.deepcopy(original)
                spec = self.responses[key][0]['Spec']
                if field == 'services':
                    self.responses[key] = value
                elif field == 'health':
                    self.responses[('inspect', 'container-postgres')][0]['State']['Health']['Status'] = value
                elif field in ('Image', 'Mounts'):
                    spec['TaskTemplate']['ContainerSpec'][field] = value
                else:
                    spec[field] = value
                with self.assertRaisesRegex(cutover.Rejected, '^' + code + '$'):
                    cutover.stage_mounts(self.docker)
                self.assert_no_staged_files()

    def test_stage_copies_four_configs_four_secrets_and_hashes_exact_bytes(self):
        self.assertEqual(len(self.configs), 4)
        self.assertEqual(len(self.secrets), 4)
        for filename, value in self.configs.items():
            # Approved LF pins accept CRLF transport, but staged hashes bind raw bytes.
            value = value.replace(b'\n', b'\r\n')
            self.configs[filename] = value
            self.responses[('config', 'inspect', filename)][0]['Spec']['Data'] = base64.b64encode(value).decode()
        result = cutover.stage_mounts(self.docker)
        expected_hashes = {}
        for folder, values in (('configs', self.configs), ('mount-secrets', self.secrets)):
            for filename, value in values.items():
                path = self.root / folder / filename
                self.assertEqual(path.read_bytes(), value)
                self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o444)
                expected_hashes[str(path)] = hashlib.sha256(value).hexdigest()
        self.assertEqual(result['mount_hashes'], expected_hashes)
        raw = json.dumps(self.compose, sort_keys=True, separators=(',', ':')).encode()
        self.assertEqual((self.root / 'compose.json').read_bytes(), raw)
        self.assertEqual(result['source_sha256'], hashlib.sha256(raw).hexdigest())
        self.assertEqual((result['schema'], result['generation']), (1, 2))
        self.assertFalse(result['services_restarted'])
        self.assertFalse(result['ownership_published'])
        self.assertNotIn(str(self.root / 'managed'), self.fs.nodes)
        self.assertNotIn(str(self.root / 'ownership.json'), self.fs.nodes)
        self.assertEqual(self.docker.run.call_count, 7)
        for name, filename in cutover.compose_plan.SECRET_FILES.items():
            role = 'postgres' if name == 'pg_admin_password' else 'evolution'
            self.docker.run.assert_any_call('exec', 'container-' + role, 'cat', '/run/secrets/' + name)
            self.assertEqual((self.originals / filename).read_bytes(), self.secrets[filename])

    def test_config_role_gate_rejects_missing_duplicate_unknown_and_all_on_evolution(self):
        original = copy.deepcopy(self.services)
        for case in ('missing', 'duplicate', 'unknown', 'all-on-evolution'):
            with self.subTest(case=case):
                for role in cutover.ROLES:
                    self.services[role].clear()
                    self.services[role].update(copy.deepcopy(original[role]))
                if case == 'all-on-evolution':
                    references = [ref for role in cutover.ROLES for ref in self.container(role)['Configs']]
                    for role in cutover.ROLES:
                        self.container(role)['Configs'] = references if role == 'evolution' else []
                elif case == 'missing':
                    self.container('evolution')['Configs'].pop()
                elif case == 'duplicate':
                    refs = self.container('evolution')['Configs']
                    refs[1] = copy.deepcopy(refs[0])
                else:
                    self.container('evolution')['Configs'][1]['File']['Name'] = '/unexpected'
                with self.assertRaisesRegex(cutover.Rejected, '^config-role-drift$'):
                    cutover.stage_mounts(self.docker)
                self.assert_no_staged_files()

    def test_each_unapproved_config_is_rejected_before_any_config_write(self):
        for filename, value in self.configs.items():
            with self.subTest(filename=filename):
                record = self.responses[('config', 'inspect', filename)][0]
                approved = record['Spec']['Data']
                record['Spec']['Data'] = base64.b64encode(value + b'\n// unapproved\n').decode()
                with self.assertRaisesRegex(cutover.Rejected, '^unapproved-config-source$'):
                    cutover.stage_mounts(self.docker)
                self.assert_no_staged_files()
                record['Spec']['Data'] = approved

    def test_config_identity_and_invalid_encoding_fail_before_writes(self):
        key = ('config', 'inspect', 'start-redacted.cjs')
        original = copy.deepcopy(self.responses[key])
        for response, error in (([], cutover.Rejected),
                                ([dict(original[0], ID='other')], cutover.Rejected),
                                ([{'ID': key[-1], 'Spec': {'Data': '%%%'}}], ValueError)):
            with self.subTest(response=response):
                self.responses[key] = response
                with self.assertRaises(error):
                    cutover.stage_mounts(self.docker)
                self.assert_no_staged_files()

    def test_each_secret_mismatch_rejected_without_publishing_compose(self):
        original = dict(self.exec_outputs)
        for command in original:
            with self.subTest(secret=command[-1]):
                self.exec_outputs = dict(original)
                self.exec_outputs[command] = b'synthetic-wrong-value'
                with self.assertRaisesRegex(cutover.Rejected, '^secret-copy-mismatch$'):
                    cutover.stage_mounts(self.docker)
                self.assertNotIn(str(self.root / 'compose.json'), self.fs.nodes)

    def test_restage_reuses_identical_content_and_rejects_each_changed_file(self):
        first = cutover.stage_mounts(self.docker)
        snapshot = copy.deepcopy(self.fs.nodes)
        self.open.reset_mock()
        self.assertEqual(cutover.stage_mounts(self.docker), first)
        self.assertFalse(any(call.args[1] & os.O_CREAT for call in self.open.call_args_list))
        self.assertEqual(self.fs.nodes, snapshot)
        paths = list(first['mount_hashes']) + [str(self.root / 'compose.json')]
        for name in paths:
            with self.subTest(path=name):
                self.fs.nodes = copy.deepcopy(snapshot)
                self.fs.nodes[name]['value'] += b'drift'
                before = copy.deepcopy(self.fs.nodes)
                with self.assertRaisesRegex(cutover.Rejected, '^staged-file-drift$'):
                    cutover.stage_mounts(self.docker)
                self.assertEqual(self.fs.nodes, before)

    def test_managed_markers_reject_before_reading_source_or_docker(self):
        for marker in ('managed', 'ownership.json'):
            with self.subTest(marker=marker):
                path = self.root / marker
                self.fs.put(path, b'marker')
                with self.assertRaisesRegex(cutover.Rejected, '^already-managed$'):
                    cutover.stage_mounts(self.docker)
                self.plan.assert_not_called()
                self.assertEqual(self.docker.mock_calls, [])
                del self.fs.nodes[str(path)]

    def test_directory_enforces_resolution_root_ownership_and_private_modes(self):
        cutover.directory(self.root)
        snapshot = copy.deepcopy(self.fs.nodes)
        cases = ((self.root, 'st_uid', 1000, 'private-parent'),
                 (self.root.parent, 'st_mode', stat.S_IFDIR | 0o777, 'private-parent'),
                 (self.root, 'st_mode', stat.S_IFREG | 0o700, 'private-parent'),
                 (self.root, 'st_mode', stat.S_IFDIR | 0o755, 'private-directory'))
        for path, field, value, code in cases:
            with self.subTest(path=str(path), field=field, value=value):
                self.fs.nodes = copy.deepcopy(snapshot)
                self.fs.nodes[str(path)]['metadata'][field] = value
                with self.assertRaisesRegex(cutover.Rejected, '^' + code + '$'):
                    cutover.directory(self.root)
        self.fs.nodes = snapshot
        self.fs.aliases[str(self.root)] = self.root.parent
        with self.assertRaisesRegex(cutover.Rejected, '^private-path$'):
            cutover.directory(self.root)

    def test_read_private_enforces_regular_single_link_root_owned_bounded_files(self):
        self.assertEqual(cutover.read_private(self.stack), self.raw)
        original = copy.deepcopy(self.fs.nodes[str(self.stack)])
        for field, value in (('st_uid', 1000), ('st_nlink', 2), ('st_size', 1024 * 1024 + 1),
                             ('st_mode', stat.S_IFREG | 0o644),
                             ('st_mode', stat.S_IFLNK | 0o600), ('st_mode', stat.S_IFIFO | 0o600)):
            with self.subTest(field=field, value=value):
                self.fs.nodes[str(self.stack)] = copy.deepcopy(original)
                self.fs.nodes[str(self.stack)]['metadata'][field] = value
                with self.assertRaisesRegex(cutover.Rejected, '^private-file$'):
                    cutover.read_private(self.stack)
        self.fs.nodes[str(self.stack)] = original
        self.fs.aliases[str(self.stack)] = self.originals / 'elsewhere'
        with self.assertRaisesRegex(cutover.Rejected, '^private-file-path$'):
            cutover.read_private(self.stack)

    def test_private_read_rejects_writable_parent_and_changed_size(self):
        node = self.fs.nodes[str(self.stack.parent)]
        previous = node['metadata']['st_mode']
        node['metadata']['st_mode'] = stat.S_IFDIR | 0o777
        with self.assertRaisesRegex(cutover.Rejected, '^private-file-parent$'):
            cutover.read_private(self.stack)
        node['metadata']['st_mode'] = previous
        self.fs.nodes[str(self.stack)]['value'] += b'changed-after-stat'
        with self.assertRaisesRegex(cutover.Rejected, '^private-file-drift$'):
            cutover.read_private(self.stack)

    def test_private_read_rejects_inode_or_same_size_content_change(self):
        for field in ('st_ino', 'st_ctime_ns'):
            before = self.stack.lstat()
            setattr(before, field, 10)
            after = SimpleNamespace(**vars(before))
            setattr(after, field, 11)
            with self.subTest(field=field), patch.object(cutover.os, 'fstat', side_effect=[before, after]):
                with self.assertRaisesRegex(cutover.Rejected, '^private-file-drift$'):
                    cutover.read_private(self.stack)

    def test_write_new_is_exclusive_durable_bounded_and_never_repairs_drift(self):
        cutover.directory(self.root)
        path = self.root / 'new'
        for value in (b'', 'not-bytes', b'x' * (1024 * 1024 + 1)):
            with self.subTest(size=len(value)):
                with self.assertRaisesRegex(cutover.Rejected, '^private-write-size$'):
                    cutover.write_new(path, value)
        self.open.assert_not_called()
        for mode in (0o600, 0o444):
            with self.subTest(mode=mode):
                self.fs.nodes.pop(str(path), None)
                self.open.reset_mock()
                self.sync.reset_mock()
                cutover.write_new(path, b'fixture', mode)
                self.assertEqual(path.read_bytes(), b'fixture')
                self.assertEqual(stat.S_IMODE(path.stat().st_mode), mode)
                flags = self.open.call_args_list[0].args[1]
                self.assertEqual(flags, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW)
                self.assertEqual(self.open.call_args_list[1].args,
                                 (path.parent, os.O_RDONLY | os.O_DIRECTORY))
                self.assertEqual(self.sync.call_count, 2)
                self.open.reset_mock()
                cutover.write_new(path, b'fixture', mode)
                self.open.assert_not_called()
                original = copy.deepcopy(self.fs.nodes[str(path)])
                for field, value in (('st_uid', 1000), ('st_nlink', 2),
                                     ('st_mode', stat.S_IFREG | 0o666),
                                     ('st_mode', stat.S_IFDIR | mode)):
                    with self.subTest(field=field, value=value):
                        self.fs.nodes[str(path)] = copy.deepcopy(original)
                        self.fs.nodes[str(path)]['metadata'][field] = value
                        before = copy.deepcopy(self.fs.nodes)
                        with self.assertRaisesRegex(cutover.Rejected, '^staged-file-drift$'):
                            cutover.write_new(path, b'fixture', mode)
                        self.assertEqual(self.fs.nodes, before)
                self.fs.nodes[str(path)] = original
                self.fs.aliases[str(path)] = self.stack
                with self.assertRaisesRegex(cutover.Rejected, '^staged-file-drift$'):
                    cutover.write_new(path, b'fixture', mode)
                self.fs.aliases.clear()


if __name__ == '__main__':
    unittest.main()
