"""Fail-closed ownership contract. No deployment; private bytes never logged."""
import contextlib
import copy
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
SWARM_PROJECT = 'clica-evolution-qa'
SWARM_VOLUMES = dict(zip(ROLES, ('kan140_rollback_postgres_data',
                               'kan140_rollback_redis_data',
                               'kan140_rollback_evolution_instances')))
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


def spec_hash(spec):
    """Canonical Docker ContainerSpec digest used by the installer contract."""
    return hashlib.sha256(json.dumps(spec, sort_keys=True, separators=(',', ':'),
                                     ensure_ascii=True).encode('ascii')).hexdigest()


def normalized_task_spec(spec):
    """Docker can omit these exact defaults when materializing a service task."""
    require(isinstance(spec, dict) and isinstance(spec.get('ContainerSpec'), dict))
    normalized = copy.deepcopy(spec)
    normalized.setdefault('Runtime', 'container')
    require(normalized['Runtime'] == 'container')
    normalized.setdefault('RestartPolicy', {'Condition': 'any', 'Delay': 5000000000,
                                            'MaxAttempts': 0})
    restart = normalized['RestartPolicy']
    require(isinstance(restart, dict) and restart.get('Condition') in ('none', 'any', 'on-failure'))
    for key in ('Delay', 'MaxAttempts', 'Window'):
        require(key not in restart or (type(restart[key]) is int and restart[key] >= 0))
    container = normalized['ContainerSpec']
    container.setdefault('DNSConfig', {})
    container.setdefault('StopGracePeriod', 10000000000)
    require(isinstance(container['DNSConfig'], dict)
            and type(container['StopGracePeriod']) is int and container['StopGracePeriod'] >= 0)
    return normalized


def swarm_source(owner):
    raw = trusted_bytes(owner['source']['path'])
    require(hashlib.sha256(raw).hexdigest() == owner['source']['sha256'])
    source = json_object(raw)
    require(isinstance(source, dict) and set(source) == {'project', 'services'}
            and source['project'] == SWARM_PROJECT
            and set(source['services']) == set(ROLES))
    require(set(owner['swarm_services']) == set(ROLES) and owner['mount_hashes'] == {})
    ids = set()
    for role in ROLES:
        pin = owner['swarm_services'][role]
        require(isinstance(pin, dict) and set(pin) == {'service_id', 'container_spec_sha256'}
                and re.fullmatch(r'[a-z0-9]{25}', pin['service_id'])
                and re.fullmatch(r'[a-f0-9]{64}', pin['container_spec_sha256'])
                and pin['service_id'] not in ids)
        ids.add(pin['service_id'])
        entry = source['services'][role]
        require(set(entry) == {'service_id', 'spec'} and entry['service_id'] == pin['service_id'])
        spec = entry['spec']
        require(spec['Name'] == SWARM_PROJECT + '_' + role
                and spec['Labels']['com.docker.stack.namespace'] == SWARM_PROJECT
                and set(spec['Mode']) == {'Replicated'}
                and set(spec['Mode']['Replicated']) == {'Replicas'}
                and type(spec['Mode']['Replicated']['Replicas']) is int
                and spec['Mode']['Replicated']['Replicas'] in (0, 1))
        container = spec['TaskTemplate']['ContainerSpec']
        require(spec_hash(container) == pin['container_spec_sha256']
                and container['Image'] == owner['services'][role])
        mounts = container['Mounts']
        require(isinstance(mounts, list) and len(mounts) == 1
                and mounts[0]['Type'] == 'volume' and mounts[0]['Source'] == SWARM_VOLUMES[role]
                and mounts[0]['Target'] == TARGETS[role] and mounts[0].get('ReadOnly', False) is False)
        for kind, key in (('Secrets', 'SecretID'), ('Configs', 'ConfigID')):
            refs = container.get(kind, [])
            require(isinstance(refs, list))
            for ref in refs:
                require(re.fullmatch(r'[a-z0-9]{25}', ref[key]) is not None)
    return source


def validate_handoff(owner):
    pin = owner['handoff']
    require(isinstance(pin, dict) and set(pin) == {'path', 'sha256'}
            and pin['path'] == str(ROOT / 'compose-disabled.json')
            and re.fullmatch(r'[a-f0-9]{64}', pin['sha256']))
    raw = trusted_bytes(pin['path'])
    require(hashlib.sha256(raw).hexdigest() == pin['sha256'])
    receipt = json_object(raw)
    require(type(receipt.get('schema')) is int and type(receipt.get('generation')) is int
            and receipt.get('compose_controller_disabled') is True)
    require(receipt == {
        'schema': 1, 'generation': owner['generation'], 'runtime': 'swarm',
        'project': owner['project'], 'source_sha256': owner['source']['sha256'],
        'compose_controller_disabled': True})


