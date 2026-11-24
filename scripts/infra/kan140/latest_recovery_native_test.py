"""Opt-in Linux/root Docker SIGKILL fixtures for the RETURN v2 recovery gate.

Run on a disposable local CI Docker host, with the pinned image preloaded and
/var/lib/clicaepede/kan133 already provisioned with root-owned, non-writable
parents:
    KAN140_LATEST_RECOVERY_INTEGRATION=true python3 -m unittest discover \
        -s scripts/infra/kan140 -p latest_recovery_native_test.py -v

This proves the staged fixture gate, NOT the canonical installation/wrapper.
Only the imported fixture lease's CANONICAL_RECOVERY is redirected; real path,
ownership, byte-hash, persistence and lock checks remain enabled. No SSH, pulls,
application processes, canonical replacements, secrets, or prune operations.
"""
import hashlib
import copy
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
import time
import types
import unittest


OPT_IN = os.environ.get('KAN140_LATEST_RECOVERY_INTEGRATION') == 'true'
HERE = Path(__file__).resolve().parent
BASE = Path('/var/lib/clicaepede/kan133')
LABEL = 'clicaepede.kan133.restore'
TRANSFER_OWNER = 'clicaepede.kan140.transfer-owner'
PHASE = 'clicaepede.kan140.transfer-phase'
FIXTURE = 'clicaepede.kan140.recovery-native-fixture'
IMAGE = ('postgres:17.11-bookworm@sha256:'
         '3645570cccdfa447589da9f57dd740faa29b30938e861289a5574b6ca6b03826')
MARKER = 'kan140-synthetic-return-marker'
ENV = {'PATH': '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
       'LANG': 'C', 'PYTHONDONTWRITEBYTECODE': '1'}


def require(value, code):
    if not value:
        raise AssertionError(code)


def stable_inspect(row):
    """Docker may return the same mount set in a different array order."""
    result = copy.deepcopy(row)
    if 'Mounts' in result:
        result['Mounts'] = sorted(result['Mounts'], key=lambda mount: json.dumps(mount, sort_keys=True))
    return result


class InspectOrderTests(unittest.TestCase):
    def test_only_mount_order_is_normalized_not_changed_mount_content(self):
        mounts = [{'Type': 'volume', 'Name': 'source', 'RW': False},
                  {'Type': 'volume', 'Name': 'target', 'RW': True}]
        before = {'Id': 'fixture', 'Mounts': mounts, 'State': {'Running': True}}
        reordered = copy.deepcopy(before)
        reordered['Mounts'].reverse()
        self.assertEqual(stable_inspect(before), stable_inspect(reordered))
        reordered['Mounts'][0]['RW'] = False
        self.assertNotEqual(stable_inspect(before), stable_inspect(reordered))
        self.assertEqual(before['Mounts'], mounts)


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def modules(root):
    # Import the real backup implementation, never its CLI or configuration.
    previous = {name: sys.modules.get(name) for name in ('runtime', 'backup')}
    try:
        sys.modules['runtime'] = load('_kan140_fixture_runtime', HERE.parent / 'kan133/runtime.py')
        backup = load('_kan140_fixture_backup', HERE.parent / 'kan133/backup.py')
        injected = types.ModuleType('backup')
        injected.__dict__.update(backup.__dict__)
        injected.ROOT = root
        sys.modules['backup'] = injected
        recovery = load('_kan140_fixture_recovery', root / 'restore-recover.py')
        lease = load('_kan140_fixture_lease', HERE / 'latest_return_lease.py')
        lease.CANONICAL_RECOVERY = root / 'restore-recover.py'
        return injected, recovery, lease
    finally:
        for name, before in previous.items():
            if before is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = before


