#!/usr/bin/env python3
"""Root-only QA backup. No pruning; recover is independent of uploader config.

SIGKILL/power loss requires an external watchdog invoking `recover`. The durable
marker records the latest allowed maintenance deadline, not a timer daemon.
"""
import base64
import contextlib
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import stat
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.parse
import urllib.error
import urllib.request
import uuid

try:
    import fcntl
except ImportError:  # Importable for mocked tests on Windows; execution is Linux-only.
    fcntl = None

ROOT = Path('/var/lib/clicaepede/kan133')
CONFIG = Path('/etc/clicaepede/kan133/config.json')
APP = 'clica-evolution-qa_evolution'
PG = 'clica-evolution-qa_postgres'
REDIS = 'clica-evolution-qa_redis'
VOLUME = 'clica-evolution-qa_evolution_instances'
BUCKET = 'infra-backups-qa'
SUPABASE_HOST = 'kktmjjmkbbtbibzbpcqj.supabase.co'
PREFIX = 'kan133/evolution-qa/'
NAME_PATTERN = (re.escape(PREFIX) + r'\d{8}T\d{6}Z-[a-f0-9]{8}-[a-f0-9]{4}-'
                r'[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.age')
MAX_SIZE = 40 * 1024 * 1024
PAUSE_SECONDS = 180
SCRIPTS = ('stack.yaml', 'deploy.sh', 'verify.sh', 'postgres-init.sh',
           'redis-entrypoint.sh', 'evolution-entrypoint.sh', 'start-redacted.cjs',
           'publish-route.py', 'public-test.py', 'check-logs.py', 'api-test.cjs',
           'redis-dependency.cjs')


class Failure(Exception):
    """Deliberately carries no subprocess, HTTP response or secret details."""


class LockBusy(Failure):
    pass


class StageFailure(Failure):
    def __init__(self, stage, code):
        super().__init__()
        self.stage = stage
        self.code = code


@contextlib.contextmanager
def gate(stage):
    """Only static stages and classified codes escape to the JSON status."""
    try:
        yield
    except (LockBusy, StageFailure):
        raise
    except BaseException as error:
        if isinstance(error, subprocess.TimeoutExpired):
            code = 'command_timeout'
        elif isinstance(error, subprocess.CalledProcessError):
            code = 'command_failed'
        elif isinstance(error, urllib.error.HTTPError):
            code = 'http_failed'
        elif isinstance(error, urllib.error.URLError):
            code = 'network_failed'
        elif isinstance(error, PermissionError):
            code = 'filesystem_denied'
        elif isinstance(error, FileNotFoundError):
            code = 'dependency_missing'
        elif isinstance(error, OSError):
            code = 'io_failed'
        elif isinstance(error, (ValueError, KeyError, TypeError)):
            code = 'invalid_data'
        elif isinstance(error, Failure):
            code = 'validation_failed'
        else:
            code = 'operation_failed'
        raise StageFailure(stage, code) from None


def require(condition):
    if not condition:
        raise Failure()


