"""Offline unit contracts only: never contact Docker or create native fixtures."""
import io
import json
from pathlib import Path
import subprocess
import sys
import tarfile
import threading
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import volume_transfer as vt


def archive(payload=b'private-content', *, uid=999, gid=999, mode=0o600,
            name='./private-name', kind=tarfile.REGTYPE):
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode='w', format=tarfile.GNU_FORMAT) as tar:
        root = tarfile.TarInfo('.')
        root.type, root.mode, root.uid, root.gid = tarfile.DIRTYPE, 0o700, uid, gid
        tar.addfile(root)
        file = tarfile.TarInfo(name)
        file.type, file.mode, file.uid, file.gid = kind, mode, uid, gid
        file.size = len(payload) if kind == tarfile.REGTYPE else 0
        file.linkname = 'private-link' if kind in (tarfile.SYMTYPE, tarfile.LNKTYPE) else ''
        tar.addfile(file, io.BytesIO(payload) if file.size else None)
    return output.getvalue()


class FakeDocker:
    def __init__(self):
        self.calls, self.helpers, self.writers = [], {}, {}
        self.volumes = {'fixture_source': archive()}
        self.labels = {}
        self.corrupt = False
        self.helper_exit = 0
        self.hook = None

    def execute(self, args, deadline, consumer=None):
        args = tuple(args)
        self.calls.append(args)
        if self.hook:
            self.hook(args)
        vt.require(time.monotonic() < deadline, 'docker-deadline')
        if args[:3] == ('volume', 'ls', '--quiet'):
            return '\n'.join(self.volumes).encode()
        if args[:2] == ('volume', 'inspect'):
            return json.dumps([{'Name': args[2], 'Driver': 'local', 'Options': {},
                                'Scope': 'local', 'Labels': self.labels.get(args[2], {})}]).encode()
        if args[:2] == ('volume', 'create'):
            name = args[-1]
            self.volumes[name] = b''
            self.labels[name] = dict(args[i + 1].split('=', 1)
                                     for i, value in enumerate(args) if value == '--label')
            return name.encode()
        if args[:2] == ('container', 'ls'):
            return '\n'.join(self.writers).encode()
        if args[:2] == ('container', 'inspect'):
            name = args[2]
            if name in self.writers:
                return json.dumps([self.writers[name]]).encode()
            helper = self.helpers[name]
            return json.dumps([{'Name': '/' + name, 'Config': {'Labels': helper['labels']},
                                'State': {'Running': False, 'Restarting': False,
                                          'OOMKilled': False, 'ExitCode': self.helper_exit,
                                          'Error': ''}}]).encode()
        if args[:2] == ('container', 'create'):
            name = args[args.index('--name') + 1]
            mounts = [dict(p.split('=', 1) if '=' in p else (p, True)
                           for p in args[i + 1].split(','))
                      for i, arg in enumerate(args) if arg == '--mount']
            self.helpers[name] = {
                'source': mounts[0]['source'],
                'target': mounts[1]['source'] if len(mounts) == 2 else None,
                'labels': dict(args[i + 1].split('=', 1)
                               for i, value in enumerate(args) if value == '--label'),
            }
            return b'helper-id'
        if args[:3] == ('container', 'start', '--attach'):
            helper = self.helpers[args[3]]
            if consumer:
                return consumer(io.BytesIO(self.volumes[helper['source']]))
            self.volumes[helper['target']] = (archive(b'changed') if self.corrupt else
                                             self.volumes[helper['source']])
            return b''
        if args[:3] == ('container', 'rm', '--force'):
            del self.helpers[args[3]]
            return b''
        raise AssertionError('unexpected-fake-command')

    def writer(self, *, source='fixture_source', running=False, restarting=False,
               restart='no', rw=True):
        cid = 'a' * 64
        self.writers[cid] = {
            'Id': cid, 'Mounts': [{'Type': 'volume', 'Name': source, 'RW': rw}],
            'State': {'Running': running, 'Restarting': restarting},
            'HostConfig': {'RestartPolicy': {'Name': restart}},
        }