class Docker:
    def __init__(self, root, end):
        self.root, self.end = root, end

    def run(self, *args, missing=False):
        left = self.end - time.monotonic()
        require(left > 0, 'fixture_deadline')
        try:
            result = subprocess.run(
                ['docker', '--host', 'unix:///var/run/docker.sock', '--config', str(self.root), *args],
                stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                env=ENV, timeout=min(5, left), check=False)
        except (OSError, subprocess.TimeoutExpired):
            raise AssertionError('fixture_docker_unavailable_or_timeout') from None
        require(len(result.stdout) <= 1024 * 1024, 'fixture_response_limit')
        if result.returncode:
            # Absence must be established by an exact list, not an inspect error.
            require(missing and result.returncode == 1, 'fixture_docker_failed')
            return None
        return result.stdout.decode('utf-8')

    def exists(self, kind, name):
        pattern = '^/' + name + '$' if kind == 'container' else '^' + name + '$'
        args = [kind, 'ls', '--filter', 'name=' + pattern]
        if kind == 'container':
            args.append('--all')
        field = 'Names' if kind == 'container' else 'Name'
        rows = self.run(*args, '--format', '{{.' + field + '}}').splitlines()
        require(rows in ([], [name]), 'fixture_name_collision')
        return bool(rows)

    def inspect(self, kind, identity):
        rows = json.loads(self.run(kind, 'inspect', identity))
        require(isinstance(rows, list) and len(rows) == 1, 'fixture_inspect_failed')
        return rows[0]


def labels(config, *, foreign=False, revoked=False):
    return {LABEL: 'foreign-sentinel' if foreign else config['owner'],
            TRANSFER_OWNER: config['transfer'],
            PHASE: 'revoked' if revoked else 'rollback', FIXTURE: config['token']}


def label_args(value):
    return [arg for key, text in value.items() for arg in ('--label', key + '=' + text)]


def create_helper(docker, config, *, revoked=False):
    args = ['container', 'create', '--name', config['helper'], '--pull', 'never',
            '--entrypoint', '/bin/sh', '--user', '0:0', '--network', 'none',
            '--read-only', '--restart', 'no', '--log-driver', 'none', '--no-healthcheck',
            '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true',
            '--pids-limit', '32', '--memory', '256m', '--memory-swap', '256m', '--cpus', '0.5']
    for cap in ('DAC_OVERRIDE', 'CHOWN', 'FOWNER', 'FSETID'):
        args.extend(['--cap-add', cap])
    for target in ('/tmp', '/var/lib/postgresql/data'):
        args.extend(['--tmpfs', target + ':rw,noexec,nosuid,nodev,size=1m'])
    args.extend(label_args(labels(config, revoked=revoked)))
    args.extend(['--mount', 'type=volume,source=' + config['source'] + ',target=/source,readonly',
                 '--mount', 'type=volume,source=' + config['returned'] + ',target=/target',
                 IMAGE, '-c', 'umask 077; printf %s ' + MARKER +
                 ' > /target/marker; while :; do sleep 1; done'])
    identity = docker.run(*args).strip()
    require(re.fullmatch(r'[a-f0-9]{64}', identity), 'fixture_helper_identity')
    docker.run('container', 'start', identity)
    return identity


def holder(root):
    """The killed process retains the actual backup.lock through all creates."""
    require(root.parent == BASE and root.resolve() == root and
            re.fullmatch(r'kan140-native-recovery-[a-z0-9_]{8}', root.name) and
            root.lstat().st_uid == 0 and stat.S_IMODE(root.lstat().st_mode) == 0o700,
            'fixture_holder_private_root_required')
    backup, _, lease_module = modules(root)
    config = backup.read_json(root / 'fixture.json')
    docker = Docker(root, time.monotonic() + 90)
    with backup.locked(root):
        directory = root / 'restore-offsite-12345678'
        directory.mkdir(mode=0o700)
        (directory / 'synthetic').write_bytes(b'not-a-backup')
        backup.atomic_json(root / 'restore_lease.json',
                           {'owner': config['owner'], 'directory': str(directory)})
        staged = root / 'restore-recover.py'
        lease = lease_module.Lease(backup, recovery_path=staged,
                                  recovery_sha256=hashlib.sha256(staged.read_bytes()).hexdigest())
        lease.enable(config['owner'])
        # Both durable exact intents precede every Docker create.
        lease.register(config['owner'], 'volume', config['returned'])
        lease.register(config['owner'], 'container', config['helper'])
        for name in (config['source'], config['returned']):
            docker.run('volume', 'create', '--driver', 'local', *label_args(labels(config)), name)
        identity = create_helper(docker, config)
        while True:
            # exec produces no marker or diagnostics on stdout/stderr.
            ready = docker.run('container', 'exec', identity, '/bin/sh', '-c',
                               'test "$(cat /target/marker)" = ' + MARKER, missing=True)
            if ready is not None:
                break
            time.sleep(0.05)
        backup.atomic_json(root / 'ready.json', {'id': identity})
        while True:
            signal.pause()