def stamp(epoch=None):
    return dt.datetime.fromtimestamp(time.time() if epoch is None else epoch,
                                     dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def timestamp(value):
    require(isinstance(value, str) and len(value) <= 64)
    parsed = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    require(parsed.tzinfo is not None and parsed.utcoffset() == dt.timedelta(0))
    return parsed.timestamp()


def private_file(path):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    info = os.fstat(fd)
    if not (stat.S_ISREG(info.st_mode) and info.st_uid == 0
            and stat.S_IMODE(info.st_mode) == 0o600 and info.st_nlink == 1):
        os.close(fd)
        raise Failure()
    return os.fdopen(fd, 'r', encoding='utf-8')


def read_json(path):
    with private_file(path) as source:
        return json.load(source)


def atomic_json(path, value):
    fd, name = tempfile.mkstemp(prefix='.state-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as out:
            os.fchmod(out.fileno(), 0o600)
            json.dump(value, out, separators=(',', ':'))
            out.flush()
            os.fsync(out.fileno())
        os.replace(name, path)
        sync_dir(path.parent)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def sync_dir(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


@contextlib.contextmanager
def locked(root):
    require(fcntl is not None and os.geteuid() == 0)
    os.umask(0o077)
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    info = root.lstat()
    require(stat.S_ISDIR(info.st_mode) and info.st_uid == 0
            and stat.S_IMODE(info.st_mode) == 0o700 and root.resolve() == root)
    fd = os.open(root / 'backup.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        info = os.fstat(fd)
        require(stat.S_ISREG(info.st_mode) and info.st_uid == 0
                and stat.S_IMODE(info.st_mode) == 0o600 and info.st_nlink == 1)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise LockBusy() from None
        yield
    finally:
        os.close(fd)


def jwt_role(token):
    try:
        payload = token.split('.')[1]
        return json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))['role']
    except (ValueError, KeyError, IndexError, TypeError):
        raise Failure() from None


@gate('config')
def config():
    value = read_json(CONFIG)
    fields = {'recipient', 'supabase_url', 'anon_key', 'uploader_email', 'uploader_password'}
    # Shared config also holds monitor credentials and provisioning metadata.
    optional = {'uploader_id', 'bucket', 'telegram_token', 'telegram_chat_id'}
    require(isinstance(value, dict) and fields <= set(value)
            and set(value) <= fields | optional)
    require(all(isinstance(value[k], str) and value[k] and '\x00' not in value[k]
                for k in fields))
    require(value.get('bucket', BUCKET) == BUCKET)
    require(re.fullmatch(r'age1[0-9a-z]{58}', value['recipient']) is not None)
    url = urllib.parse.urlsplit(value['supabase_url'])
    require(url.scheme == 'https' and url.hostname == SUPABASE_HOST and not url.username
            and not url.password and url.path in ('', '/') and not url.query
            and not url.fragment and url.port in (None, 443))
    key = value['anon_key']
    if key.startswith('sb_publishable_'):
        require(re.fullmatch(r'sb_publishable_[A-Za-z0-9_-]{16,256}', key) is not None)
    else:
        require(not key.startswith('sb_secret_') and jwt_role(key) == 'anon')
    value['supabase_url'] = value['supabase_url'].rstrip('/')
    return {key: value[key] for key in fields}


class Executor:
    def __init__(self, root=ROOT):
        self.root = Path(root)
        self.marker = self.root / 'maintenance.json'
        self.deadline = None

    def remaining(self):
        if self.deadline is None:
            return 120
        left = self.deadline - time.monotonic()
        require(left > 0)
        return left

    def run(self, args, output=None):
        result = subprocess.run(args, stdin=subprocess.DEVNULL,
                                stdout=output if output else subprocess.PIPE,
                                stderr=subprocess.DEVNULL, check=True,
                                timeout=min(120, self.remaining()),
                                env={'PATH': '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
                                     'LANG': 'C'})
        return result.stdout.decode('utf-8') if output is None else ''

    def docker_json(self, *args):
        return json.loads(self.run(['docker', *args]))

    def replicas(self):
        value = self.docker_json('service', 'inspect', APP)[0]
        replicas = value['Spec']['Mode']['Replicated']['Replicas']
        require(type(replicas) is int and replicas in (0, 1))
        return replicas

    def scale(self, replicas):
        self.run(['docker', 'service', 'scale', '--detach=true', f'{APP}={replicas}'])

    def containers(self, service):
        ids = self.run(['docker', 'ps', '-aq', '--filter',
                        f'label=com.docker.swarm.service.name={service}']).split()
        require(all(re.fullmatch(r'[a-f0-9]{12,64}', cid) for cid in ids))
        return self.docker_json('inspect', *ids) if ids else []

    def container(self, service):
        running = [c for c in self.containers(service) if c['State']['Running']]
        require(len(running) == 1 and running[0]['State']['Health']['Status'] == 'healthy')
        return running[0]['Id']

    def settled(self, replicas):
        ids = self.run(['docker', 'service', 'ps', '-q', '--no-trunc', APP]).split()
        require(all(re.fullmatch(r'[a-z0-9]{25}', task) for task in ids))
        tasks = self.docker_json('inspect', '--type', 'task', *ids) if ids else []
        terminal = {'complete', 'shutdown', 'failed', 'rejected', 'remove'}
        live = [t for t in tasks if t['Status']['State'] not in terminal]
        containers = [c for c in self.containers(APP) if c['State']['Running']]
        if replicas == 0:
            return not live and not containers and self.replicas() == 0
        local = self.run(['docker', 'info', '--format', '{{.Swarm.NodeID}}']).strip()
        return (self.replicas() == replicas and len(live) == replicas
                and all(t['Status']['State'] == 'running' and t['NodeID'] == local
                        and t['DesiredState'] == 'running' for t in live)
                and len(containers) == replicas
                and all(c['State'].get('Health', {}).get('Status') == 'healthy'
                        for c in containers))

    def wait(self, replicas):
        while not self.settled(replicas):
            time.sleep(min(1, self.remaining()))

    @gate('cleanup_orphans')
    def cleanup_orphans(self):
        # Caller owns the exclusive lock. Never follow links, including ancestors.
        require(self.root.resolve() == self.root)
        for path in sorted(self.root.iterdir()):
            if re.fullmatch(r'staging-[a-z0-9_]{8}', path.name) is None:
                continue
            require(path.parent == self.root and path.resolve() == path)
            info = path.lstat()
            require(stat.S_ISDIR(info.st_mode) and info.st_uid == 0
                    and stat.S_IMODE(info.st_mode) == 0o700)
            pending = [path]
            while pending:
                child = pending.pop()
                entry = child.lstat()
                require(entry.st_uid == 0 and not stat.S_ISLNK(entry.st_mode))
                if stat.S_ISDIR(entry.st_mode):
                    require(stat.S_IMODE(entry.st_mode) == 0o700)
                    pending.extend(child.iterdir())
                else:
                    require(stat.S_ISREG(entry.st_mode) and entry.st_nlink == 1)
            require(shutil.rmtree.avoids_symlink_attacks)
            shutil.rmtree(path)
        sync_dir(self.root)

    @gate('recover')
    def recover(self, interrupted=True):
        if not os.path.lexists(self.marker):
            if interrupted:
                self.cleanup_orphans()
            return
        if interrupted:
            self.record_failure()
        marker = read_json(self.marker)
        require(isinstance(marker, dict) and set(marker) == {
            'service', 'original_replicas', 'started_at', 'deadline'})
        require(marker['service'] == APP and type(marker['original_replicas']) is int
                and marker['original_replicas'] in (0, 1))
        started, deadline = marker['started_at'], marker['deadline']
        require(type(started) is int and type(deadline) is int
                and 0 < started <= time.time() + 5 and 0 < deadline - started <= 180)
        self.deadline = time.monotonic() + 180
        self.scale(marker['original_replicas'])
        self.wait(marker['original_replicas'])
        self.marker.unlink()
        sync_dir(self.root)
        self.deadline = None
        if interrupted:
            self.cleanup_orphans()

    @gate('pause')
    def pause(self):
        original = self.replicas()
        started = int(time.time())
        atomic_json(self.marker, {'service': APP, 'original_replicas': original,
                                 'started_at': started, 'deadline': started + 180})
        self.deadline = time.monotonic() + 179
        self.scale(0)
        self.wait(0)

    @gate('pg_dump')
    def pg_dump(self, stage):
        container = self.container(PG)
        script = ('set -eu; export PGPASSWORD="$(cat /run/secrets/pg_admin_password)"; '
                  'psql -X -w -U evolution_admin -d evolution -v ON_ERROR_STOP=1 '
                  '-Atc "SELECT 1" >/dev/null; '
                  'exec pg_dump -w -U evolution_admin -d evolution --format=custom')
        with open(stage / 'postgres.dump', 'xb') as out:
            self.run(['docker', 'exec', container, 'sh', '-c', script], out)
        require((stage / 'postgres.dump').stat().st_size > 0)

    def redis(self, container, *command):
        script = ('set -eu; export REDISCLI_AUTH="$(cat /run/secrets/redis_password)"; '
                  'exec redis-cli --no-auth-warning --raw "$@"')
        return self.run(['docker', 'exec', container, 'sh', '-c', script,
                         'kan133', *command]).strip()

    def redis_info(self, container):
        return dict(line.split(':', 1) for line in self.redis(container, 'INFO', 'persistence')
                    .splitlines() if ':' in line)

    @gate('redis_snapshot')
    def redis_dump(self, stage):
        container = self.container(REDIS)
        while self.redis_info(container)['rdb_bgsave_in_progress'] != '0':
            time.sleep(min(1, self.remaining()))
        before = int(self.redis(container, 'LASTSAVE'))
        # LASTSAVE has second resolution; force a distinct Redis-server timestamp.
        while int(self.redis(container, 'TIME').splitlines()[0]) <= before:
            time.sleep(min(0.2, self.remaining()))
        require(self.redis(container, 'BGSAVE') == 'Background saving started')
        while True:
            info = self.redis_info(container)
            saved = int(self.redis(container, 'LASTSAVE'))
            if info['rdb_bgsave_in_progress'] == '0':
                require(info['rdb_last_bgsave_status'] == 'ok' and saved > before)
                break
            time.sleep(min(0.2, self.remaining()))
        self.run(['docker', 'cp', f'{container}:/data/dump.rdb', str(stage / 'redis.rdb')])
        require(self.redis_info(container)['rdb_bgsave_in_progress'] == '0'
                and int(self.redis(container, 'LASTSAVE')) == saved)
        path = stage / 'redis.rdb'
        require(stat.S_ISREG(path.lstat().st_mode) and path.stat().st_nlink == 1)
        os.chmod(path, 0o600)
        with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), 'rb') as source:
            require(source.read(5) == b'REDIS')

    @gate('session_volume')
    def sessions(self):
        volume = self.docker_json('volume', 'inspect', VOLUME)[0]
        path = Path(volume['Mountpoint'])
        require(volume['Name'] == VOLUME and volume['Driver'] == 'local'
                and not volume.get('Options')
                and path == Path('/var/lib/docker/volumes') / VOLUME / '_data'
                and path.resolve() == path)
        return path

    def add_tree(self, archive, path, name):
        self.remaining()
        require(path.resolve() == path)
        require(re.fullmatch(r'[A-Za-z0-9_. /-]+', name) is not None
                and not name.startswith('/') and all(p not in ('', '.', '..')
                                                      for p in name.split('/')))
        info = path.lstat()
        require(stat.S_ISDIR(info.st_mode) or stat.S_ISREG(info.st_mode))
        require(path.name.lower() not in {'pgdata', 'postgres_data', 'pg_version'})
        if path.is_dir():
            require(not (path / 'PG_VERSION').exists())
            archive.addfile(archive.gettarinfo(str(path), arcname=name))
            for child in sorted(path.iterdir()):
                self.add_tree(archive, child, name + '/' + child.name)
        else:
            fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
            with os.fdopen(fd, 'rb') as source:
                current = os.fstat(source.fileno())
                require(current.st_ino == info.st_ino and current.st_dev == info.st_dev
                        and stat.S_ISREG(current.st_mode) and current.st_nlink == 1)
                member = archive.gettarinfo(str(path), arcname=name)
                require(member.isreg() and member.size == current.st_size)
                executor = self

                class TimedReader:
                    def read(self, size):
                        executor.remaining()
                        return source.read(size)

                archive.addfile(member, TimedReader())
                after = os.fstat(source.fileno())
                require((after.st_size, after.st_mtime_ns) ==
                        (current.st_size, current.st_mtime_ns))

    @gate('archive')
    def capture(self, stage):
        captured_at = stamp()
        self.pg_dump(stage)
        self.redis_dump(stage)
        with tarfile.open(stage / 'backup.tar', 'w', format=tarfile.USTAR_FORMAT) as archive:
            for filename in ('postgres.dump', 'redis.rdb'):
                self.add_tree(archive, stage / filename, filename)
            self.add_tree(archive, self.sessions(), 'evolution-instances')
            self.add_tree(archive, Path('/etc/easypanel'), 'config/easypanel')
            self.add_tree(archive, Path('/etc/clicaepede/evolution-qa'), 'config/evolution-qa')
            self.add_tree(archive, CONFIG, 'config/kan133/config.json')
            for filename in SCRIPTS:
                self.add_tree(archive, Path('/home/brunoops/kan132') / filename,
                              'config/kan132/' + filename)
        self.remaining()
        return captured_at

    def backup(self):
        try:
            return self._backup()
        except BaseException:
            try:
                self.record_failure()
            except Failure:
                pass  # Preserve the original classified failure, not its text.
            raise

    @gate('local_state')
    def record_failure(self):
        # Keep the last verified snapshot's age, even when this run fails.
        state = {'failed': True}
        try:
            previous = read_json(self.root / 'last_backup.json')
            require(isinstance(previous, dict))
            for key in ('captured_at', 'verified_at'):
                timestamp(previous[key])
            require(isinstance(previous['name'], str) and re.fullmatch(NAME_PATTERN, previous['name']))
            require(type(previous['size']) is int and 0 < previous['size'] <= MAX_SIZE)
            require(isinstance(previous['sha256'], str)
                    and re.fullmatch(r'[a-f0-9]{64}', previous['sha256']))
            state.update({key: previous[key] for key in
                          ('captured_at', 'verified_at', 'name', 'size', 'sha256')})
        except (OSError, Failure, ValueError, KeyError, TypeError):
            pass
        atomic_json(self.root / 'last_backup.json', state)

    def _backup(self):
        self.recover()
        settings = config()
        with gate('staging'):
            stage = Path(tempfile.mkdtemp(prefix='staging-', dir=self.root))
            os.chmod(stage, 0o700)
        try:
            try:
                self.pause()
                captured_at = self.capture(stage)
            finally:
                # A second termination signal must not interrupt the resume attempt.
                previous = {}
                for sig in (signal.SIGINT, signal.SIGTERM):
                    previous[sig] = signal.signal(sig, signal.SIG_IGN)
                try:
                    self.recover(interrupted=False)
                finally:
                    for sig, handler in previous.items():
                        signal.signal(sig, handler)
            ciphertext = stage / 'backup.age'
            with gate('encryption'):
                self.run(['age', '--encrypt', '--recipient', settings['recipient'],
                          '--output', str(ciphertext), str(stage / 'backup.tar')])
                require(0 < ciphertext.stat().st_size <= MAX_SIZE)
            name = PREFIX + dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + str(uuid.uuid4()) + '.age'
            result = upload(settings, ciphertext, name, captured_at)
            with gate('local_state'):
                atomic_json(self.root / 'last_backup.json', result)
            return result
        finally:
            with gate('staging_cleanup'):
                shutil.rmtree(stage)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise Failure()


