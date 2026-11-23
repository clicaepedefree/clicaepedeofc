"""Opt-in fixture-only native SIGKILL/recovery gate; never a restore or cutover.

Run with KAN140_COMPOSE_RECOVERY_INTEGRATION=true on Linux root. The adapter
and sibling kan133 sources must be staged privately, with canonical pins below.
Child <=60s, each canonical recovery <=65s, total including retry <=240s.
No official receipt is written. No service is started, stopped or updated.
"""
import contextlib
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import signal
import stat
import subprocess
import sys
import time
import unittest
import uuid
from unittest.mock import patch

ROOT = Path('/var/lib/clicaepede/kan133')
CANONICAL = Path('/opt/clicaepede/kan133')
STACK = Path('/opt/clicaepede/kan132/stack.yaml')
PG_IMAGE = 'postgres:17.11-bookworm@sha256:3645570cccdfa447589da9f57dd740faa29b30938e861289a5574b6ca6b03826'
LABEL = 'clicaepede.kan133.restore'
ROLES = ('postgres', 'redis', 'evolution')
PINS = {
    'restore-recover.py': '05ff26aec73e1cd17c49d723a817ab5d7341dac4661935a7b94e61109431087b',
    'backup.py': '5152f3ff2d94119ce1b851ceae4a03b8d23a6ff63bdc15c724a132017d5a0308',
    'runtime.py': '41f2b899cc2e77a018ddc7e0a7fd1fcded6368209d8b299523346ada446baed3',
    'restore.py': 'ea35a72beac23c1c19b4ab936653c5ac8f50bf89e08369381bc5e224389cfe1f',
    'data_snapshot.py': 'febf01d5647c42f41506b8a97b987cc6de734fbe636395f67965f29a508c2d11',
}
ENV = {'PATH': '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
       'LANG': 'C', 'PYTHONDONTWRITEBYTECODE': '1',
       'KAN140_COMPOSE_RECOVERY_INTEGRATION': 'true'}


class Rejected(Exception):
    pass


def require(value, code):
    if not value:
        raise Rejected(code)


def enabled():
    return (sys.platform == 'linux' and os.geteuid() == 0 and
            os.environ.get('KAN140_COMPOSE_RECOVERY_INTEGRATION') == 'true')


def trusted(path, digest=None):
    require(path.is_absolute() and path.resolve(strict=True) == path, 'source-path')
    for parent in path.parents:
        entry = parent.lstat()
        require(stat.S_ISDIR(entry.st_mode) and entry.st_uid == 0 and
                not entry.st_mode & 0o022, 'source-parent')
    entry = path.lstat()
    require(stat.S_ISREG(entry.st_mode) and entry.st_uid == 0 and entry.st_nlink == 1 and
            not entry.st_mode & 0o022 and entry.st_size <= 1024 * 1024, 'source-file')
    raw = path.read_bytes()
    require(digest is None or hashlib.sha256(raw).hexdigest() == digest, 'source-sha')
    return raw


def verify_sources():
    for name in ('restore-recover.py', 'backup.py', 'runtime.py'):
        trusted(CANONICAL / name, PINS[name])
    base = Path(__file__).resolve().parent
    trusted(base / 'compose_restore.py')
    trusted(Path(__file__).resolve())
    for name in ('restore.py', 'data_snapshot.py'):
        trusted(base.parent / 'kan133' / name, PINS[name])
    require(json.loads(trusted(STACK))['services']['postgres']['image'] == PG_IMAGE, 'postgres-pin')


def identity(attempt):
    require(isinstance(attempt, str) and re.fullmatch('[a-f0-9]{32}', attempt), 'attempt')
    owner = 'kan133-restore-' + attempt
    return {'owner': owner, 'directory': str(ROOT / ('restore-offsite-' + attempt[:8])),
            'validator_directory': str(ROOT / (owner + '-' + attempt[-8:]))}


def check_pg_image(image):
    # Docker RepoDigests are repository@digest, not repository:tag@digest.
    expected = 'postgres@' + PG_IMAGE.split('@', 1)[1]
    require(expected in image.get('RepoDigests', []), 'local-postgres-pin')


def read_lease():
    path = ROOT / 'restore_lease.json'
    if not os.path.lexists(path):
        return None
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as stream:
        entry = os.fstat(stream.fileno())
        require(stat.S_ISREG(entry.st_mode) and entry.st_uid == 0 and entry.st_nlink == 1 and
                stat.S_IMODE(entry.st_mode) == 0o600, 'lease-private')
        raw = stream.read(4097)
    require(len(raw) <= 4096, 'lease-size')
    return json.loads(raw)


