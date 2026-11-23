"""Offline contracts: deny subprocess/socket access, simulate only fixture Docker."""
import contextlib
import io
import json
from pathlib import Path
import socket
import signal
import subprocess
import sys
import tarfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import volume_transfer as vt
import volume_transfer_native as native
from volume_transfer_test import FakeDocker


def fixture_archive(latest=False, bad_mode=False):
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode='w', format=tarfile.GNU_FORMAT) as archive:
        for name, payload, uid, gid, mode in [
                ('.', None, 12001, 12002, 0o750),
                ('./sub', None, 12003, 12004, 0o2750),
                ('./sub/seed', b'fixture-v1', 12005, 12006, 0o640),
                *([('./sub/latestwrite', b'managed-latest-v2', 12007, 12008,
                    0o644 if bad_mode else 0o600)] if latest else [])]:
            item = tarfile.TarInfo(name)
            item.type = tarfile.DIRTYPE if payload is None else tarfile.REGTYPE
            item.uid, item.gid, item.mode = uid, gid, mode
            item.size = len(payload) if payload else 0
            archive.addfile(item, None if payload is None else io.BytesIO(payload))
    return output.getvalue()


class NativeDocker(FakeDocker):
    def __init__(self):
        super().__init__()
        self.volumes = {'unrelated-precious': b'never touch'}
        self.creates = {}
        self.drift = None
        self.bad_metadata = False
        self.stale_rollback = False

    def execute(self, args, deadline, consumer=None):
        args = tuple(args)
        if args[:2] == ('container', 'create'):
            name = native.values(args, '--name')[0]
            self.creates[name] = args
        if args[:2] == ('container', 'inspect') and args[2] in self.creates:
            result = json.loads(super().execute(args, deadline, consumer))[0]
            create = self.creates[args[2]]
            mounts = []
            for value in native.values(create, '--mount'):
                parts = dict(p.split('=', 1) if '=' in p else (p, True)
                             for p in value.split(','))
                mounts.append({'Type': 'volume', 'Name': parts['source'],
                               'Destination': parts['target'], 'RW': 'readonly' not in parts})
            result['Mounts'] = mounts
            result['Config'].update(Image=native.PIN, User='0:0', Entrypoint=['/bin/sh'],
                                    Cmd=list(create[-2:]), Healthcheck={'Test': ['NONE']},
                                    ExposedPorts={'5432/tcp': {}})
            result['HostConfig'] = {
                'NetworkMode': 'none', 'ReadonlyRootfs': True, 'Privileged': False,
                'IpcMode': 'private', 'RestartPolicy': {'Name': 'no'},
                'LogConfig': {'Type': 'none'}, 'CapDrop': ['ALL'],
                'CapAdd': list(native.CAPS), 'SecurityOpt': ['no-new-privileges:true'],
                'Memory': 268435456, 'MemorySwap': 268435456, 'NanoCpus': 500000000,
                'PidsLimit': 32, 'Tmpfs': dict(native.TMPFS)}
            if self.drift:
                self.drift(result)
            return json.dumps([result]).encode()
        if args[:3] == ('container', 'start', '--attach'):
            command = self.creates[args[3]][-1]
            if command in (native.SEED, native.LATEST):
                self.calls.append(args)
                mount = native.values(self.creates[args[3]], '--mount')[0]
                volume = dict(p.split('=', 1) for p in mount.split(',') if '=' in p)['source']
                self.volumes[volume] = fixture_archive(command == native.LATEST, self.bad_metadata)
                return b''
            helper = self.helpers[args[3]]
            if self.stale_rollback and helper['target'] and helper['target'].endswith('-rollback'):
                self.calls.append(args)
                self.volumes[helper['target']] = fixture_archive()
                return b''
        if args[:2] == ('volume', 'rm'):
            self.calls.append(args)
            if self.hook:
                self.hook(args)
            del self.volumes[args[2]]
            self.labels.pop(args[2], None)
            return b''
        return super().execute(args, deadline, consumer)


