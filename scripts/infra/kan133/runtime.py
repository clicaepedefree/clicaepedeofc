"""Fail-closed ownership contract. No deployment; private bytes never logged."""
import contextlib
import hashlib
import json
import os
from pathlib import Path
import re
import stat

ROOT = Path('/etc/clicaepede/kan140')
MANIFEST = ROOT / 'ownership.json'
SENTINEL = ROOT / 'managed'
ROLES = ('postgres', 'redis', 'evolution')
VOLUMES = dict(zip(ROLES, ('kan140_qa_postgres_data', 'kan140_qa_redis_data',
                          'kan140_qa_evolution_instances')))
TARGETS = dict(zip(ROLES, ('/var/lib/postgresql/data', '/data', '/evolution/instances')))
CONFIG_FILES = {'postgres_init_v2': 'postgres-init.sh',
                'redis_entrypoint_v1': 'redis-entrypoint.sh',
                'evolution_entrypoint_v1': 'evolution-entrypoint.sh',
                'evolution_logs_v4_privacy': 'start-redacted.cjs'}
SECRET_FILES = {'pg_admin_password': 'pg_admin', 'pg_app_password': 'pg_app',  # secret-scan: allow-test - file-name mapping only, no credential values
                'redis_password': 'redis', 'api_key': 'api'}
_lock_depth = 0


class OwnershipError(Exception):
    def __init__(self):
        super().__init__('ownership-rejected')


def require(value):
    if not value:
        raise OwnershipError()


def fenced():
    return os.path.lexists(MANIFEST) or os.path.lexists(SENTINEL)


def file_identity(info):
    # Reading under relatime can change atime; it is not content/ownership drift.
    return tuple(getattr(info, name) for name in (
        'st_dev', 'st_ino', 'st_mode', 'st_uid', 'st_gid', 'st_nlink',
        'st_size', 'st_mtime_ns', 'st_ctime_ns'))


def trusted_bytes(path, *, mount_source=False):
    path = Path(path)
    require(path.is_absolute() and path.resolve(strict=True) == path)
    for parent in path.parents:
        info = parent.lstat()
        require(stat.S_ISDIR(info.st_mode) and info.st_uid == 0 and not info.st_mode & 0o022)
    if mount_source:
        # Readable inside the container, inaccessible to host users by traversal.
        require(stat.S_IMODE(path.parent.lstat().st_mode) == 0o700)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as source:
        before = os.fstat(source.fileno())
        require(stat.S_ISREG(before.st_mode) and before.st_uid == 0
                and stat.S_IMODE(before.st_mode) == (0o444 if mount_source else 0o600)
                and before.st_nlink == 1
                and 0 < before.st_size <= 1024 * 1024)
        data = source.read(1024 * 1024 + 1)
        after = os.fstat(source.fileno())
        require(file_identity(before) == file_identity(after)
                and file_identity(path.lstat()) == file_identity(after)
                and len(data) == before.st_size)
        return data


def json_object(raw):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            require(key not in result)
            result[key] = value
        return result
    return json.loads(raw, object_pairs_hook=unique)


def load():
    """None means legacy has never been fenced; all other invalid states reject."""
    try:
        if not fenced():
            return None
        sentinel = json_object(trusted_bytes(SENTINEL))
        raw = trusted_bytes(MANIFEST)
        value = json_object(raw)
        require(isinstance(value, dict) and set(value) == {
            'schema', 'state', 'runtime', 'generation', 'project', 'source',
            'services', 'volumes', 'mount_hashes'})
        require(type(value['schema']) is int and value['schema'] == 1
                and value['state'] == 'active' and value['runtime'] == 'compose')
        require(type(value['generation']) is int and 1 <= value['generation'] <= 2147483647)
        require(isinstance(sentinel, dict) and type(sentinel.get('schema')) is int
                and type(sentinel.get('generation')) is int
                and sentinel == {'schema': 1, 'generation': value['generation']})
        require(isinstance(value['project'], str) and
                re.fullmatch(r'[a-z0-9][a-z0-9_-]{0,62}', value['project']))
        require(value['volumes'] == VOLUMES and set(value['services']) == set(ROLES))
        for image in value['services'].values():
            require(isinstance(image, str) and re.fullmatch(r'[^\s@$]+@sha256:[a-f0-9]{64}', image))
        source = value['source']
        require(isinstance(source, dict) and set(source) == {'path', 'sha256'})
        require(source['path'] == str(ROOT / 'compose.json') and
                re.fullmatch(r'[a-f0-9]{64}', source['sha256']))
        source_raw = trusted_bytes(source['path'])
        require(hashlib.sha256(source_raw).hexdigest() == source['sha256'])
        compose = json_object(source_raw)
        require(set(compose['services']) == set(ROLES))
        for role in ROLES:
            service = compose['services'][role]
            require(service['image'] == value['services'][role])
            require(service['labels']['clicaepede.owner'] == 'easypanel-compose-qa'
                    and service['labels']['clicaepede.generation'] == str(value['generation']))
            volume = role if role in compose['volumes'] else {
                'postgres': 'postgres_data', 'redis': 'redis_data',
                'evolution': 'evolution_instances'}[role]
            require(compose['volumes'][volume] == {'external': True, 'name': VOLUMES[role]})
            require(service['volumes'] == [volume + ':' + TARGETS[role]])
        expected_configs = {name: {'file': str(ROOT / 'configs' / filename)}
                            for name, filename in CONFIG_FILES.items()}
        expected_secrets = {name: {'file': str(ROOT / 'mount-secrets' / filename)}
                            for name, filename in SECRET_FILES.items()}
        require(compose.get('configs') == expected_configs and
                compose.get('secrets') == expected_secrets)
        paths = {item['file'] for item in (*expected_configs.values(), *expected_secrets.values())}
        require(isinstance(value['mount_hashes'], dict) and set(value['mount_hashes']) == paths)
        for path, digest in value['mount_hashes'].items():
            require(isinstance(digest, str) and re.fullmatch(r'[a-f0-9]{64}', digest))
            require(hashlib.sha256(trusted_bytes(Path(path), mount_source=True)).hexdigest() == digest)
        return value
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        raise OwnershipError() from None


