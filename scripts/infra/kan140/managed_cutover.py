"""Controlled KAN140 migration helpers. Private state never includes panel login.

Staging does not stop services, deploy a controller or publish ownership.
"""
import base64
import hashlib
import hmac
import json
import os
from pathlib import Path
import stat
import subprocess
import time

import compose_plan

ROOT = Path('/etc/clicaepede/kan140')
STACK = Path('/opt/clicaepede/kan132/stack.yaml')
STACK_SHA = '03f48f5cd3d1a11ea766754bb369d72ceff4e6524bff46263298a6bd652d28d1'
ORIGINALS = Path('/etc/clicaepede/evolution-qa/secrets')
ROLES = ('postgres', 'redis', 'evolution')
OLD_VOLUMES = dict(zip(ROLES, ('clica-evolution-qa_postgres_data',
                              'clica-evolution-qa_redis_data',
                              'clica-evolution-qa_evolution_instances')))
DESTINATIONS = dict(zip(ROLES, ('/var/lib/postgresql/data', '/data', '/evolution/instances')))
CONFIG_TARGETS = {'/docker-entrypoint-initdb.d/kan132-init.sh': 'postgres-init.sh',
                  '/run/configs/redis-entrypoint.sh': 'redis-entrypoint.sh',
                  '/run/configs/evolution-entrypoint.sh': 'evolution-entrypoint.sh',
                  '/run/configs/start-redacted.cjs': 'start-redacted.cjs'}
CONFIG_ROLES = {'postgres': {'/docker-entrypoint-initdb.d/kan132-init.sh'},
                'redis': {'/run/configs/redis-entrypoint.sh'},
                'evolution': {'/run/configs/evolution-entrypoint.sh', '/run/configs/start-redacted.cjs'}}
CONFIG_PINS = {
    'postgres-init.sh': 'a7b0327fc95e0613c6a9f894babdcfa5f6e83c73b4ef683004a5ea17c158a753',
    'redis-entrypoint.sh': '8c164b4374bc24d9b62a41ccbf6652fb80ddfa5a9791e4a8be87d415cd3e1037',
    'evolution-entrypoint.sh': 'd57741d1a609fc5e054df8db070865c79b51965bb3dfd8bbe00157c4629fbe66',
    'start-redacted.cjs': '20ea629a1b3f6b21693919d324cafacb6157046aa6cc77f8647b98f8c6f46cef',
}


class Rejected(Exception):
    pass


def require(value, code):
    if not value:
        raise Rejected(code)


class Docker:
    def __init__(self, config, seconds=600):
        self.config = Path(config)
        self.end = time.monotonic() + seconds

    def run(self, *args, stdin=None, check=True):
        remaining = self.end - time.monotonic()
        require(remaining > 0, 'docker-deadline')
        env = {k: v for k, v in os.environ.items() if not k.startswith('DOCKER_')}
        result = subprocess.run(['docker', '--host', 'unix:///var/run/docker.sock',
                                 '--config', str(self.config), *args], input=stdin,
                                capture_output=True, timeout=min(30, remaining), env=env)
        require(len(result.stdout) <= 8 * 1024 * 1024, 'docker-response-limit')
        if check:
            require(result.returncode == 0, 'docker-command-rejected')
        return result

    def data(self, *args):
        return json.loads(self.run(*args).stdout)


def directory(path):
    path.mkdir(mode=0o700, exist_ok=True)
    require(path.resolve(strict=True) == path, 'private-path')
    for parent in (path, *path.parents):
        info = parent.lstat()
        require(stat.S_ISDIR(info.st_mode) and info.st_uid == 0 and not info.st_mode & 0o022,
                'private-parent')
    require(stat.S_IMODE(path.stat().st_mode) == 0o700, 'private-directory')


def read_private(path):
    require(path.resolve(strict=True) == path, 'private-file-path')
    for parent in path.parents:
        info = parent.lstat()
        require(stat.S_ISDIR(info.st_mode) and info.st_uid == 0 and not info.st_mode & 0o022,
                'private-file-parent')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as stream:
        info = os.fstat(stream.fileno())
        require(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and info.st_nlink == 1
                and stat.S_IMODE(info.st_mode) == 0o600 and info.st_size <= 1024 * 1024,
                'private-file')
        identity = lambda value: tuple(getattr(value, key, None) for key in (
            'st_dev', 'st_ino', 'st_mode', 'st_uid', 'st_gid', 'st_nlink',
            'st_size', 'st_mtime_ns', 'st_ctime_ns'))
        data = stream.read(1024 * 1024 + 1)
        require(identity(info) == identity(os.fstat(stream.fileno())) == identity(path.lstat())
                and len(data) == info.st_size, 'private-file-drift')
        return data


