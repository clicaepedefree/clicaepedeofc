"""Controlled QA log-config rollout. Called with a reviewed payload over nominal SSH."""
import base64
import fcntl
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import subprocess
import socket
import stat
import time
import urllib.request
import uuid

SERVICE = 'clica-evolution-qa_evolution'
ROOT = Path('/var/lib/clicaepede/kan151')
CANONICAL = Path('/opt/clicaepede/kan132')
DEPLOY_SOURCE = Path('/home/brunoops/kan132')
OLD = 'evolution_logs_v3'
NEW = 'evolution_logs_v4_privacy'
TARGET = '/run/configs/start-redacted.cjs'
IMAGE = 'localhost:5001/clicaepede/evolution-api:2.3.7-node24.22.1-security20261022@sha256:4303aaffa99dd1e03a421cb24e3372dc0af07c8258cf82326aab157dd051c98d'
LEGACY_DEPLOY_IMAGE = 'evoapicloud/evolution-api:v2.3.7@sha256:1bd8afc4a6cf48822e6cf02469aeae7bd35a12a6b616eacd1291926307f4d339'
SNAPSHOT_LIMIT = 1024 * 1024
JID = re.compile(rb'(?i)\b[0-9]{5,20}(?:[-:][0-9]{1,20})?@(?:s\.whatsapp\.net|c\.us|lid|g\.us)\b')


def digest(value):
    return hashlib.sha256(value).hexdigest()


def command(args, timeout=60):
    result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            timeout=timeout, check=True)
    return result.stdout


def inspect(args):
    return json.loads(command(args))


def spec_digest(spec):
    return digest(json.dumps(spec, sort_keys=True, separators=(',', ':')).encode())


class DockerConnection(http.client.HTTPConnection):
    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout)
        self.sock.connect('/var/run/docker.sock')


def compare_and_swap_config(service, new_config_id, new_name):
    version = service['Version']['Index']
    assert isinstance(version, int) and version >= 0
    service_id = service['ID']
    assert re.fullmatch(r'[a-z0-9]{25}', service_id)
    spec = json.loads(json.dumps(service['Spec']))
    configs = spec['TaskTemplate']['ContainerSpec']['Configs']
    target = next(c for c in configs if c['File']['Name'] == TARGET)
    target['ConfigID'], target['ConfigName'] = new_config_id, new_name
    api = command(['docker', 'version', '--format', '{{.Server.APIVersion}}']).decode().strip()
    assert re.fullmatch(r'1\.[0-9]{2,3}', api)
    connection = DockerConnection('localhost', timeout=120)
    try:
        connection.request('POST', '/v'+api+'/services/'+service_id+'/update?version='+str(version),
                           json.dumps(spec).encode(), {'Content-Type': 'application/json'})
        response = connection.getresponse()
        response.read(16384)
        assert response.status == 200, 'Service version conflict or update rejected'
    finally:
        connection.close()


def file_identity(metadata):
    # Reads can update atime; only content/ownership/identity changes are drift.
    return tuple(getattr(metadata, name) for name in (
        'st_dev', 'st_ino', 'st_mode', 'st_nlink', 'st_uid', 'st_gid',
        'st_size', 'st_mtime_ns', 'st_ctime_ns'))


def read_snapshot(path):
    assert path.resolve(strict=True) == path
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as stream:
        metadata = os.fstat(stream.fileno())
        assert stat.S_ISREG(metadata.st_mode) and metadata.st_nlink == 1
        assert 0 < metadata.st_size <= SNAPSHOT_LIMIT
        data = stream.read(SNAPSHOT_LIMIT + 1)
        assert len(data) == metadata.st_size and len(data) <= SNAPSHOT_LIMIT
        assert file_identity(os.fstat(stream.fileno())) == file_identity(metadata)
    assert file_identity(path.lstat()) == file_identity(metadata)
    return data, metadata


def recheck_snapshots(snapshots):
    for path, snapshot in snapshots.items():
        data, metadata = read_snapshot(path)
        assert data == snapshot[0] and file_identity(metadata) == file_identity(snapshot[1])


