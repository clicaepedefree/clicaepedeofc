#!/usr/bin/env python3
"""Reconcile one durable restore lease under the shared backup lock.

The wrapper must set tempfile.tempdir = str(backup.ROOT) before constructing
Validator. Both its secret directory and offsite staging then remain recoverable
even if killed before the first container was created. No /tmp sweep or prune.
"""
import json
import os
from pathlib import Path
import re
import shutil
import signal
import stat
import subprocess
import sys
import time

import backup

LABEL = 'clicaepede.kan133.restore'
OWNER = r'kan133-restore-[a-f0-9]{32}'
SUFFIX = r'[a-z0-9_]{8}'
SECONDS = 60
SERVICES = ('postgres', 'redis', 'evolution')
SECRETS = ('pg_admin_password', 'pg_app_password', 'redis_password', 'api_key')
SCHEMA = 'kan140-latest-return'
MAX_LEASE = 16384
MAX_HELPERS = 12
HELPER = r'kan140-transfer-([a-f0-9]{32})-[a-f0-9]{32}'
TRANSFER_OWNER = 'clicaepede.kan140.transfer-owner'
TRANSFER_PHASE = 'clicaepede.kan140.transfer-phase'
PG_IMAGE = ('postgres:17.11-bookworm@sha256:'
            '3645570cccdfa447589da9f57dd740faa29b30938e861289a5574b6ca6b03826')


class Failure(Exception):
    def __init__(self, code):
        super().__init__()
        self.code = code


def require(condition, code):
    if not condition:
        raise Failure(code)


def safe_directory(path, parent, pattern):
    require(path.is_absolute() and path.parent == parent
            and re.fullmatch(pattern, path.name) is not None, 'unsafe_directory')
    require(path.resolve() == path, 'unsafe_directory')
    try:
        info = path.lstat()
    except FileNotFoundError:
        return False
    require(stat.S_ISDIR(info.st_mode) and info.st_uid == 0
            and stat.S_IMODE(info.st_mode) == 0o700, 'unsafe_directory')
    return True