class NativeTests(unittest.TestCase):
    def setUp(self):
        # A regression must fail rather than accidentally launch Docker/network.
        for target in ((subprocess, 'Popen'), (subprocess, 'run'), (socket, 'socket'),
                       (vt, 'transfer_managed')):
            self.enterContext(patch.object(*target, side_effect=AssertionError('forbidden')))

    def test_copy_latestwrite_current_rollback_metadata_and_scoped_cleanup(self):
        fake = NativeDocker()
        result = native.rehearse(fake)
        self.assertEqual(result['status'], 'pass')
        self.assertTrue(result['cleanup_verified'])
        self.assertFalse(result['production_cutover'])
        self.assertEqual(result['evidence']['copy'], native.expected())
        self.assertEqual(result['evidence']['rollback'], native.expected(True))
        self.assertTrue(result['evidence']['latestwrite'])
        self.assertTrue(result['evidence']['metadata'])
        self.assertEqual(fake.volumes, {'unrelated-precious': b'never touch'})
        self.assertFalse(fake.helpers)
        names = [c[-1] for c in fake.calls if c[:2] == ('volume', 'create')]
        self.assertEqual(len(names), 3)
        prefix = names[0].rsplit('-', 1)[0]
        self.assertRegex(prefix, '^kan140-native-[a-f0-9]{32}$')
        self.assertEqual(names, [prefix + '-' + s for s in ('fixture', 'managedfixture', 'rollback')])
        writes = [c for c in fake.creates.values() if c[-1] in (native.SEED, native.LATEST)]
        self.assertEqual(len(writes), 2)
        self.assertIn('source=' + names[1] + ',', native.values(writes[1], '--mount')[0])
        for command in fake.creates.values():
            self.assertIn(native.PIN, command)
            for flag, value in (('--network', 'none'), ('--log-driver', 'none'),
                                ('--pull', 'never'), ('--cap-drop', 'ALL'),
                                ('--restart', 'no'), ('--user', '0:0'),
                                ('--memory', '256m'), ('--memory-swap', '256m'),
                                ('--cpus', '0.5'), ('--pids-limit', '32'),
                                ('--security-opt', 'no-new-privileges:true')):
                self.assertEqual(native.values(command, flag), [value])
            self.assertIn('--read-only', command)
            self.assertIn('--no-healthcheck', command)
            self.assertEqual(set(native.values(command, '--cap-add')), set(native.CAPS))
            self.assertEqual(set(native.values(command, '--tmpfs')),
                             {p + ':' + o for p, o in native.TMPFS.items()})
        text = json.dumps(result)
        for secret in (*names, 'fixture-v1', 'managed-latest-v2', '/target', '12007'):
            self.assertNotIn(secret, text)

    def test_each_run_has_unique_names(self):
        runs = [NativeDocker(), NativeDocker()]
        for fake in runs:
            self.assertEqual(native.rehearse(fake)['status'], 'pass')
        names = [{c[-1] for c in fake.calls if c[:2] == ('volume', 'create')} for fake in runs]
        self.assertTrue(names[0].isdisjoint(names[1]))

    def test_metadata_or_stale_rollback_cannot_pass(self):
        for option in ('bad_metadata', 'stale_rollback'):
            fake = NativeDocker()
            setattr(fake, option, True)
            result = native.rehearse(fake)
            self.assertEqual(result['status'], 'fail')
            self.assertTrue(result['cleanup_verified'])
            self.assertNotIn('evidence', result)

    def test_helper_default_drift_is_rejected_before_start(self):
        drifts = [lambda r: r['HostConfig'].update(NetworkMode='bridge'),
                  lambda r: r['HostConfig'].update(LogConfig={'Type': 'json-file'}),
                  lambda r: r['HostConfig'].update(CapAdd=['SYS_ADMIN']),
                  lambda r: r['HostConfig'].update(Tmpfs={}),
                  lambda r: r['HostConfig'].update(Privileged=True),
                  lambda r: r['Mounts'].append({'Type': 'volume', 'Name': 'anonymous',
                                               'Destination': '/unexpected', 'RW': True})]
        for drift in drifts:
            with self.subTest(drift=drift):
                fake = NativeDocker()
                fake.drift = drift
                result = native.rehearse(fake)
                self.assertEqual(result['status'], 'fail')
                self.assertTrue(result['cleanup_verified'])
                self.assertFalse(any(c[:2] == ('container', 'start') for c in fake.calls))

    def test_capadd_accepts_only_exact_bare_or_prefixed_canonical_set(self):
        accepted = [list(native.CAPS), ['CAP_' + cap for cap in native.CAPS],
                    ['CAP_DAC_OVERRIDE', 'CHOWN', 'CAP_FOWNER', 'FSETID']]
        rejected = [None, [], native.CAPS[:-1], native.CAPS + ['CAP_NET_RAW'],
                    ['CAP_CAP_' + cap for cap in native.CAPS],
                    [cap.lower() for cap in native.CAPS], native.CAPS + ['CAP_CHOWN'],
                    [*native.CAPS[:-1], None]]
        for caps in accepted + rejected:
            with self.subTest(caps=caps):
                fake = NativeDocker()
                fake.drift = lambda row: row['HostConfig'].update(CapAdd=caps)
                result = native.rehearse(fake)
                self.assertEqual(result['status'], 'pass' if caps in accepted else 'fail')
                self.assertTrue(result['cleanup_verified'])
        fake = NativeDocker()
        fake.drift = lambda row: row['HostConfig'].pop('CapAdd')
        self.assertEqual(native.rehearse(fake)['status'], 'fail')

    @contextlib.contextmanager
    def mocked_handlers(self):
        original = {signal.SIGTERM: object(), signal.SIGINT: object()}
        installed = dict(original)

        def install(signum, handler):
            old = installed[signum]
            installed[signum] = handler
            return old

        with patch.object(native.signal, 'getsignal', side_effect=installed.__getitem__), \
                patch.object(native.signal, 'signal', side_effect=install):
            yield installed
        self.assertEqual(installed, original)

    def test_first_signal_is_baseexception_repeats_ignored_and_handlers_restored(self):
        state = {'interrupted': False, 'restoring': False}
        with self.mocked_handlers() as handlers:
            with native.interruption_handlers(state):
                with self.assertRaises(native.NativeInterrupted) as raised:
                    handlers[signal.SIGTERM](signal.SIGTERM, None)
                self.assertNotIsInstance(raised.exception, Exception)
                handlers[signal.SIGTERM](signal.SIGTERM, None)
                handlers[signal.SIGINT](signal.SIGINT, None)
                self.assertTrue(state['interrupted'])

    def test_main_signals_unwind_fixture_and_transfer_helpers_and_cleanup(self):
        for signum in (signal.SIGTERM, signal.SIGINT):
            for stage in ('fixture', 'cutover', 'rollback', 'cleanup'):
                with self.subTest(signum=signum, stage=stage), self.mocked_handlers() as handlers:
                    fake = NativeDocker()
                    execute = fake.execute
                    sent = False
                    repeats = 0

                    def interrupt(args, deadline, consumer=None):
                        nonlocal sent, repeats
                        args = tuple(args)
                        labels = native.values(args, '--label')
                        trigger = ((stage == 'cleanup' and args[:2] == ('volume', 'rm'))
                                   or (args[:2] == ('container', 'create')
                                       and vt.PHASE_LABEL + '=' + stage in labels))
                        if stage == 'cleanup' and trigger and not sent:
                            sent = True
                            handlers[signum](signum, None)
                        result = execute(args, deadline, consumer)
                        if trigger and not sent:
                            sent = True
                            try:
                                handlers[signum](signum, None)
                            except Exception:
                                self.fail('signal was swallowed by an Exception sanitizer')
                        if sent and args[:2] in (('container', 'rm'), ('volume', 'rm')):
                            repeats += 1
                            handlers[signal.SIGTERM](signal.SIGTERM, None)
                            handlers[signal.SIGINT](signal.SIGINT, None)
                        return result

                    fake.execute = interrupt
                    output = io.StringIO()
                    with patch.object(native.sys, 'platform', 'linux'), \
                            patch.object(native.os, 'geteuid', return_value=0, create=True), \
                            patch.object(vt, 'DockerProcess', return_value=fake), \
                            contextlib.redirect_stdout(output):
                        self.assertEqual(native.main(['--run-native-fixtures']), 1)
                    receipt = json.loads(output.getvalue())
                    self.assertTrue(sent)
                    self.assertGreater(repeats, 0)
                    self.assertEqual(receipt['status'], 'fail')
                    self.assertEqual(receipt['gate'], 'native-fixture-interrupted')
                    self.assertTrue(receipt['cleanup_verified'])
                    self.assertNotIn('evidence', receipt)
                    self.assertFalse(fake.helpers)
                    self.assertEqual(fake.volumes, {'unrelated-precious': b'never touch'})

    def test_main_restores_handlers_on_success_and_regular_failure(self):
        for failing in (False, True):
            fake = NativeDocker()
            fake.corrupt = failing
            with self.mocked_handlers(), patch.object(native.sys, 'platform', 'linux'), \
                    patch.object(native.os, 'geteuid', return_value=0, create=True), \
                    patch.object(vt, 'DockerProcess', return_value=fake), \
                    contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(native.main(['--run-native-fixtures']), int(failing))

    def test_interrupted_cleanup_failure_stays_failure_without_evidence(self):
        with self.mocked_handlers() as handlers:
            fake = NativeDocker()
            execute = fake.execute
            sent = False

            def interrupt(args, deadline, consumer=None):
                nonlocal sent
                if tuple(args[:2]) == ('volume', 'rm'):
                    raise vt.TransferError('private-cleanup-failure')
                result = execute(args, deadline, consumer)
                if not sent and tuple(args[:2]) == ('container', 'create'):
                    sent = True
                    handlers[signal.SIGTERM](signal.SIGTERM, None)
                return result

            fake.execute = interrupt
            output = io.StringIO()
            with patch.object(native.sys, 'platform', 'linux'), \
                    patch.object(native.os, 'geteuid', return_value=0, create=True), \
                    patch.object(vt, 'DockerProcess', return_value=fake), \
                    contextlib.redirect_stdout(output):
                self.assertEqual(native.main(['--run-native-fixtures']), 1)
            receipt = json.loads(output.getvalue())
            self.assertEqual(receipt['gate'], 'native-fixture-cleanup-failed')
            self.assertFalse(receipt['cleanup_verified'])
            self.assertNotIn('evidence', receipt)
            self.assertNotIn('private', output.getvalue())

    def test_collision_never_creates_or_deletes_existing_volume(self):
        nonce = '1' * 32
        fake = NativeDocker()
        collision = 'kan140-native-' + nonce + '-managedfixture'
        fake.volumes[collision] = b'precious'
        with patch.object(native.uuid, 'uuid4') as random:
            random.return_value.hex = nonce
            result = native.rehearse(fake)
        self.assertEqual(result['status'], 'fail')
        self.assertEqual(fake.volumes[collision], b'precious')
        self.assertFalse(any(c[:2] in (('volume', 'create'), ('volume', 'rm')) for c in fake.calls))

    def test_volume_ownership_loss_retains_resource(self):
        fake = NativeDocker()
        def tamper(args):
            if args[:2] == ('volume', 'inspect') and args[2].endswith('-fixture'):
                fake.labels[args[2]][vt.OWNER_LABEL] = 'someone-else-private'
        fake.hook = tamper
        result = native.rehearse(fake)
        self.assertEqual(result['gate'], 'native-fixture-cleanup-failed')
        self.assertFalse(result['cleanup_verified'])
        self.assertFalse(any(c[:2] == ('volume', 'rm') for c in fake.calls))
        self.assertNotIn('private', json.dumps(result))

    def test_helper_ownership_loss_prevents_delete_and_volume_cleanup(self):
        for key, value in ((vt.OWNER_LABEL, 'wrong-owner'),
                           (vt.PHASE_LABEL, 'rollback'), ('extra-label', 'unexpected')):
            fake = NativeDocker()
            def tamper(row):
                row['Config']['Labels'][key] = value
            fake.drift = tamper
            result = native.rehearse(fake)
            self.assertFalse(result['cleanup_verified'])
            self.assertTrue(fake.helpers)
            self.assertFalse(any(c[:2] in (('container', 'rm'), ('volume', 'rm')) for c in fake.calls))

    def test_corrupt_copy_failed_helper_and_writer_fail_closed(self):
        for failure in ('copy', 'exit', 'writer'):
            fake = NativeDocker()
            if failure == 'copy':
                fake.corrupt = True
            elif failure == 'exit':
                fake.helper_exit = 1
            else:
                def attach(args):
                    if args[:2] == ('volume', 'create'):
                        fake.writer(source=args[-1], running=True)
                fake.hook = attach
            result = native.rehearse(fake)
            self.assertEqual(result['status'], 'fail')
            self.assertNotIn('evidence', result)
            self.assertEqual(fake.volumes['unrelated-precious'], b'never touch')
            self.assertFalse(any(c[:2] in (('container', 'stop'), ('container', 'update'),
                                          ('volume', 'prune'), ('image', 'pull')) for c in fake.calls))

    def test_cleanup_failure_is_fatal_and_sanitized(self):
        fake = NativeDocker()
        def fail(args):
            if args[:2] == ('volume', 'rm'):
                raise RuntimeError('secret-diagnostic')
        fake.hook = fail
        result = native.rehearse(fake)
        self.assertEqual(result['status'], 'fail')
        self.assertFalse(result['cleanup_verified'])
        self.assertNotIn('evidence', result)
        self.assertNotIn('secret', json.dumps(result))

    def test_pin_drift_and_gates_make_no_docker_calls(self):
        fake = NativeDocker()
        with patch.object(vt, 'PG_IMAGE', 'postgres:latest'):
            self.assertEqual(native.rehearse(fake)['status'], 'fail')
        self.assertFalse(fake.calls)
        for argv, platform, uid in (([], 'linux', 0), (['--run-native-fixtures'], 'win32', 0),
                                    (['--run-native-fixtures'], 'linux', 1000)):
            output = io.StringIO()
            with patch.object(native.sys, 'platform', platform), \
                    patch.object(native.os, 'geteuid', return_value=uid, create=True), \
                    patch.object(vt, 'DockerProcess', side_effect=AssertionError('must not create')), \
                    contextlib.redirect_stdout(output):
                self.assertEqual(native.main(argv), 1)
            self.assertEqual(json.loads(output.getvalue())['gate'], 'native-optin-linux-root-required')


if __name__ == '__main__':
    unittest.main()