def atomic_file(path, data):
    assert path.parent.is_dir() and path.parent.resolve() == path.parent
    temporary = path.with_name(path.name + '.kan151-' + str(uuid.uuid4()))
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'wb') as target:
        target.write(data)
        target.flush()
        os.fsync(target.fileno())
    os.replace(temporary, path)
    directory = os.open(path.parent, os.O_DIRECTORY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)


def state():
    service = inspect(['docker', 'service', 'inspect', SERVICE])[0]
    ids = command(['docker', 'ps', '-q', '--filter',
                   'label=com.docker.swarm.service.name=' + SERVICE]).decode().split()
    assert len(ids) == 1
    container = inspect(['docker', 'inspect', ids[0]])[0]
    return service, container


def paused(container):
    config = json.loads(Path('/etc/clicaepede/kan135/config.json').read_text())
    assert config['whatsapp_enabled'] is False
    assert command(['systemctl', 'show', 'kan135-whatsapp.timer', '-p', 'ActiveState', '--value']).strip() == b'inactive'
    key = command(['docker', 'exec', container['Id'], 'cat', '/run/secrets/api_key']).decode().strip()

    def get(route):
        request = urllib.request.Request('https://evolution-staging.clicaepede.com.br' + route,
                                         headers={'apikey': key})
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.load(response)

    assert get('/webhook/find/clica-store-9-wa-1')['enabled'] is False
    connection = get('/instance/connectionState/clica-store-9-wa-1')
    assert connection.get('instance', connection)['state'] == 'open'
    return {'provider': 'open', 'webhookEnabled': False, 'workerEnabled': False, 'timer': 'inactive'}


def backup():
    command(['systemctl', 'start', 'kan133-backup.service'], timeout=700)
    assert command(['systemctl', 'show', 'kan133-backup.service', '-p', 'Result', '--value']).strip() == b'success'


def converge(expected_sha):
    end = time.monotonic() + 300
    while time.monotonic() < end:
        try:
            service, container = state()
            assert service['Spec']['TaskTemplate']['ContainerSpec']['Image'] == IMAGE
            assert container['State']['Health']['Status'] == 'healthy'
            assert command(['docker', 'exec', container['Id'], 'node', '--version']).strip() == b'v24.22.1'
            mounted = command(['docker', 'exec', container['Id'], 'cat', TARGET])
            assert digest(mounted) == expected_sha
            pause = paused(container)
            return service, container, pause
        except Exception:
            time.sleep(5)
    raise RuntimeError('Health/session/config did not converge')


def preflight():
    assert os.geteuid() == 0
    for directory in [CANONICAL, CANONICAL.parent, CANONICAL.parent.parent]:
        assert directory.resolve(strict=True) == directory
        stat = directory.stat()
        assert stat.st_uid == 0 and stat.st_mode & 0o022 == 0
    service, container = state()
    spec = service['Spec']['TaskTemplate']['ContainerSpec']
    assert spec['Image'] == IMAGE and service['Spec']['Mode']['Replicated']['Replicas'] == 1
    assert container['State']['Health']['Status'] == 'healthy'
    paused(container)
    help_text = command(['docker', 'service', 'update', '--help'])
    assert all(flag in help_text for flag in [b'--config-add', b'--config-rm', b'--no-resolve-image'])
    return service, container