def transfer(fake, **kwargs):
    return vt.OfflineVolumeTransfer(fake, {'cutover': [('fixture_source', 'fixture_target')]}, **kwargs)


class ManifestTests(unittest.TestCase):
    def manifest(self, data, **kwargs):
        return vt.tar_manifest(io.BytesIO(data), time.monotonic() + 2, **kwargs)

    def test_metadata_only_and_byte_uid_gid_mode_directory_sensitive(self):
        baseline = self.manifest(archive())
        self.assertEqual(set(baseline), {'digest', 'entries', 'bytes'})
        self.assertEqual(baseline['entries'], 2)
        self.assertEqual(baseline['bytes'], len(b'private-content'))
        self.assertNotIn('private', repr(baseline))
        for options in ({'payload': b'other'}, {'uid': 10}, {'gid': 10}, {'mode': 0o644}):
            self.assertNotEqual(self.manifest(archive(**options)), baseline)
        # Root directory metadata is also hashed (not just regular files).
        root_only = io.BytesIO()
        with tarfile.open(fileobj=root_only, mode='w') as tar:
            root = tarfile.TarInfo('.')
            root.type, root.mode = tarfile.DIRTYPE, 0o755
            tar.addfile(root)
        self.assertEqual(self.manifest(root_only.getvalue())['entries'], 1)

    def test_directory_metadata_and_order_are_in_digest(self):
        def directories(mode, reverse=False):
            output = io.BytesIO()
            with tarfile.open(fileobj=output, mode='w', format=tarfile.GNU_FORMAT) as tar:
                for name in (('./subdir', '.') if reverse else ('.', './subdir')):
                    entry = tarfile.TarInfo(name)
                    entry.type, entry.mode = tarfile.DIRTYPE, mode
                    tar.addfile(entry)
            return output.getvalue()
        baseline = self.manifest(directories(0o700))
        self.assertEqual(baseline, self.manifest(directories(0o700, True)))
        self.assertNotEqual(baseline, self.manifest(directories(0o755)))

    def test_oversized_extension_header_rejected_before_payload_read(self):
        header = tarfile.TarInfo('./private-extension')
        header.type, header.size = tarfile.GNUTYPE_LONGNAME, vt.MAX_BYTES
        # No payload is needed: reject the header before tarfile reads its body.
        with self.assertRaisesRegex(vt.TransferError, '^manifest-type$'):
            self.manifest(header.tobuf(format=tarfile.GNU_FORMAT))

    def test_links_special_paths_and_extensions_fail_without_names(self):
        for kind in (tarfile.SYMTYPE, tarfile.LNKTYPE, tarfile.FIFOTYPE,
                     tarfile.CHRTYPE, tarfile.GNUTYPE_SPARSE):
            with self.subTest(kind=kind), self.assertRaises(vt.TransferError) as error:
                self.manifest(archive(kind=kind))
            self.assertNotIn('private', str(error.exception))
        for name in ('/private-name', './a/../private-name', './a//private-name',
                     './' + 'x' * 200, '.'):
            with self.subTest(name=name), self.assertRaises(vt.TransferError):
                self.manifest(archive(name=name))

    def test_limits_truncation_deadline_and_no_extraction(self):
        for options in ({'max_bytes': 1}, {'max_entries': 1}):
            with self.assertRaises(vt.TransferError):
                self.manifest(archive(), **options)
        with self.assertRaises(vt.TransferError):
            self.manifest(archive(b'x' * 20000)[:11000])
        with self.assertRaisesRegex(vt.TransferError, 'deadline'):
            vt.tar_manifest(io.BytesIO(archive()), time.monotonic() - 1)
        with patch.object(tarfile.TarFile, 'extract', side_effect=AssertionError), \
                patch.object(tarfile.TarFile, 'extractall', side_effect=AssertionError):
            self.manifest(archive())
        with patch.object(vt, 'MAX_WIRE', 100):
            with self.assertRaisesRegex(vt.TransferError, 'wire-limit'):
                self.manifest(archive())