def write_new(path, value, mode=0o600):
    require(isinstance(value, bytes) and 0 < len(value) <= 1024 * 1024, 'private-write-size')
    if os.path.lexists(path):
        info = path.lstat()
        require(path.resolve(strict=True) == path and stat.S_ISREG(info.st_mode) and
                info.st_uid == 0 and info.st_nlink == 1 and stat.S_IMODE(info.st_mode) == mode
                and hmac.compare_digest(path.read_bytes(), value), 'staged-file-drift')
        return
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
    with os.fdopen(fd, 'wb') as stream:
        os.fchmod(stream.fileno(), mode)
        stream.write(value)
        stream.flush()
        os.fsync(stream.fileno())
    parent = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(parent)
    finally:
        os.close(parent)


def baseline(docker):
    raw = read_private(STACK)
    plan = compose_plan.build_plan(raw, STACK_SHA, 2)
    records = {}
    for role in ROLES:
        name = 'clica-evolution-qa_' + role
        services = docker.data('service', 'inspect', name)
        require(len(services) == 1, 'legacy-service-count')
        service = services[0]
        spec = service['Spec']
        require(spec['Name'] == name and spec['Mode'] == {'Replicated': {'Replicas': 1}}
                and spec['TaskTemplate']['ContainerSpec']['Image'] == plan['compose']['services'][role]['image'],
                'legacy-service-drift')
        mounts = spec['TaskTemplate']['ContainerSpec']['Mounts']
        require(len(mounts) == 1 and mounts[0]['Type'] == 'volume'
                and mounts[0]['Source'] == OLD_VOLUMES[role] and mounts[0]['Target'] == DESTINATIONS[role]
                and mounts[0].get('ReadOnly', False) is False, 'legacy-volume-drift')
        ids = docker.run('ps', '-q', '--no-trunc', '--filter',
                         'label=com.docker.swarm.service.id=' + service['ID']).stdout.decode().split()
        require(len(ids) == 1, 'legacy-container-count')
        containers = docker.data('inspect', ids[0])
        require(len(containers) == 1 and containers[0]['State']['Health']['Status'] == 'healthy',
                'legacy-unhealthy')
        records[role] = {'service': service, 'container_id': ids[0]}
    return plan['compose'], records


def stage_mounts(docker):
    require(not any(os.path.lexists(ROOT / name) for name in ('managed', 'ownership.json')),
            'already-managed')
    compose, records = baseline(docker)
    directory(ROOT)
    directory(ROOT / 'configs')
    directory(ROOT / 'mount-secrets')
    contents = {}
    for role in ROLES:
        references = records[role]['service']['Spec']['TaskTemplate']['ContainerSpec'].get('Configs', [])
        require(len(references) == len(CONFIG_ROLES[role]) and
                {ref['File']['Name'] for ref in references} == CONFIG_ROLES[role], 'config-role-drift')
        for reference in references:
            target = reference['File']['Name']
            require(target in CONFIG_TARGETS and CONFIG_TARGETS[target] not in contents,
                    'unexpected-config-reference')
            data = docker.data('config', 'inspect', reference['ConfigID'])
            require(len(data) == 1 and data[0]['ID'] == reference['ConfigID'], 'config-identity')
            value = base64.b64decode(data[0]['Spec']['Data'], validate=True)
            filename = CONFIG_TARGETS[target]
            require(hashlib.sha256(value.replace(b'\r\n', b'\n')).hexdigest() == CONFIG_PINS[filename],
                    'unapproved-config-source')
            contents[filename] = value
    require(set(contents) == set(CONFIG_TARGETS.values()), 'missing-config-reference')
    mount_hashes = {}
    for filename, value in contents.items():
        path = ROOT / 'configs' / filename
        write_new(path, value, 0o444)
        mount_hashes[str(path)] = hashlib.sha256(value).hexdigest()
    for secret, filename in compose_plan.SECRET_FILES.items():
        role = 'postgres' if secret == 'pg_admin_password' else 'evolution'
        value = read_private(ORIGINALS / filename)
        observed = docker.run('exec', records[role]['container_id'], 'cat', '/run/secrets/' + secret).stdout
        require(hmac.compare_digest(value, observed), 'secret-copy-mismatch')
        path = ROOT / 'mount-secrets' / filename
        write_new(path, value, 0o444)
        mount_hashes[str(path)] = hashlib.sha256(value).hexdigest()
    raw = json.dumps(compose, sort_keys=True, separators=(',', ':')).encode()
    write_new(ROOT / 'compose.json', raw)
    return {'schema': 1, 'generation': 2, 'compose': compose, 'records': records,
            'mount_hashes': mount_hashes, 'source_sha256': hashlib.sha256(raw).hexdigest(),
            'services_restarted': False, 'ownership_published': False}