@contextlib.contextmanager
def mutation_scope():
    """Only enter while holding kan133/backup.lock; shared by backup.lock owner."""
    global _lock_depth
    _lock_depth += 1
    try:
        yield
    finally:
        _lock_depth -= 1


class Runtime:
    def __init__(self, executor):
        self.executor = executor
        self.owner = load()

    def revalidate(self, mutation=False):
        require(not mutation or _lock_depth > 0)
        require(load() == self.owner)

    def marker_binding(self):
        self.revalidate()
        require(self.owner is not None)
        return {'generation': self.owner['generation'], 'project': self.owner['project'],
                'source_sha256': self.owner['source']['sha256']}

    def containers(self, role):
        self.revalidate()
        require(self.owner is not None and role in ROLES)
        ids = self.executor.run(['docker', 'ps', '-aq', '--no-trunc', '--filter',
                                'label=com.docker.compose.project=' + self.owner['project'],
                                '--filter', 'label=com.docker.compose.service=' + role]).split()
        require(len(ids) == 1 and re.fullmatch(r'[a-f0-9]{64}', ids[0]))
        items = self.executor.docker_json('inspect', ids[0])
        require(len(items) == 1)
        item = items[0]
        require(item['Id'] == ids[0] and item['Config']['Image'] == self.owner['services'][role])
        labels = item['Config']['Labels']
        require(labels.get('com.docker.compose.project') == self.owner['project']
                and labels.get('com.docker.compose.service') == role
                and labels.get('com.docker.compose.oneoff', 'False').lower() == 'false'
                and not labels.get('com.docker.swarm.service.name')
                and labels.get('clicaepede.owner') == 'easypanel-compose-qa'
                and labels.get('clicaepede.generation') == str(self.owner['generation']))
        mounts = [m for m in item['Mounts'] if m['Destination'] == TARGETS[role]]
        require(len(mounts) == 1 and mounts[0]['Type'] == 'volume'
                and mounts[0]['Name'] == VOLUMES[role] and mounts[0].get('RW') is True)
        return items

    def legacy_running(self):
        names = self.executor.run([
            'docker', 'service', 'ls', '--filter',
            'label=com.docker.stack.namespace=clica-evolution-qa', '--format', '{{.Name}}']).split()
        expected = {'clica-evolution-qa_' + role for role in ROLES}
        require(len(names) == len(set(names)) and set(names) <= expected)
        desired = False
        if names:
            services = self.executor.docker_json('service', 'inspect', *names)
            require(isinstance(services, list) and len(services) == len(names))
            seen = set()
            for service in services:
                spec = service.get('Spec', {})
                require(spec.get('Name') in names and spec['Name'] not in seen)
                seen.add(spec['Name'])
                mode = spec.get('Mode', {})
                require(isinstance(mode, dict) and set(mode) == {'Replicated'})
                replicas = mode['Replicated'].get('Replicas')
                require(type(replicas) is int and replicas >= 0)
                desired = desired or replicas > 0
        ids = self.executor.run(['docker', 'ps', '-q', '--filter',
                                'label=com.docker.stack.namespace=clica-evolution-qa']).split()
        return desired or bool(ids)

    def mutate_app(self, running, container_id):
        self.revalidate(mutation=True)
        require(not self.legacy_running())
        item = self.containers('evolution')[0]
        require(item['Id'] == container_id)
        self.revalidate(mutation=True)
        self.executor.run(['docker', 'start' if running else 'stop', container_id])


def publish(value):
    """Future reviewed installer only: sentinel first, durable, never removed.

    A failed publication deliberately leaves a fence. No runtime deployment here.
    Caller holds backup.lock and has staged root-only compose.json/configs first.
    """
    require(_lock_depth > 0 and os.geteuid() == 0)
    require(type(value.get('generation')) is int and value['generation'] > 0)
    for directory in (ROOT, *ROOT.parents):
        info = directory.lstat()
        require(directory.resolve(strict=True) == directory and stat.S_ISDIR(info.st_mode)
                and info.st_uid == 0 and not info.st_mode & 0o022)
    if os.path.lexists(SENTINEL):
        previous = json_object(trusted_bytes(SENTINEL))
        require(value['generation'] > previous['generation'])
    import tempfile
    for path, data in ((SENTINEL, {'schema': 1, 'generation': value['generation']}),
                       (MANIFEST, value)):
        fd, name = tempfile.mkstemp(prefix='.ownership-', dir=ROOT)
        try:
            with os.fdopen(fd, 'w') as output:
                os.fchmod(output.fileno(), 0o600)
                json.dump(data, output, separators=(',', ':'))
                output.flush()
                os.fsync(output.fileno())
            os.replace(name, path)
            directory = os.open(ROOT, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(directory)
            finally:
                os.close(directory)
        finally:
            if os.path.lexists(name):
                os.unlink(name)
    load()