class Recovery:
    def __init__(self, root=backup.ROOT):
        self.root = Path(root)
        self.lease = self.root / 'restore_lease.json'
        self.end = time.monotonic() + SECONDS
        self.owner = None
        self.directory = None
        self.count = self.size = 0
        self.extra = {'container': set(), 'volume': set()}
        self.v2 = False

    def lease_schema(self, value):
        require(isinstance(value, dict) and {'owner', 'directory'} <= set(value), 'invalid_lease')
        base = {'owner', 'directory', 'validator_directory'}
        extended = {'schema', 'version', 'resources'}
        self.owner = value['owner']
        require(isinstance(self.owner, str) and re.fullmatch(OWNER, self.owner), 'invalid_lease')
        if not set(value) & extended:
            require(set(value) <= base, 'invalid_lease')
            return
        require(set(value) <= base | extended and extended <= set(value) and
                value['schema'] == SCHEMA and type(value['version']) is int and
                value['version'] == 2, 'invalid_lease')
        rows = value['resources']
        require(isinstance(rows, list) and len(rows) <= 3 + MAX_HELPERS, 'invalid_lease')
        for row in rows:
            require(isinstance(row, dict) and set(row) == {'kind', 'name'}, 'invalid_lease')
            kind, name = row['kind'], row['name']
            require(isinstance(kind, str) and kind in self.extra and isinstance(name, str), 'invalid_lease')
            pattern = re.escape(self.owner) + r'-return-[a-f0-9]{32}' if kind == 'volume' else HELPER
            require(re.fullmatch(pattern, name) and name not in self.extra[kind], 'invalid_lease')
            self.extra[kind].add(name)
        require(len(self.extra['volume']) <= 3 and len(self.extra['container']) <= MAX_HELPERS,
                'invalid_lease')
        self.v2 = True

    def remaining(self):
        left = self.end - time.monotonic()
        require(left > 0, 'deadline')
        return left

    def docker(self, *args):
        result = subprocess.run(
            ['docker', '--host', 'unix:///var/run/docker.sock', '--config', str(self.root), *args],
            stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            check=True, timeout=min(5, self.remaining()),
            env={'PATH': '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', 'LANG': 'C'})
        require(len(result.stdout) <= 1024 * 1024, 'docker_response_limit')
        return result.stdout.decode('utf-8')

    def listing(self, kind, label=True):
        args = [kind, 'ls']
        if kind == 'container':
            args.append('--all')
        if kind != 'volume':
            args.append('--no-trunc')
        args.extend(['--filter', f'label={LABEL}={self.owner}' if label else f'name={self.owner}'])
        field = 'ID' if label and kind != 'volume' else 'Names' if kind == 'container' else 'Name'
        args.extend(['--format', '{{.' + field + '}}'])
        rows = self.docker(*args).splitlines()
        require(len(rows) <= (22 if self.v2 else 7) and len(rows) == len(set(rows)), 'unexpected_resources')
        if kind == 'container' and not label:
            # Helpers do not contain the restore owner. Query each exact registered
            # name as well, so stripping its label cannot hide an unsafe resource.
            for name in sorted(self.extra['container']):
                found = self.docker('container', 'ls', '--all', '--no-trunc', '--filter',
                                    'name=^/' + name + '$', '--format', '{{.Names}}').splitlines()
                require(not found or found == [name], 'resource_ownership')
                rows.extend(found)
            require(len(rows) == len(set(rows)), 'unexpected_resources')
        return rows

    def expected(self, kind):
        if kind == 'container':
            return {self.owner + '-' + service for service in SERVICES} | self.extra['container']
        if kind == 'network':
            return {self.owner + '-net'}
        return {self.owner + '-' + service + '-data' for service in SERVICES} | self.extra['volume']

    def inspect(self, kind, identity):
        if kind != 'volume':
            require(re.fullmatch(r'[a-f0-9]{64}', identity) is not None, 'unsafe_resource_id')
        else:
            require(identity in self.expected(kind), 'resource_ownership')
        response = json.loads(self.docker(kind, 'inspect', identity))
        require(isinstance(response, list) and len(response) == 1, 'resource_inspect')
        resource = response[0]
        require(isinstance(resource, dict), 'resource_inspect')
        name = resource.get('Name', '')
        if kind == 'container':
            require(isinstance(name, str) and name.startswith('/'), 'resource_ownership')
            name = name[1:]
        labels = resource.get('Config', {}).get('Labels', {}) if kind == 'container' else resource.get('Labels', {})
        require(isinstance(labels, dict) and labels.get(LABEL) == self.owner
                and name in self.expected(kind), 'resource_ownership')
        if kind != 'volume':
            require(resource.get('Id') == identity, 'resource_identity')
        if self.v2:
            if kind == 'container':
                self.container_policy(name, resource)
            elif kind == 'volume':
                require(resource.get('Driver') == 'local' and resource.get('Scope') == 'local'
                        and not resource.get('Options'), 'unsafe_volume')
                if name in self.extra['volume']:
                    require(re.fullmatch(r'[a-f0-9]{32}', labels.get(TRANSFER_OWNER, '')) and
                            labels.get(TRANSFER_PHASE) == 'rollback', 'resource_ownership')
        return name, resource

    def container_policy(self, name, resource):
        mounts = resource.get('Mounts')
        require(isinstance(mounts, list) and len(mounts) <= 8, 'unsafe_mount')
        helper = name in self.extra['container']
        destinations = set()
        volumes = []
        for mount in mounts:
            require(isinstance(mount, dict) and isinstance(mount.get('Destination'), str) and
                    mount['Destination'] not in destinations, 'unsafe_mount')
            destinations.add(mount['Destination'])
            if helper:
                if mount.get('Type') == 'tmpfs':
                    require(mount['Destination'] in ('/tmp', '/var/lib/postgresql/data') and
                            mount.get('RW') is True and not mount.get('Name') and
                            not mount.get('Source'), 'unsafe_helper_mount')
                    continue
                require(mount.get('Type') == 'volume' and mount.get('Name') in self.expected('volume')
                        and mount.get('Destination') in ('/source', '/target') and
                        mount.get('RW') is (mount['Destination'] == '/target'), 'unsafe_helper_mount')
                if mount['Destination'] == '/target':
                    require(mount['Name'] in self.extra['volume'], 'unsafe_helper_mount')
                volumes.append(mount)
            elif mount.get('Type') == 'volume':
                role = name.removeprefix(self.owner + '-')
                target = {'postgres': '/var/lib/postgresql/data', 'redis': '/data',
                          'evolution': '/evolution/instances'}[role]
                require(mount.get('Name') in {self.owner + '-' + role + '-data'} | self.extra['volume']
                        and mount['Destination'] == target and mount.get('RW') is True, 'unsafe_mount')
            else:
                require(mount.get('Type') == 'bind', 'unsafe_mount')
        if not helper:
            return
        require('/source' in destinations and len(volumes) in (1, 2), 'unsafe_helper_mount')
        if len(volumes) == 2:
            require(volumes[0]['Name'] != volumes[1]['Name'], 'unsafe_helper_mount')
        config, host = resource.get('Config', {}), resource.get('HostConfig', {})
        labels = config.get('Labels', {})
        require(labels.get(TRANSFER_OWNER) == re.fullmatch(HELPER, name).group(1) and
                labels.get(TRANSFER_PHASE) == 'rollback', 'resource_ownership')
        require(config.get('Image') == PG_IMAGE and config.get('User') == '0:0' and
                host.get('NetworkMode') == 'none' and host.get('ReadonlyRootfs') is True and
                host.get('Privileged') is False and
                host.get('RestartPolicy', {}).get('Name') == 'no', 'unsafe_helper')
        networks = resource.get('NetworkSettings', {}).get('Networks', {})
        require(isinstance(networks, dict) and set(networks) <= {'none'}, 'unsafe_helper')
        for field in ('Binds', 'Devices', 'DeviceRequests', 'VolumesFrom', 'Links',
                      'PortBindings', 'ExtraHosts', 'Dns', 'DnsSearch', 'DnsOptions'):
            require(not host.get(field), 'unsafe_helper')
        for field in ('PidMode', 'IpcMode', 'UTSMode', 'UsernsMode', 'CgroupnsMode'):
            require(host.get(field) not in ('host',) and
                    not str(host.get(field, '')).startswith('container:'), 'unsafe_helper')
        require(host.get('PidsLimit') == 32 and host.get('Memory') == 256 * 1024 ** 2 and
                host.get('MemorySwap') == 256 * 1024 ** 2 and
                host.get('NanoCpus') == 500000000 and
                host.get('LogConfig', {}).get('Type') == 'none', 'unsafe_helper')
        normalize = lambda items: {item.removeprefix('CAP_') for item in items}
        require(normalize(host.get('CapDrop') or []) == {'ALL'} and
                normalize(host.get('CapAdd') or []) == {'DAC_OVERRIDE', 'CHOWN', 'FOWNER', 'FSETID'} and
                host.get('SecurityOpt') == ['no-new-privileges:true'], 'unsafe_helper')
        tmpfs = host.get('Tmpfs')
        require(isinstance(tmpfs, dict) and set(tmpfs) == {'/tmp', '/var/lib/postgresql/data'} and
                all(set(options.split(',')) == {'rw', 'noexec', 'nosuid', 'nodev', 'size=1m'}
                    for options in tmpfs.values()), 'unsafe_helper')

    def bind_directories(self, resource):
        paths = set()
        for mount in resource.get('Mounts', []):
            if mount.get('Type') != 'bind':
                continue
            source = Path(mount.get('Source', ''))
            destination = mount.get('Destination')
            require(mount.get('RW') is False, 'unsafe_bind')
            if destination == '/backup/postgres.dump':
                require(source == self.directory / 'input' / 'postgres.dump'
                        and source.resolve() == source, 'unsafe_bind')
            else:
                require(destination in {'/run/secrets/' + name for name in SECRETS}
                        and source.name == destination.rsplit('/', 1)[1], 'unsafe_bind')
                exists = safe_directory(source.parent, self.root, re.escape(self.owner) + '-' + SUFFIX)
                require(source.resolve() == source, 'unsafe_bind')
                if exists:
                    paths.add(source.parent)
        return paths

    def validate_tree(self, path):
        self.remaining()
        entry = path.lstat()
        require(entry.st_uid == 0 and not stat.S_ISLNK(entry.st_mode), 'unsafe_plaintext')
        self.count += 1
        self.size += entry.st_size
        require(self.count <= 100000 and self.size <= 512 * 1024 * 1024, 'plaintext_limit')
        if stat.S_ISDIR(entry.st_mode):
            for child in path.iterdir():
                self.validate_tree(child)
        else:
            require(stat.S_ISREG(entry.st_mode) and entry.st_nlink == 1, 'unsafe_plaintext')

    def run(self):
        self.remaining()
        info = self.root.lstat()
        require(self.root.is_absolute() and self.root.resolve() == self.root
                and stat.S_ISDIR(info.st_mode) and info.st_uid == 0
                and stat.S_IMODE(info.st_mode) == 0o700, 'unsafe_root')
        if not os.path.lexists(self.lease):
            return {'status': 'ok', 'code': 'no_lease'}
        with backup.private_file(self.lease) as source:
            raw = source.read(MAX_LEASE + 1)
        require(len(raw.encode('utf-8')) <= MAX_LEASE, 'invalid_lease')
        value = json.loads(raw)
        self.lease_schema(value)
        require(self.v2 or len(raw.encode('utf-8')) <= 4096, 'invalid_lease')
        require(isinstance(value['directory'], str), 'invalid_lease')
        self.directory = Path(value['directory'])
        # Lexical equality rejects /./ and duplicate separators before Path normalizes them.
        require(str(self.directory) == value['directory'], 'unsafe_directory')
        paths = set()
        if safe_directory(self.directory, self.root, 'restore-offsite-' + SUFFIX):
            paths.add(self.directory)
        validator_directory = value.get('validator_directory')
        if validator_directory is not None:
            require(isinstance(validator_directory, str), 'unsafe_directory')
            validator = Path(validator_directory)
            require(str(validator) == validator_directory, 'unsafe_directory')
            if safe_directory(validator, self.root, re.escape(self.owner) + '-' + SUFFIX):
                paths.add(validator)
        for child in self.root.iterdir():
            self.remaining()
            if re.fullmatch(re.escape(self.owner) + '-' + SUFFIX, child.name):
                require(safe_directory(child, self.root, re.escape(self.owner) + '-' + SUFFIX),
                        'unsafe_directory')
                paths.add(child)
        resources = []
        for kind in ('container', 'network', 'volume'):
            names = set()
            for identity in self.listing(kind):
                name, resource = self.inspect(kind, identity)
                names.add(name)
                resources.append((kind, identity))
                if kind == 'container':
                    paths.update(self.bind_directories(resource))
            # Also reject same-owner names whose labels were changed/are missing.
            require(set(self.listing(kind, label=False)) == names, 'resource_ownership')
        for path in paths:
            self.validate_tree(path)
        require(shutil.rmtree.avoids_symlink_attacks, 'unsafe_rmtree')
        require(backup.read_json(self.lease) == value, 'lease_changed')
        for kind, identity in resources:  # Containers first, then network and volumes.
            self.inspect(kind, identity)
            self.docker(kind, 'rm', *(['--force'] if kind == 'container' else []), identity)
        for kind in ('container', 'network', 'volume'):
            require(not self.listing(kind) and not self.listing(kind, label=False), 'resources_remain')
        require(shutil.rmtree.avoids_symlink_attacks, 'unsafe_rmtree')
        self.count = self.size = 0
        for path in sorted(paths):
            self.remaining()
            pattern = 'restore-offsite-' + SUFFIX if path == self.directory else re.escape(self.owner) + '-' + SUFFIX
            require(safe_directory(path, self.root, pattern), 'unsafe_directory')
            self.validate_tree(path)
            shutil.rmtree(path)
        self.remaining()
        # Do not clear a replaced lease, even though cooperating workers hold the lock.
        require(backup.read_json(self.lease) == value, 'lease_changed')
        self.lease.unlink()
        backup.sync_dir(self.root)
        return {'status': 'ok', 'code': 'recovered', 'resources_removed': len(resources),
                'directories_removed': len(paths)}