@unittest.skipUnless(OPT_IN, 'set KAN140_LATEST_RECOVERY_INTEGRATION=true on disposable Linux/root CI')
class LatestRecoveryNativeTests(unittest.TestCase):
    def setUp(self):
        require(sys.platform == 'linux' and os.geteuid() == 0, 'fixture_linux_root_required')
        previous_umask = os.umask(0o077)
        self.addCleanup(os.umask, previous_umask)
        # Refuse /tmp, symlinks and writable ancestors before creating anything.
        for path in (*reversed(BASE.parents), BASE):
            info = path.lstat()
            require(stat.S_ISDIR(info.st_mode) and info.st_uid == 0 and
                    not info.st_mode & 0o022 and path.resolve() == path,
                    'fixture_parent_must_be_provisioned_root_owned')
        self.root = Path(tempfile.mkdtemp(prefix='kan140-native-recovery-', dir=BASE))
        self.child = None
        self.config = None
        self.addCleanup(self.cleanup_fixture)
        self.docker = Docker(self.root, time.monotonic() + 120)
        self.docker.run('info', '--format', '{{.OSType}}')
        image = self.docker.inspect('image', IMAGE)
        self.assertEqual(image['Os'], 'linux')
        self.assertEqual(set(image['Config'].get('Volumes') or {}), {'/var/lib/postgresql/data'},
                         'fixture_image_undeclared_anonymous_volume')
        shutil.copyfile(HERE.parent / 'kan133/restore-recover.py', self.root / 'restore-recover.py')
        (self.root / 'restore-recover.py').chmod(0o600)
        self.backup, self.recovery, self.lease_module = modules(self.root)
        import uuid
        token, transfer = uuid.uuid4().hex, uuid.uuid4().hex
        owner = 'kan133-restore-' + token
        self.config = {'owner': owner, 'token': token, 'transfer': transfer,
                       'helper': 'kan140-transfer-' + transfer + '-' + uuid.uuid4().hex,
                       'source': owner + '-postgres-data',
                       'returned': owner + '-return-' + uuid.uuid4().hex,
                       'sentinel': 'kan140-foreign-sentinel-' + uuid.uuid4().hex}
        self.created = set()
        for kind, name in self.resources():
            self.assertFalse(self.docker.exists(kind, name), 'fixture_name_collision')
        self.backup.atomic_json(self.root / 'fixture.json', self.config)
        self.created.add(('volume', self.config['sentinel']))
        self.docker.run('volume', 'create', '--driver', 'local',
                        *label_args(labels(self.config, foreign=True)), self.config['sentinel'])
        self.sentinel = self.docker.inspect('volume', self.config['sentinel'])

    def resources(self):
        return [('container', self.config['helper']),
                *[('volume', self.config[key]) for key in ('source', 'returned', 'sentinel')]]

    def crash_holder(self):
        # Plan all possible child creations before launch, including ambiguous exits.
        self.created.update(self.resources())
        self.child = subprocess.Popen(
            [sys.executable, '-B', str(Path(__file__).resolve()), '--fixture-holder', str(self.root)],
            stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            env=dict(ENV, KAN140_LATEST_RECOVERY_INTEGRATION='true'))
        end = time.monotonic() + 35
        while not (self.root / 'ready.json').exists():
            self.assertIsNone(self.child.poll(), 'fixture_holder_failed')
            require(time.monotonic() < end, 'fixture_holder_readiness_timeout')
            time.sleep(0.05)
        ready = self.backup.read_json(self.root / 'ready.json')
        self.helper_id = ready['id']
        with self.assertRaises(self.backup.LockBusy):
            with self.backup.locked(self.root):
                pass
        self.assertTrue(self.docker.inspect('container', self.helper_id)['State']['Running'])
        value = self.backup.read_json(self.root / 'restore_lease.json')
        self.assertEqual(value['version'], 2)
        self.assertEqual(value['resources'], [
            {'kind': 'volume', 'name': self.config['returned']},
            {'kind': 'container', 'name': self.config['helper']}])
        os.kill(self.child.pid, signal.SIGKILL)
        self.assertEqual(self.child.wait(timeout=5), -signal.SIGKILL)

    def recover(self):
        with self.backup.locked(self.root):
            recovery = self.recovery.Recovery(self.root)
            recovery.end = min(recovery.end, self.docker.end)
            return recovery.run()

    def assert_recovered(self):
        result = self.recover()
        self.assertEqual(result, {'status': 'ok', 'code': 'recovered',
                                  'resources_removed': 3, 'directories_removed': 1})
        self.assertFalse((self.root / 'restore_lease.json').exists())
        self.assertFalse((self.root / 'restore-offsite-12345678').exists())
        for kind, name in self.resources()[:-1]:
            self.assertFalse(self.docker.exists(kind, name), 'fixture_resource_leaked')
        self.assertEqual(self.docker.inspect('volume', self.config['sentinel']), self.sentinel)
        self.assertEqual(self.recover(), {'status': 'ok', 'code': 'no_lease'})

    def test_sigkill_recovers_exact_registered_return_and_helper(self):
        self.crash_holder()
        self.assert_recovered()

    def test_revoked_helper_labels_fail_closed_without_any_removal(self):
        self.crash_holder()
        # Docker container labels are immutable. Replace ONLY our exact fixture
        # helper to model a registered name now carrying revoked ownership.
        self.remove_owned('container', self.config['helper'])
        del self.helper_id  # A failed replacement create is still tracked by exact name + fixture labels.
        self.helper_id = create_helper(self.docker, self.config, revoked=True)
        before = {(kind, name): stable_inspect(self.docker.inspect(kind, name)) for kind, name in self.resources()}
        lease = (self.root / 'restore_lease.json').read_bytes()
        with self.assertRaises(self.recovery.Failure) as caught:
            self.recover()
        self.assertEqual(caught.exception.code, 'resource_ownership')
        self.assertEqual((self.root / 'restore_lease.json').read_bytes(), lease)
        self.assertEqual((self.root / 'restore-offsite-12345678/synthetic').read_bytes(), b'not-a-backup')
        for key, row in before.items():
            self.assertEqual(stable_inspect(self.docker.inspect(*key)), row, 'failclosed_resource_changed')
        # Restore only fixture labels by exact replacement, then clean via v2.
        self.remove_owned('container', self.config['helper'], revoked=True)
        del self.helper_id
        self.helper_id = create_helper(self.docker, self.config)
        self.assert_recovered()

    def remove_owned(self, kind, name, *, revoked=False):
        row = self.docker.inspect(kind, name)
        expected = labels(self.config, foreign=name == self.config['sentinel'], revoked=revoked)
        actual = row['Config']['Labels'] if kind == 'container' else row['Labels']
        require(actual == expected, 'fixture_cleanup_ownership_rejected')
        if kind == 'container':
            require(row['Name'] == '/' + name and re.fullmatch(r'[a-f0-9]{64}', row['Id']),
                    'fixture_cleanup_identity_rejected')
            if hasattr(self, 'helper_id'):
                require(row['Id'] == self.helper_id, 'fixture_cleanup_replaced_helper')
            self.docker.run(kind, 'rm', '--force', row['Id'])
        else:
            require(row['Name'] == name and row['Driver'] == 'local' and not row.get('Options'),
                    'fixture_cleanup_identity_rejected')
            self.docker.run(kind, 'rm', name)

    def cleanup_fixture(self):
        if self.child is not None and self.child.poll() is None:
            self.child.kill()
            self.child.wait(timeout=5)
        if not hasattr(self, 'docker'):
            return
        self.docker.end = time.monotonic() + 30
        failures = []
        # Containers first; never delete resources found by prefix/prune.
        for kind, name in sorted(getattr(self, 'created', ()), key=lambda row: row[0] != 'container'):
            try:
                if self.docker.exists(kind, name):
                    row = self.docker.inspect(kind, name)
                    current = row['Config']['Labels'] if kind == 'container' else row['Labels']
                    self.remove_owned(kind, name, revoked=current.get(PHASE) == 'revoked')
                    require(not self.docker.exists(kind, name), 'fixture_cleanup_resource_remains')
            except Exception:
                failures.append('fixture_exact_cleanup_failed')
        if not failures:
            require(self.root.parent == BASE and self.root.resolve() == self.root and
                    self.root.stat().st_uid == 0 and stat.S_IMODE(self.root.stat().st_mode) == 0o700,
                    'fixture_cleanup_root_rejected')
            require(shutil.rmtree.avoids_symlink_attacks, 'fixture_cleanup_requires_safe_rmtree')
            shutil.rmtree(self.root)
        require(not failures, 'fixture_cleanup_failed_resources_retained')


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == '--fixture-holder':
        require(OPT_IN and sys.platform == 'linux' and os.geteuid() == 0, 'fixture_holder_optin_required')
        holder(Path(sys.argv[2]))
    else:
        unittest.main()