def probe(source, fixture, run):
    directory = run / 'probe'
    directory.mkdir(mode=0o700)
    secrets = directory / 'secrets'
    secrets.mkdir(mode=0o700)
    for name in ['api_key', 'pg_app_password', 'redis_password']:
        atomic_file(secrets / name, ('KAN151-synthetic-' + name + '-not-a-real-secret-' + 'x'*32).encode())
    atomic_file(directory / 'start-redacted.cjs', source)
    atomic_file(directory / 'fixture.cjs', fixture)
    name = 'kan151-log-probe-' + run.name
    try:
        command(['docker', 'run', '--name', name, '--label', 'kan151.probe=' + run.name,
                 '--pull', 'never', '--network', 'none', '--read-only', '--cap-drop', 'ALL',
                 '--security-opt', 'no-new-privileges:true', '--memory', '192m', '--cpus', '0.25',
                 '--pids-limit', '64', '--log-driver', 'json-file', '--log-opt', 'max-size=1m',
                 '--log-opt', 'max-file=1', '--user', '0:0', '--entrypoint', 'node',
                 '--mount', 'type=bind,src=' + str(directory) + ',dst=/probe,readonly',
                 '--mount', 'type=bind,src=' + str(secrets) + ',dst=/run/secrets,readonly',
                 IMAGE, '/probe/start-redacted.cjs', 'node', '/probe/fixture.cjs'], timeout=120)
        result = subprocess.run(['docker', 'logs', name], stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, timeout=30, check=True)
        for stream in [result.stdout, result.stderr]:
            assert stream and not JID.search(stream)
            assert b'15555550123' not in stream and b'15555550124' not in stream
            assert b'KAN151-synthetic-' not in stream
            assert b'qa151-diagnostic-event' in stream and b'ECONNRESET' in stream
        return {'status': 'PASS', 'stdoutAndStderr': True, 'driver': 'json-file',
                'sourceSha256': digest(source), 'network': 'none', 'rawIdentifierOccurrences': 0}
    finally:
        found = subprocess.run(['docker', 'inspect', name], stdout=subprocess.PIPE,
                               stderr=subprocess.DEVNULL, timeout=30)
        if found.returncode == 0:
            item = json.loads(found.stdout)[0]
            assert item['Config']['Labels'].get('kan151.probe') == run.name
            command(['docker', 'rm', '-f', name])