def request(url, method, headers, body=None, limit=MAX_SIZE):
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    with opener.open(req, timeout=60) as response:
        require(200 <= response.status < 300)
        data = response.read(limit + 1)
        require(len(data) <= limit)
        return data


@gate('storage')
def upload(settings, ciphertext, name, captured_at):
    require(re.fullmatch(NAME_PATTERN, name))
    require(0 < ciphertext.stat().st_size <= MAX_SIZE)
    with open(ciphertext, 'rb') as source:
        data = source.read(MAX_SIZE + 1)
    require(0 < len(data) <= MAX_SIZE)
    digest = hashlib.sha256(data).hexdigest()
    headers = {'apikey': settings['anon_key'], 'Content-Type': 'application/json'}
    credentials = json.dumps({'email': settings['uploader_email'],
                              'password': settings['uploader_password']}).encode()
    with gate('auth_login'):
        session = json.loads(request(settings['supabase_url'] + '/auth/v1/token?grant_type=password',
                                     'POST', headers, credentials, 65536))
        token = session['access_token']
        require(isinstance(token, str) and jwt_role(token) == 'authenticated')
    headers = {'apikey': settings['anon_key'], 'Authorization': 'Bearer ' + token,
               'Content-Type': 'application/octet-stream', 'x-upsert': 'false'}
    url = settings['supabase_url'] + '/storage/v1/object/' + BUCKET + '/' + name
    with gate('storage_upload'):
        request(url, 'POST', headers, data, 65536)
    with gate('storage_verify'):
        downloaded = request(settings['supabase_url'] + '/storage/v1/object/authenticated/'
                             + BUCKET + '/' + name, 'GET',
                             {'apikey': headers['apikey'], 'Authorization': headers['Authorization']})
        require(len(downloaded) == len(data) and hashlib.sha256(downloaded).hexdigest() == digest)
    return {'captured_at': captured_at, 'verified_at': stamp(), 'name': name,
            'size': len(data), 'sha256': digest, 'failed': False}