class TransferTests(unittest.TestCase):
    def test_success_is_bounded_metadata_and_hardened_cp_a(self):
        fake = FakeDocker()
        result = transfer(fake).transfer('cutover')
        self.assertEqual(result, (vt.tar_manifest(io.BytesIO(archive()), time.monotonic() + 1),))
        self.assertEqual(fake.volumes['fixture_target'], fake.volumes['fixture_source'])
        self.assertFalse(fake.helpers)
        creates = [c for c in fake.calls if c[:2] == ('container', 'create')]
        self.assertEqual(len(creates), 4)  # pre-source, copy, post-source, destination
        for command in creates:
            self.assertIn(vt.PG_IMAGE, command)
            for flag, value in (('--network', 'none'), ('--pull', 'never'),
                                ('--cap-drop', 'ALL'), ('--restart', 'no'),
                                ('--memory', '256m'), ('--pids-limit', '32')):
                self.assertEqual(command[command.index(flag) + 1], value)
            self.assertIn('--read-only', command)
            self.assertIn('/var/lib/postgresql/data:rw,noexec,nosuid,nodev,size=1m', command)
            self.assertIn('type=volume,source=' +
                          ('fixture_target' if command == creates[-1] else 'fixture_source') +
                          ',target=/source,readonly,volume-nocopy', command)
            self.assertNotIn('/var/run/docker.sock', ' '.join(command))
            self.assertNotIn('--publish', command)
        self.assertIn('cp (GNU coreutils)', creates[1][-1])
        self.assertIn('exec cp -a -- /source/. /target/', creates[1][-1])
        self.assertEqual(set(fake.labels['fixture_target']), {vt.OWNER_LABEL, vt.PHASE_LABEL})
        self.assert_no_volume_deletion(fake)

    def assert_no_volume_deletion(self, fake):
        self.assertFalse(any(c[:2] in (('volume', 'rm'), ('volume', 'prune')) for c in fake.calls))
        self.assertFalse(any(c[:2] in (('container', 'stop'), ('container', 'update'),
                                      ('container', 'restart')) for c in fake.calls))
        self.assertFalse(any('-v' in c for c in fake.calls))

    def test_running_restarting_and_stopped_autorestart_writers_rejected(self):
        for options in ({'running': True}, {'restarting': True}, {'restart': 'always'},
                        {'restart': 'unless-stopped'}, {'restart': 'on-failure'}):
            fake = FakeDocker()
            fake.writer(**options)
            with self.subTest(options=options), self.assertRaisesRegex(vt.TransferError, 'writer'):
                transfer(fake).transfer('cutover')
            self.assertEqual(set(fake.volumes), {'fixture_source'})
            self.assert_no_volume_deletion(fake)

    def test_readonly_running_and_stopped_no_restart_are_allowed(self):
        for options in ({'rw': False, 'running': True, 'restart': 'always'}, {}):
            fake = FakeDocker()
            fake.writer(**options)
            transfer(fake).transfer('cutover')

    def test_writer_recheck_destination_and_all_containers(self):
        fake = FakeDocker()
        def attach(args):
            if args[:2] == ('volume', 'create'):
                fake.writer(source='fixture_target', running=True)
        fake.hook = attach
        with self.assertRaisesRegex(vt.TransferError, 'writer'):
            transfer(fake).transfer('cutover')
        self.assertIn('fixture_target', fake.volumes)
        self.assertFalse(fake.helpers)
        self.assertEqual(sum(c[:3] == ('container', 'start', '--attach') for c in fake.calls), 1)
        self.assert_no_volume_deletion(fake)

    def test_other_pair_writer_blocks_copy_and_stopped_unrelated_is_inspected(self):
        fake = FakeDocker()
        fake.volumes['fixture_other'] = archive()
        operation = vt.OfflineVolumeTransfer(fake, {'cutover': [
            ('fixture_source', 'fixture_target'), ('fixture_other', 'fixture_other_target')]})
        def attach(args):
            if args[:2] == ('volume', 'create'):
                fake.writer(source='fixture_other', restarting=True)
        fake.hook = attach
        with self.assertRaisesRegex(vt.TransferError, 'writer'):
            operation.transfer('cutover')
        self.assertIn(('container', 'inspect', 'a' * 64), fake.calls)
        self.assertEqual(fake.volumes['fixture_target'], b'')
        self.assert_no_volume_deletion(fake)

    def test_shared_deadline_and_late_destination_race_fail_closed(self):
        fake = FakeDocker()
        operation = transfer(fake)
        def expire(args):
            if args[:2] == ('volume', 'create'):
                operation.deadline = time.monotonic() - 1
        fake.hook = expire
        with self.assertRaisesRegex(vt.TransferError, 'deadline'):
            operation.transfer('cutover')
        self.assertIn('fixture_target', fake.volumes)
        self.assert_no_volume_deletion(fake)
        fake = FakeDocker()
        calls = []
        def race(args):
            if args[:2] == ('volume', 'ls'):
                calls.append(args)
                if len(calls) == 2:
                    fake.volumes['fixture_target'] = b'precious'
        fake.hook = race
        with self.assertRaisesRegex(vt.TransferError, 'not-fresh'):
            transfer(fake).transfer('cutover')
        self.assertEqual(fake.volumes['fixture_target'], b'precious')
        self.assertFalse(any(c[:2] == ('volume', 'create') for c in fake.calls))

    def test_container_inventory_and_volume_driver_fail_closed(self):
        fake = FakeDocker()
        fake.writer()
        fake.writers['not-a-container-id'] = fake.writers.pop('a' * 64)
        with self.assertRaisesRegex(vt.TransferError, 'inventory'):
            transfer(fake).transfer('cutover')
        fake = FakeDocker()
        real_execute = fake.execute
        def remote_volume(args, deadline, consumer=None):
            if args[:2] == ('volume', 'inspect'):
                return json.dumps([{'Name': args[2], 'Driver': 'nfs', 'Scope': 'local'}]).encode()
            return real_execute(args, deadline, consumer)
        fake.execute = remote_volume
        with self.assertRaisesRegex(vt.TransferError, 'volume-policy'):
            transfer(fake).transfer('cutover')
        self.assertFalse(fake.helpers)

    def test_reject_preexisting_reuse_and_partial_failure(self):
        fake = FakeDocker()
        fake.volumes['fixture_target'] = b'precious'
        with self.assertRaisesRegex(vt.TransferError, 'not-fresh'):
            transfer(fake).transfer('cutover')
        self.assertEqual(fake.volumes['fixture_target'], b'precious')
        fake = FakeDocker()
        fake.corrupt = True
        operation = transfer(fake)
        with self.assertRaisesRegex(vt.TransferError, 'mismatch'):
            operation.transfer('cutover')
        with self.assertRaisesRegex(vt.TransferError, 'phase'):
            operation.transfer('cutover')
        self.assertIn('fixture_target', fake.volumes)
        self.assertFalse(fake.helpers)
        self.assert_no_volume_deletion(fake)

    def test_source_mutation_detected_and_bad_inspection_fails_closed(self):
        fake = FakeDocker()
        def mutate(args):
            if args[:2] == ('container', 'rm') and 'fixture_target' in fake.volumes:
                fake.volumes['fixture_source'] = archive(b'new private data')
        fake.hook = mutate
        with self.assertRaisesRegex(vt.TransferError, 'mismatch'):
            transfer(fake).transfer('cutover')
        fake = FakeDocker()
        fake.writer()
        del fake.writers['a' * 64]['State']
        with self.assertRaisesRegex(vt.TransferError, '^transfer-inspect-invalid$'):
            transfer(fake).transfer('cutover')

    def test_unowned_volume_reuse_and_cleanup_failure_are_fatal(self):
        fake = FakeDocker()
        def strip_label(args):
            if args[:2] == ('volume', 'inspect') and args[2] == 'fixture_target':
                fake.labels['fixture_target'] = {}
        fake.hook = strip_label
        with self.assertRaisesRegex(vt.TransferError, 'ownership'):
            transfer(fake).transfer('cutover')
        self.assertIn('fixture_target', fake.volumes)
        fake = FakeDocker()
        def cleanup_failure(args):
            if args[:2] == ('container', 'rm'):
                raise RuntimeError('private-diagnostic')
        fake.hook = cleanup_failure
        with self.assertRaisesRegex(vt.TransferError, '^helper-cleanup-failed$'):
            transfer(fake).transfer('cutover')
        self.assert_no_volume_deletion(fake)

    def test_daemon_helper_exit_checked_independently_of_cli_success(self):
        fake = FakeDocker()
        fake.helper_exit = 1
        with self.assertRaisesRegex(vt.TransferError, '^helper-exit$'):
            transfer(fake).transfer('cutover')
        self.assertFalse(fake.helpers)
        self.assertNotIn('fixture_target', fake.volumes)
        self.assert_no_volume_deletion(fake)

    def test_failed_copy_retains_destination_and_legacy_source(self):
        fake = FakeDocker()
        def fail_copy(args):
            if args[:3] == ('container', 'start', '--attach'):
                if fake.helpers[args[3]]['target']:
                    fake.helper_exit = 1
        fake.hook = fail_copy
        with self.assertRaisesRegex(vt.TransferError, '^helper-exit$'):
            transfer(fake).transfer('cutover')
        self.assertEqual(fake.volumes['fixture_source'], archive())
        self.assertIn('fixture_target', fake.volumes)
        self.assertFalse(fake.helpers)
        self.assert_no_volume_deletion(fake)

    def test_cleanup_never_removes_wrong_owner_helper(self):
        fake = FakeDocker()
        def replace_owner(args):
            if args[:3] == ('container', 'start', '--attach'):
                fake.helpers[args[3]]['labels'][vt.OWNER_LABEL] = 'someone-else'
        fake.hook = replace_owner
        with self.assertRaisesRegex(vt.TransferError, '^helper-cleanup-failed$'):
            transfer(fake).transfer('cutover')
        self.assertFalse(any(c[:2] == ('container', 'rm') for c in fake.calls))
        self.assert_no_volume_deletion(fake)

    def test_policy_invalid_phase_and_fixed_production_maps(self):
        for policy in ({'other': [('a', 'b')]}, {'cutover': [('a', 'a')]},
                       {'cutover': [('a', 'b'), ('b', 'c')]},
                       {'cutover': [('a', 'b,bind=/')]}, {'cutover': []}):
            with self.assertRaises(vt.TransferError):
                vt.OfflineVolumeTransfer(FakeDocker(), policy)
        with self.assertRaises(vt.TransferError):
            transfer(FakeDocker(), timeout=901)
        fake = FakeDocker()
        for phase in ('other', {}, None):
            with self.assertRaisesRegex(vt.TransferError, 'phase'):
                transfer(fake).transfer(phase)
        self.assertFalse(fake.calls)
        with patch.object(vt, 'OfflineVolumeTransfer') as cls, patch.object(vt, 'DockerProcess'):
            vt.transfer_managed('rollback', 'trusted-config')
            policy = cls.call_args.args[1]
            self.assertEqual(policy['cutover'], tuple(
                ('clica-evolution-qa_' + s, 'kan140_qa_' + s) for s in vt.SUFFIXES))
            self.assertEqual(policy['rollback'], tuple(
                ('kan140_qa_' + s, 'kan140_rollback_' + s) for s in vt.SUFFIXES))
            cls.return_value.transfer.assert_called_once_with('rollback')

    def test_rollback_preserves_current_managed_bytes(self):
        fake = FakeDocker()
        fake.volumes = {'kan140_qa_postgres_data': archive(b'current-managed-bytes')}
        policy = {'rollback': [('kan140_qa_postgres_data', 'kan140_rollback_postgres_data')]}
        vt.OfflineVolumeTransfer(fake, policy).transfer('rollback')
        self.assertEqual(fake.volumes['kan140_rollback_postgres_data'],
                         fake.volumes['kan140_qa_postgres_data'])
        self.assert_no_volume_deletion(fake)