def apply(payload, source, run):
    assert payload.get('restartApproved') is True
    before, container = preflight()
    assert spec_digest(before['Spec']['TaskTemplate']['ContainerSpec']) == payload['expectedContainerSpecSha256']
    source_path = DEPLOY_SOURCE / 'start-redacted.cjs'
    deploy_stack_path, stack_path = DEPLOY_SOURCE / 'stack.yaml', CANONICAL / 'stack.yaml'
    snapshots = {path: read_snapshot(path) for path in
                 (source_path, deploy_stack_path, stack_path)}
    canonical_metadata = snapshots[stack_path][1]
    assert canonical_metadata.st_uid == 0 and canonical_metadata.st_mode & 0o022 == 0
    old_source, old_stack = snapshots[source_path][0], snapshots[stack_path][0]
    old_deploy_stack = snapshots[deploy_stack_path][0]
    assert digest(old_stack) == payload['expectedStackSha256']
    assert digest(old_deploy_stack) == payload['expectedDeployStackSha256']
    assert digest(old_source) == payload['expectedOldSourceSha256']
    old_config, = [c for c in before['Spec']['TaskTemplate']['ContainerSpec']['Configs'] if c['File']['Name'] == TARGET]
    assert old_config['ConfigName'] == 'clica-evolution-qa_' + OLD
    config = inspect(['docker', 'config', 'inspect', old_config['ConfigID']])[0]
    assert digest(base64.b64decode(config['Spec']['Data'], validate=True)) == digest(old_source)
    stack, deploy_stack = json.loads(old_stack), json.loads(old_deploy_stack)
    assert stack['services']['evolution']['image'] == IMAGE
    comparable = json.loads(old_deploy_stack)
    assert comparable['services']['evolution']['image'] in (IMAGE, LEGACY_DEPLOY_IMAGE)
    comparable['services']['evolution']['image'] = IMAGE
    assert comparable == stack, 'Unreviewed deploy/canonical semantic drift'
    reference, = [c for c in stack['services']['evolution']['configs'] if c['target'] == TARGET]
    assert reference['source'] == OLD and NEW not in stack['configs']
    assert stack['configs'][OLD]['file'] == './start-redacted.cjs'
    reference['source'] = NEW
    stack['configs'][NEW] = stack['configs'].pop(OLD)
    recheck_snapshots(snapshots)
    atomic_file(run / 'service-before-private.json', json.dumps(before).encode())
    atomic_file(run / 'stack-before.yaml', old_stack)
    atomic_file(run / 'deploy-stack-before.yaml', old_deploy_stack)
    atomic_file(run / 'source-before.cjs', old_source)
    recheck_snapshots(snapshots)
    backup()
    recheck_snapshots(snapshots)
    converge(digest(old_source))
    current, _ = preflight()
    assert current['Spec'] == before['Spec']
    recheck_snapshots(snapshots)
    name = 'clica-evolution-qa_' + NEW
    existing = subprocess.run(['docker', 'config', 'inspect', name], stdout=subprocess.PIPE,
                              stderr=subprocess.DEVNULL, timeout=30)
    if existing.returncode == 0:
        assert digest(base64.b64decode(json.loads(existing.stdout)[0]['Spec']['Data'])) == digest(source)
    else:
        staged = run / 'source-reviewed.cjs'
        atomic_file(staged, source)
        command(['docker', 'config', 'create', name, str(staged)])
    new_config = inspect(['docker', 'config', 'inspect', name])[0]
    assert digest(base64.b64decode(new_config['Spec']['Data'])) == digest(source)
    # Re-check all inputs immediately before the version-CAS update.
    checked, _ = preflight()
    assert checked['Version']['Index'] == current['Version']['Index']
    assert checked['Spec'] == current['Spec']
    atomic_file(run / 'rollout-intent.json', json.dumps({'service': SERVICE, 'config': name,
                                                      'sourceSha256': digest(source)}).encode())
    recheck_snapshots(snapshots)
    compare_and_swap_config(checked, new_config['ID'], name)
    recheck_snapshots(snapshots)
    # Root-managed publication: deploy.sh and backup run as root. Never promote
    # the user-writable deploy tree to a trusted reference for nonlogging fields.
    atomic_file(source_path, source)
    updated_stack = (json.dumps(stack, indent=2) + '\n').encode()
    atomic_file(deploy_stack_path, updated_stack)
    atomic_file(stack_path, updated_stack)
    after, active, pause = converge(digest(source))
    protected_before = dict(before['Spec']['TaskTemplate']['ContainerSpec'])
    protected_after = dict(after['Spec']['TaskTemplate']['ContainerSpec'])
    protected_before.pop('Configs'); protected_after.pop('Configs')
    assert protected_before == protected_after
    backup()
    after, active, pause = converge(digest(source))
    logs = subprocess.run(['docker', 'logs', '--tail', '10000', active['Id']],
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30, check=True)
    assert not JID.search(logs.stdout + logs.stderr)
    return {'status': 'PASS', 'sourceSha256': digest(source), 'imageUnchanged': True,
            'protectedContainerSpecUnchanged': True, 'health': 'healthy', 'node': 'v24.22.1',
            'encryptedOffsiteBackupBeforeAndAfter': 'success', 'pause': pause,
            'newContainerRawJidOccurrences': 0, 'historicalLogsDeleted': False,
            'rollback': 'Previous config retained; original files snapshotted root-only; no automatic unredacted fallback'}


def run_payload(payload):
    os.umask(0o077)
    ROOT.mkdir(mode=0o700, parents=True, exist_ok=True)
    run = ROOT / str(uuid.uuid4())
    run.mkdir(mode=0o700)
    try:
        with open(ROOT / 'maintenance.lock', 'a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            assert payload['phase'] in ['probe', 'apply']
            source = base64.b64decode(payload['sourceBase64'], validate=True)
            fixture = base64.b64decode(payload['fixtureBase64'], validate=True)
            assert digest(source) == payload['sourceSha256'] and 0 < len(source) <= 256*1024
            assert 0 < len(fixture) <= 16*1024
            preflight()
            result = {'probe': probe(source, fixture, run)}
            if payload['phase'] == 'apply':
                result['rollout'] = apply(payload, source, run)
            result['run'] = run.name
            atomic_file(run / 'result-sanitized.json', json.dumps(result).encode())
            print(json.dumps(result))
    except BaseException as error:
        result = {'status': 'FAILED', 'class': type(error).__name__, 'run': run.name,
                  'automaticRollback': False}
        atomic_file(run / 'failure-sanitized.json', json.dumps(result).encode())
        print(json.dumps(result))
        raise SystemExit(1)