def load():
    """None means legacy has never been fenced; all other invalid states reject."""
    try:
        if not fenced():
            return None
        sentinel = json_object(trusted_bytes(SENTINEL))
        raw = trusted_bytes(MANIFEST)
        value = json_object(raw)
        require(isinstance(value, dict))
        fields = {
            'schema', 'state', 'runtime', 'generation', 'project', 'source',
            'services', 'volumes', 'mount_hashes'}
        if value.get('runtime') == 'swarm':
            fields |= {'swarm_services', 'handoff'}
        require(set(value) == fields)
        require(type(value['schema']) is int and value['schema'] == 1
                and value['state'] == 'active' and value['runtime'] in ('compose', 'swarm'))
        require(type(value['generation']) is int and 1 <= value['generation'] <= 2147483647)
        require(isinstance(sentinel, dict) and type(sentinel.get('schema')) is int
                and type(sentinel.get('generation')) is int
                and sentinel == {'schema': 1, 'generation': value['generation']})
        require(isinstance(value['project'], str) and
                re.fullmatch(r'[a-z0-9][a-z0-9_-]{0,62}', value['project']))
        swarm = value['runtime'] == 'swarm'
        require(value['volumes'] == (SWARM_VOLUMES if swarm else VOLUMES)
                and set(value['services']) == set(ROLES))
        for image in value['services'].values():
            require(isinstance(image, str) and re.fullmatch(r'[^\s@$]+@sha256:[a-f0-9]{64}', image))
        source = value['source']
        require(isinstance(source, dict) and set(source) == {'path', 'sha256'})
        require(source['path'] == str(ROOT / ('swarm.json' if swarm else 'compose.json')) and
                re.fullmatch(r'[a-f0-9]{64}', source['sha256']))
        if swarm:
            require(value['project'] == SWARM_PROJECT)
            swarm_source(value)
            validate_handoff(value)
            return value
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
        return {'generation': self.owner['generation'], 'runtime': self.owner['runtime'],
                'project': self.owner['project'],
                'source_sha256': self.owner['source']['sha256']}

    def service(self, role):
        self.revalidate()
        require(self.owner is not None and self.owner['runtime'] == 'swarm' and role in ROLES)
        entry = swarm_source(self.owner)['services'][role]
        items = self.executor.docker_json('service', 'inspect', entry['service_id'])
        require(len(items) == 1 and items[0]['ID'] == entry['service_id'])
        actual = copy.deepcopy(items[0]['Spec'])
        replicas = actual['Mode']['Replicated']['Replicas']
        require(type(replicas) is int and replicas in (0, 1))
        expected = copy.deepcopy(entry['spec'])
        expected['Mode']['Replicated']['Replicas'] = replicas
        require(actual == expected)
        return items[0]

    def tasks(self, role):
        service = self.service(role)
        ids = self.executor.run(['docker', 'service', 'ps', '-q', '--no-trunc', service['ID']]).split()
        require(len(ids) == len(set(ids)) and all(re.fullmatch(r'[a-z0-9]{25}', x) for x in ids))
        items = self.executor.docker_json('inspect', '--type', 'task', *ids) if ids else []
        require(len(items) == len(ids) and {t['ID'] for t in items} == set(ids))
        terminal = {'complete', 'shutdown', 'failed', 'rejected', 'remove', 'orphaned'}
        for task in items:
            require(task['ServiceID'] == service['ID'])
            if task['Status']['State'] not in terminal and task['DesiredState'] == 'running':
                require(normalized_task_spec(task['Spec']) ==
                        normalized_task_spec(service['Spec']['TaskTemplate']))
        return [t for t in items if t['Status']['State'] not in terminal]

    def running_ids(self, role):
        service = self.service(role)
        ids = self.executor.run(['docker', 'ps', '-q', '--no-trunc', '--filter',
                                'label=com.docker.swarm.service.id=' + service['ID']]).split()
        require(len(ids) == len(set(ids)) and all(re.fullmatch(r'[a-f0-9]{64}', cid) for cid in ids))
        return set(ids)

    def writable_mounts(self):
        """No foreign writable attachment, including a stopped auto-restart writer."""
        self.revalidate()
        require(self.owner is not None)
        for role, volume in self.owner['volumes'].items():
            ids = self.executor.run(['docker', 'ps', '-aq', '--no-trunc', '--filter',
                                     'volume=' + volume]).split()
            require(all(re.fullmatch(r'[a-f0-9]{64}', cid) for cid in ids))
            items = self.executor.docker_json('inspect', *ids) if ids else []
            require(len(items) == len(ids))
            writers = []
            for item in items:
                if not any(m.get('Name') == volume and m.get('RW') is True
                           for m in item['Mounts']):
                    continue
                if not (item['State']['Running'] or item['State'].get('Restarting')
                        or item['HostConfig']['RestartPolicy']['Name'] != 'no'):
                    continue
                labels = item['Config']['Labels']
                if self.owner['runtime'] == 'swarm':
                    require(labels.get('com.docker.swarm.service.id') ==
                            self.owner['swarm_services'][role]['service_id'])
                else:
                    require(labels.get('com.docker.compose.project') == self.owner['project']
                            and labels.get('com.docker.compose.service') == role)
                writers.append(item['Id'])
            require(len(writers) <= 1)
        self.revalidate()

    def containers(self, role):
        self.revalidate()
        require(self.owner is not None and role in ROLES)
        if self.owner['runtime'] == 'swarm':
            tasks = self.tasks(role)
            local = self.executor.run(['docker', 'info', '--format', '{{.Swarm.NodeID}}']).strip()
            result = []
            for task in tasks:
                if task['DesiredState'] != 'running':
                    continue
                cid = task['Status'].get('ContainerStatus', {}).get('ContainerID')
                if not cid:
                    require(task['Status']['State'] != 'running')
                    continue
                require(task['NodeID'] == local)
                require(re.fullmatch(r'[a-f0-9]{64}', cid))
                items = self.executor.docker_json('inspect', cid)
                require(len(items) == 1)
                item = items[0]
                labels = item['Config']['Labels']
                require(item['Id'] == cid and item['Config']['Image'] == self.owner['services'][role]
                        and labels.get('com.docker.swarm.service.id') == task['ServiceID']
                        and labels.get('com.docker.swarm.task.id') == task['ID']
                        and labels.get('com.docker.stack.namespace') == SWARM_PROJECT
                        and not labels.get('com.docker.compose.project'))
                mounts = [m for m in item['Mounts'] if m['Destination'] == TARGETS[role]]
                require(len(mounts) == 1 and mounts[0]['Type'] == 'volume'
                        and mounts[0]['Name'] == SWARM_VOLUMES[role] and mounts[0].get('RW') is True)
                require(not any(m.get('RW') and m['Destination'] != TARGETS[role]
                                and m['Type'] in ('bind', 'volume') for m in item['Mounts']))
                result.append(item)
            require(len(result) <= 1)
            return result
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
            'label=com.docker.stack.namespace=' + SWARM_PROJECT, '--format', '{{.Name}}']).split()
        expected = {SWARM_PROJECT + '_' + role for role in ROLES}
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
                                'label=com.docker.stack.namespace=' + SWARM_PROJECT]).split()
        return desired or bool(ids)

    def other_runtime_running(self):
        self.revalidate()
        if self.owner['runtime'] == 'compose':
            return self.legacy_running()
        validate_handoff(self.owner)
        ids = self.executor.run(['docker', 'ps', '-aq', '--no-trunc', '--filter',
                                'label=clicaepede.owner=easypanel-compose-qa']).split()
        require(all(re.fullmatch(r'[a-f0-9]{64}', cid) for cid in ids))
        items = self.executor.docker_json('inspect', *ids) if ids else []
        require(len(items) == len(ids))
        return any(item['State']['Running'] or item['State'].get('Restarting')
                   or item['HostConfig']['RestartPolicy']['Name'] != 'no' for item in items)

    def mutate_app(self, running, container_id):
        self.revalidate(mutation=True)
        require(type(running) is bool and not self.other_runtime_running())
        if self.owner['runtime'] == 'swarm':
            service = self.service('evolution')
            require(container_id == service['ID'])
            self.writable_mounts()
            self.revalidate(mutation=True)
            self.executor.run(['docker', 'service', 'scale', '--detach=true',
                               service['ID'] + '=' + str(int(running))])
            return
        self.writable_mounts()
        item = self.containers('evolution')[0]
        require(item['Id'] == container_id)
        self.revalidate(mutation=True)
        self.executor.run(['docker', 'start' if running else 'stop', container_id])


def publish(value):
    """Future reviewed installer only: sentinel first, durable, never removed.

    A failed publication deliberately leaves a fence. No runtime deployment here.
    Caller holds backup.lock and has staged the trusted backend source first.
    """
    require(_lock_depth > 0 and os.geteuid() == 0)
    require(type(value.get('generation')) is int and 1 <= value['generation'] <= 2147483647)
    for directory in (ROOT, *ROOT.parents):
        info = directory.lstat()
        require(directory.resolve(strict=True) == directory and stat.S_ISDIR(info.st_mode)
                and info.st_uid == 0 and not info.st_mode & 0o022)
    require(not os.path.lexists(MANIFEST) or os.path.lexists(SENTINEL))
    if os.path.lexists(SENTINEL):
        previous = json_object(trusted_bytes(SENTINEL))
        require(isinstance(previous, dict) and set(previous) == {'schema', 'generation'}
                and type(previous['schema']) is int and previous['schema'] == 1
                and type(previous['generation']) is int and previous['generation'] > 0)
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