class FakeProcess:
    def __init__(self, stdout=b'', code=0):
        self.stdout = io.BytesIO(stdout)
        self.code, self.killed = code, False

    def poll(self):
        return self.code

    def wait(self, timeout):
        if self.code is None:
            raise subprocess.TimeoutExpired('private-command', timeout)
        return self.code

    def kill(self):
        self.killed, self.code = True, -9


class ProcessTests(unittest.TestCase):
    def test_blocked_pipe_deadline_kills_and_reaps_process(self):
        finished = threading.Event()
        class BlockedPipe:
            def read(self, size):
                finished.wait(2)
                return b''

            def close(self):
                finished.set()

        class BlockedProcess(FakeProcess):
            def kill(self):
                super().kill()
                finished.set()

        process = BlockedProcess(code=None)
        process.stdout = BlockedPipe()
        started = time.monotonic()
        with self.assertRaisesRegex(vt.TransferError, 'deadline'):
            vt.DockerProcess('config', popen=lambda *a, **k: process).execute(
                (), started + 0.05)
        self.assertTrue(process.killed)
        self.assertLess(time.monotonic() - started, 1)

    def test_control_and_stream_bounded_without_secret_diagnostics(self):
        process = FakeProcess(b'ok')
        with patch.dict(vt.os.environ, {'DOCKER_HOST': 'private-host', 'DOCKER_CONTEXT': 'secret'}):
            factory = unittest.mock.Mock(return_value=process)
            self.assertEqual(vt.DockerProcess('config', popen=factory).execute(
                ('volume', 'ls'), time.monotonic() + 1), b'ok')
            args, kwargs = factory.call_args
            self.assertEqual(args[0][:5], ['docker', '--host', 'unix:///var/run/docker.sock',
                                          '--config', 'config'])
            self.assertFalse(any(k.startswith('DOCKER_') for k in kwargs['env']))
            self.assertEqual(kwargs['stderr'], subprocess.DEVNULL)
        data = archive()
        result = vt.DockerProcess('config', popen=lambda *a, **k: FakeProcess(data)).execute(
            (), time.monotonic() + 1,
            lambda pipe: vt.tar_manifest(pipe, time.monotonic() + 1))
        self.assertEqual(result['entries'], 2)
        with patch.object(vt, 'MAX_CONTROL', 1), self.assertRaisesRegex(
                vt.TransferError, 'output-limit'):
            vt.DockerProcess('config', popen=lambda *a, **k: FakeProcess(b'private-output')).execute(
                (), time.monotonic() + 1)

    def test_nonzero_and_timeout_are_sanitized_and_killed(self):
        process = FakeProcess(b'', code=1)
        with self.assertRaisesRegex(vt.TransferError, '^docker-command$'):
            vt.DockerProcess('config', popen=lambda *a, **k: process).execute(
                (), time.monotonic() + 1)
        process = FakeProcess(b'', code=None)
        with self.assertRaisesRegex(vt.TransferError, '^docker-command$'):
            vt.DockerProcess('config', popen=lambda *a, **k: process).execute(
                (), time.monotonic() + 0.1)
        self.assertTrue(process.killed)
        with self.assertRaisesRegex(vt.TransferError, 'deadline'):
            vt.DockerProcess('config', popen=lambda *a, **k: self.fail('must not spawn')).execute(
                (), time.monotonic() - 1)


if __name__ == '__main__':
    unittest.main()