def backup_freshness(last_backup, now=None):
    """RPO is based on capture time, never the later upload verification time."""
    try:
        require(last_backup.get('failed', False) is False)
        captured = timestamp(last_backup['captured_at'])
        verified = timestamp(last_backup['verified_at'])
        now = time.time() if now is None else now
        require(captured <= verified <= now)
        age = now - captured
        return 'critical' if age >= 86400 else 'warning' if age >= 64800 else 'ok'
    except (Failure, ValueError, KeyError, TypeError, AttributeError):
        return 'critical'


def interrupted(signum, frame):
    raise Failure()


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if len(argv) != 1 or argv[0] not in ('backup', 'recover'):
        print(json.dumps({'status': 'error', 'command': None, 'code': 'invalid_command'}))
        return 1
    command = argv[0]
    try:
        for sig in (signal.SIGINT, signal.SIGTERM):
            signal.signal(sig, interrupted)
        with gate('lock'), locked(ROOT):
            executor = Executor()
            if command == 'recover':
                executor.recover()
            else:
                executor.backup()
        print(json.dumps({'status': 'ok', 'command': command}))
        return 0
    except LockBusy:
        if command == 'recover':
            print(json.dumps({'status': 'skipped', 'command': command, 'code': 'lock_busy'}))
            return 0
        print(json.dumps({'status': 'error', 'command': command, 'code': 'lock_busy'}))
        return 1
    except StageFailure as error:
        print(json.dumps({'status': 'error', 'command': command,
                          'code': error.code, 'stage': error.stage}))
        return 1
    except BaseException:
        print(json.dumps({'status': 'error', 'command': command, 'code': 'operation_failed'}))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