@contextlib.contextmanager
def locked():
    import fcntl
    entry = ROOT.lstat()
    require(ROOT.resolve() == ROOT and stat.S_ISDIR(entry.st_mode) and entry.st_uid == 0 and
            stat.S_IMODE(entry.st_mode) == 0o700, 'root-private')
    fd = os.open(ROOT / 'backup.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        entry = os.fstat(fd)
        require(stat.S_ISREG(entry.st_mode) and entry.st_uid == 0 and entry.st_nlink == 1 and
                stat.S_IMODE(entry.st_mode) == 0o600, 'lock-private')
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield
    finally:
        os.close(fd)


def sync_root():
    fd = os.open(ROOT, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def publish_lease(value):
    require(read_lease() is None and not os.path.lexists(ROOT / 'maintenance.json'), 'existing-guard')
    fd = os.open(ROOT / 'restore_lease.json', os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as stream:
        json.dump(value, stream)
        stream.flush()
        os.fsync(stream.fileno())
    sync_root()


class Probe:
    def __init__(self):
        self.end = time.monotonic() + 240
        self.lease = identity(uuid.uuid4().hex)
        self.cleaning = False
        self.terminating = False

    @contextlib.contextmanager
    def signal_scope(self):
        previous = {}
        def interrupted(signum, frame):
            if self.cleaning or self.terminating:
                return
            self.terminating = True
            raise Rejected('probe-interrupted')
        try:
            for signum in (signal.SIGTERM, signal.SIGINT):
                previous[signum] = signal.signal(signum, interrupted)
            yield
        finally:
            for signum, handler in previous.items():
                signal.signal(signum, handler)

    def command(self, args, seconds=5, stdin=None):
        remaining = self.end - (0 if self.cleaning else 70) - time.monotonic()
        require(remaining > 0, 'probe-deadline')
        with subprocess.Popen(args, stdin=subprocess.PIPE if stdin is not None else subprocess.DEVNULL,
                              stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=ENV,
                              cwd=CANONICAL, start_new_session=True) as process:
            try:
                stdout, _ = process.communicate(stdin, timeout=min(seconds, remaining))
            except BaseException:
                self.terminating = True
                # Only this new process group is ours; never leave a Docker CLI
                # racing recovery after a timed-out fixture child.
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                process.communicate(timeout=3)
                raise
            return subprocess.CompletedProcess(args, process.returncode, stdout)

    def docker(self, *args):
        result = self.command(['docker', '--host', 'unix:///var/run/docker.sock',
                               '--config', str(ROOT), *args])
        require(result.returncode == 0 and len(result.stdout) <= 1024 * 1024, 'docker-contract')
        return result.stdout.decode('utf-8')

    def live_ids(self):
        ids = {}
        for role in ROLES:
            service = 'clica-evolution-qa_' + role
            ids[role] = self.docker('service', 'inspect', service, '--format', '{{.ID}}').strip()
            require(re.fullmatch('[a-z0-9]{25}', ids[role]), 'canonical-service-missing')
            ids[role + '_tasks'] = sorted(self.docker('service', 'ps', '--no-trunc', service,
                                                     '--format', '{{.ID}}').split())
        ids['containers'] = sorted(self.docker('container', 'ls', '--all', '--no-trunc', '--quiet',
                                              '--filter', 'label=com.docker.stack.namespace=clica-evolution-qa').split())
        return ids

    def owned_lists(self):
        owner = self.lease['owner']
        rows = {}
        for kind in ('container', 'network', 'volume'):
            args = [kind, 'ls'] + (['--all'] if kind == 'container' else [])
            field = 'Names' if kind == 'container' else 'Name'
            for mode, query in (('label', 'label=' + LABEL + '=' + owner), ('name', 'name=' + owner)):
                rows[kind, mode] = set(self.docker(*args, '--filter', query,
                                                  '--format', '{{.' + field + '}}').split())
        return rows

    def recover_own(self):
        with locked():
            require(read_lease() == self.lease, 'foreign-or-missing-lease')
            require(not os.path.lexists(ROOT / 'maintenance.json'), 'maintenance-present')
            verify_sources()
        # Canonical CLI obtains backup.lock itself; the durable lease fences
        # cooperating restore wrappers while that lock is handed over.
        result = self.command([sys.executable, '-B', str(CANONICAL / 'restore-recover.py')], 65)
        require(result.returncode == 0 and len(result.stdout) <= 4096, 'recovery-exit')
        value = json.loads(result.stdout)
        require(value.get('status') == 'ok' and value.get('code') == 'recovered', 'recovery-code')
        return value

    def clean(self):
        require(read_lease() is None, 'lease-remains')
        require(not any(self.owned_lists().values()), 'resources-remain')
        require(all(not os.path.lexists(self.lease[key]) for key in ('directory', 'validator_directory')),
                'plaintext-remains')

    def run(self):
        verify_sources()
        before = None
        published = False
        try:
            with locked():
                require(read_lease() is None and not os.path.lexists(ROOT / 'maintenance.json'), 'existing-guard')
                before = self.live_ids()
                require(not any(self.owned_lists().values()), 'owner-collision')
                require(all(not os.path.lexists(self.lease[key]) for key in ('directory', 'validator_directory')),
                        'directory-collision')
                image = json.loads(self.docker('image', 'inspect', PG_IMAGE))[0]
                check_pg_image(image)
                # Mark the attempt before the durable write so partial writes
                # fail dirty rather than triggering any unowned cleanup.
                published = True
                publish_lease(self.lease)
                child = self.command([sys.executable, '-B', str(Path(__file__).resolve()), '--fixture-child'],
                                     60, json.dumps(self.lease).encode())
                if child.returncode != -signal.SIGKILL and child.stdout:
                    details = json.loads(child.stdout)
                    code = details.get('fixture_failure', '')
                    require(isinstance(code, str) and re.fullmatch('[a-zA-Z0-9-]{1,80}', code),
                            'child-invalid-diagnostic')
                    raise Rejected('child-fixture-' + code)
                require(child.returncode == -signal.SIGKILL and not child.stdout, 'child-not-sigkilled')
                container = json.loads(self.docker('container', 'inspect', self.lease['owner'] + '-postgres'))[0]
                require(container['State']['Status'] == 'created' and not container['State']['Running'] and
                        container['Config']['Image'] == PG_IMAGE and
                        container['Config']['Labels'].get(LABEL) == self.lease['owner'] and
                        container['Config']['Labels'].get('com.docker.compose.service') == 'postgres', 'fixture-container')
                expected = {'container': {self.lease['owner'] + '-postgres'},
                            'network': {self.lease['owner'] + '-net'},
                            'volume': {self.lease['owner'] + '-postgres-data'}}
                require(all(names == expected[kind] for (kind, _), names in self.owned_lists().items()), 'fixture-resources')
            recovered = self.recover_own()
            require(recovered.get('resources_removed') == 3 and recovered.get('directories_removed') == 2,
                    'recovery-counts')
        finally:
            self.cleaning = True
            if published:
                with locked():
                    current = read_lease()
                    require(current is None or current == self.lease, 'foreign-lease-preserved')
                if current == self.lease:
                    self.recover_own()
                with locked():
                    self.clean()
                    require(self.live_ids() == before, 'canonical-live-ids-changed')


def fixture_child():
    require(enabled(), 'native-opt-in-required')
    os.umask(0o077)
    verify_sources()
    value = json.loads(sys.stdin.buffer.read(4097))
    require(isinstance(value, dict) and isinstance(value.get('owner'), str), 'child-identity')
    require(value == identity(value['owner'].removeprefix('kan133-restore-')), 'child-identity')
    require(read_lease() == value, 'child-lease')
    for key in ('directory', 'validator_directory'):
        Path(value[key]).mkdir(mode=0o700)
    (Path(value['directory']) / 'input').mkdir(mode=0o700)
    base = Path(__file__).resolve().parent
    spec = importlib.util.spec_from_file_location('kan140_fixture_adapter', base / 'compose_restore.py')
    adapter = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(adapter)
    validator = adapter.ComposeValidator(Path(value['directory']) / 'input', seconds=100)
    validator.owner = value['owner']
    validator.network = validator.owner + '-net'
    validator.containers = {role: validator.owner + '-' + role for role in ROLES}
    validator.temp = Path(value['validator_directory'])
    validator.services = {'postgres': {'image': PG_IMAGE}}
    fixture = validator.temp / 'pg_admin_password'
    fd = os.open(fixture, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o444)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(b'KAN140_FIXTURE_ONLY_NOT_A_CREDENTIAL\n')
    validator.create_resource('network', validator.network, '--driver', 'bridge', '--internal',
                              '--opt', 'com.docker.network.bridge.gateway_mode_ipv4=isolated',
                              '--opt', 'com.docker.network.bridge.gateway_mode_ipv6=isolated')
    volume = validator.owner + '-postgres-data'
    validator.create_resource('volume', volume)
    validator.create_container('postgres', '/bin/true', {},
                               [(fixture, '/run/secrets/pg_admin_password', True),
                                (volume, '/var/lib/postgresql/data', False)], [])
    os.kill(os.getpid(), signal.SIGKILL)


class Contracts(unittest.TestCase):
    def test_sigterm_reaps_child_before_lock_unwinds_and_shields_repeated_signal(self):
        probe, events, handlers = Probe(), [], {}
        def register(signum, handler):
            old = handlers.get(signum)
            handlers[signum] = handler
            return old
        process = unittest.mock.MagicMock()
        process.pid = 12345
        def communicate(*args, **kwargs):
            if not events:
                events.append('signal')
                handlers[signal.SIGTERM](signal.SIGTERM, None)
            events.append('reaped')
            return b'', b''
        process.communicate.side_effect = communicate
        process.__enter__.return_value = process
        def kill(*args):
            events.append('kill')
            handlers[signal.SIGTERM](signal.SIGTERM, None)
        @contextlib.contextmanager
        def fake_lock():
            try:
                yield
            finally:
                events.append('lock-released')
        with patch.object(signal, 'signal', side_effect=register), \
                patch.object(signal, 'SIGKILL', 9, create=True), \
                patch.object(subprocess, 'Popen', return_value=process), \
                patch.object(os, 'killpg', side_effect=kill, create=True):
            with probe.signal_scope(), self.assertRaisesRegex(Rejected, 'probe-interrupted'):
                with fake_lock():
                    probe.command(['fixture'])
        self.assertEqual(events, ['signal', 'kill', 'reaped', 'lock-released'])

    def test_opt_in_is_exact_and_linux_root_only(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertFalse(enabled())

    def test_parent_identity_is_bounded_and_recovery_compatible(self):
        value = identity('a' * 32)
        self.assertEqual(set(value), {'owner', 'directory', 'validator_directory'})
        self.assertRegex(Path(value['directory']).name, r'^restore-offsite-[a-z0-9_]{8}$')
        self.assertEqual(Path(value['validator_directory']).parent, ROOT)
        self.assertRegex(Path(value['validator_directory']).name,
                         r'^kan133-restore-[a-f0-9]{32}-[a-z0-9_]{8}$')
        for invalid in ('', '../escape', 'g' * 32, 'a' * 31):
            with self.assertRaises(Rejected):
                identity(invalid)

    def test_recovery_never_invoked_for_foreign_or_missing_lease(self):
        probe = Probe()
        for value in (None, identity('b' * 32), dict(probe.lease, directory='/different')):
            with patch(__name__ + '.locked', contextlib.nullcontext), \
                    patch(__name__ + '.read_lease', return_value=value), \
                    patch.object(probe, 'command') as command:
                with self.assertRaisesRegex(Rejected, 'foreign-or-missing-lease'):
                    probe.recover_own()
                command.assert_not_called()

    def test_sha_pins_match_repository_sources(self):
        base = Path(__file__).resolve().parent.parent / 'kan133'
        for name, digest in PINS.items():
            self.assertEqual(hashlib.sha256((base / name).read_bytes()).hexdigest(), digest)
        image = json.loads((base.parent / 'kan132' / 'stack.yaml').read_text())['services']['postgres']['image']
        self.assertEqual(image, PG_IMAGE)

    def test_exact_repository_digest_uses_docker_untagged_form(self):
        digest = PG_IMAGE.split('@', 1)[1]
        check_pg_image({'RepoDigests': ['postgres@' + digest]})
        for references in ([], ['unrelated@' + digest], ['postgres@sha256:' + '0' * 64], [PG_IMAGE]):
            with self.assertRaisesRegex(Rejected, 'local-postgres-pin'):
                check_pg_image({'RepoDigests': references})


@unittest.skipUnless(enabled(), 'opt-in Linux root fixture integration')
class NativeRecovery(unittest.TestCase):
    def test_sigkill_compose_recovered_by_unmodified_canonical_cli(self):
        try:
            probe = Probe()
            with probe.signal_scope():
                probe.run()
        except BaseException as error:
            code = str(error) if isinstance(error, Rejected) else 'native-probe-rejected'
            self.fail(code)


if __name__ == '__main__':
    if sys.argv[1:] == ['--fixture-child']:
        try:
            fixture_child()
        except BaseException as error:
            code = str(error) if isinstance(error, Rejected) or type(error).__name__ == 'GateError' else type(error).__name__
            if not re.fullmatch('[a-zA-Z0-9-]{1,80}', code):
                code = 'rejected'
            os.write(1, json.dumps({'fixture_failure': code}).encode())
            os._exit(1)
    else:
        unittest.main()