def interrupted(_signum, _frame):
    raise Failure('deadline' if _signum == signal.SIGALRM else 'interrupted')


def main(argv=None):
    if (sys.argv[1:] if argv is None else argv):
        print(json.dumps({'status': 'error', 'code': 'invalid_command'}))
        return 1
    previous = {}
    timer = None
    try:
        require(sys.platform == 'linux' and os.geteuid() == 0, 'linux_root_required')
        for signum in (signal.SIGINT, signal.SIGTERM, signal.SIGALRM):
            previous[signum] = signal.signal(signum, interrupted)
        timer = signal.setitimer(signal.ITIMER_REAL, SECONDS)
        with backup.locked(backup.ROOT):
            result = Recovery().run()
        print(json.dumps(result))
        return 0
    except backup.LockBusy:
        print(json.dumps({'status': 'skipped', 'code': 'lock_busy'}))
        return 0
    except Failure as error:
        print(json.dumps({'status': 'error', 'code': error.code}))
        return 1
    except BaseException:
        print(json.dumps({'status': 'error', 'code': 'recovery_failed'}))
        return 1
    finally:
        if timer is not None:
            signal.setitimer(signal.ITIMER_REAL, *timer)
        for signum, handler in previous.items():
            signal.signal(signum, handler)


if __name__ == '__main__':
    raise SystemExit(main())
