#!/usr/bin/env python3
"""VPS trigger only: business queues and distributed locks remain in Vercel."""
import argparse
import contextlib
import datetime as dt
import json
import os
from pathlib import Path, PurePosixPath
import re
import socket
import stat
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

try:
    import fcntl
except ImportError:
    fcntl = None

ORIGIN = 'https://clicaepedeofc.vercel.app'
PATHS = {'whatsapp': '/api/cron/whatsapp/transactional', 'billing': '/api/cron/billing'}
CONFIG = Path('/etc/clicaepede/kan135/config.json')
ROOT = Path('/var/lib/clicaepede/kan135')
MAX_ATTEMPTS = 3


class Busy(Exception):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise ValueError('redirect-rejected')


def private_read(path):
    path = Path(path)
    # O_NOFOLLOW also prevents credential symlink substitution on Linux.
    fd = os.open(path, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0))
    with os.fdopen(fd, 'r', encoding='utf-8') as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o600:
            raise ValueError('private-file-mode')
        if hasattr(os, 'geteuid') and info.st_uid != os.geteuid():
            raise ValueError('private-file-owner')
        return stream.read(65537)


def config_read(path=CONFIG):
    config = json.loads(private_read(path))
    approved = config.get('allowlisted_origins', [ORIGIN])
    if not isinstance(approved, list) or not approved:
        raise ValueError('invalid-allowlist')
    for origin in approved:
        parsed = urllib.parse.urlsplit(origin)
        if (parsed.scheme != 'https' or not parsed.hostname or
                not parsed.hostname.endswith('.vercel.app') or parsed.username or
                parsed.password or parsed.port or parsed.path or parsed.query or parsed.fragment or
                origin != 'https://' + parsed.hostname):
            raise ValueError('invalid-allowlisted-origin')
        if origin != ORIGIN and not re.fullmatch(r'clicaepedeofc-[a-z0-9-]+\.vercel\.app', parsed.hostname):
            raise ValueError('preview-project-not-allowlisted')
    if config.get('origin', ORIGIN) not in approved:
        raise ValueError('origin-not-allowlisted')
    for job in PATHS:
        if type(config.get(job + '_enabled', False)) is not bool:
            raise ValueError('invalid-flag')
        secret = PurePosixPath(config.get(job + '_secret_file', '/etc/clicaepede/kan135/' + job + '.token'))
        if not secret.is_absolute() or secret.parent != PurePosixPath('/etc/clicaepede/kan135'):
            raise ValueError('secret-location')
        config[job + '_secret_file'] = str(secret)
    if config['whatsapp_secret_file'] == config['billing_secret_file']:
        raise ValueError('dedicated-secret-files-required')
    bypass = config.get('preview_bypass_secret_file')
    if bypass is not None and bypass != '/etc/clicaepede/kan135/preview.token':
        raise ValueError('preview-secret-location')
    return config


def atomic(path, data):
    fd, name = tempfile.mkstemp(prefix='.' + path.name, dir=path.parent)
    try:
        with os.fdopen(fd, 'w', encoding='ascii') as stream:
            os.chmod(name, 0o600)
            json.dump(data, stream, ensure_ascii=True, sort_keys=True)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(name, path)
        if os.name == 'posix':
            directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(directory)
            finally:
                os.close(directory)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def read_state(path):
    return json.loads(path.read_text(encoding='ascii')) if path.exists() else {}


@contextlib.contextmanager
def locked(root, name):
    if fcntl is None:
        raise RuntimeError('linux-flock-required')
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (root / (name + '.lock')).open('a') as stream:
        os.chmod(stream.name, 0o600)
        try:
            fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise Busy() from None
        try:
            yield
        finally:
            fcntl.flock(stream, fcntl.LOCK_UN)


def slot(job, now):
    if job == 'whatsapp':
        return int(now // 60) * 60
    current = dt.datetime.fromtimestamp(now, dt.timezone.utc)
    due = current.replace(hour=9, minute=0, second=0, microsecond=0)
    if current < due:
        due -= dt.timedelta(days=1)
    return int(due.timestamp())


def http(url, headers=None, data=None, timeout=65):
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    req = urllib.request.Request(url, data=data, headers=headers or {}, method='GET' if data is None else 'POST')
    with opener.open(req, timeout=timeout) as response:
        body = response.read(65537)
        if len(body) > 65536:
            raise ValueError('response-limit')
        return response.status, json.loads(body)


def valid_token(secret):
    return bool(secret) and len(secret) <= 4096 and all(33 <= ord(c) <= 126 for c in secret)


def invoke(job, secret, request=http, origin=ORIGIN, bypass=None):
    try:
        headers = {'Authorization': 'Bearer ' + secret, 'Accept': 'application/json'}
        if bypass is not None and origin != ORIGIN:
            headers['x-vercel-protection-bypass'] = bypass
        code, body = request(origin + PATHS[job], headers, b'')
        if code == 409:
            return 'skipped', code
        if code in (401, 403):
            return 'auth', code
        if not 200 <= code < 300:
            return 'http-failure', code
        return ('success' if isinstance(body, dict) and body.get('ok') is True else 'application-failure'), code
    except urllib.error.HTTPError as error:
        code = error.code
        error.close()
        return ('skipped' if code == 409 else 'auth' if code in (401, 403) else 'http-failure'), code
    except urllib.error.URLError as error:
        # Only DNS / connection-refused prove this invocation was not accepted.
        if isinstance(error.reason, (socket.gaierror, ConnectionRefusedError)):
            return 'preconnect', None
        return 'ambiguous', None
    except Exception:
        return 'ambiguous', None


def record_failure(root, job, state, reason, code, now):
    path = root / (job + '.dead-letter.json')
    previous = read_state(path)
    sequence = previous.get('sequence', 1 if previous else 0) + 1
    dead = {'job': job, 'slot': state['slot'], 'reason': reason,
            'http_status': code, 'attempts': state['attempts'], 'at': now,
            'sequence': sequence, 'ack_sequence': previous.get('ack_sequence', 0)}
    # One bounded mailbox per job: retain the first unconfirmed failure even
    # when later slots overwrite the latest failure details.
    dead['first_unconfirmed'] = previous.get('first_unconfirmed') or {
        'sequence': sequence, 'at': now, 'reason': reason}
    atomic(path, dead)


def acknowledge_failure(root, job, sequence):
    path = root / (job + '.dead-letter.json')
    with locked(root, job):
        dead = read_state(path)
        if not dead or sequence <= dead.get('ack_sequence', 0):
            return
        dead.setdefault('sequence', 1)
        dead['ack_sequence'] = min(sequence, dead['sequence'])
        if dead['ack_sequence'] >= dead.get('sequence', 1):
            dead.pop('first_unconfirmed', None)
        elif dead.get('first_unconfirmed', {}).get('sequence', 0) <= sequence:
            dead['first_unconfirmed'] = {'sequence': dead['sequence'], 'at': dead['at'], 'reason': dead['reason']}
        atomic(path, dead)


def run(job, config, root=ROOT, clock=time.time, request=http, reset=False, retry_only=False):
    if not config.get(job + '_enabled', False):
        return 'disabled'
    with locked(root, job):
        path = root / (job + '.json')
        state = read_state(path)
        now = clock()
        if reset:
            if state.get('blocked'):
                state['blocked'] = False
                atomic(path, state)
            return 'reset'
        if state.get('blocked'):
            return 'blocked'
        if retry_only and state.get('status') != 'retry':
            return 'no-retry'
        if state.get('status') == 'running':
            # Persisted before HTTP; after a crash the remote outcome is unknown.
            state.update(status='terminal', reason='interrupted', finished_at=now)
            record_failure(root, job, state, 'interrupted', None, now)
            atomic(path, state)
            return 'interrupted'
        if state.get('status') == 'retry':
            if now < state['next_at']:
                return 'backoff'
        elif state.get('slot') == slot(job, now):
            return 'already-finished'
        else:
            state = {'slot': slot(job, now), 'attempts': 0,
                     'last_success_at': state.get('last_success_at'), 'last_healthy_at': state.get('last_healthy_at'),
                     'last_success_slot': state.get('last_success_slot')}
        secret = private_read(config[job + '_secret_file']).strip()
        if not valid_token(secret):
            raise ValueError('invalid-secret')
        other = 'billing' if job == 'whatsapp' else 'whatsapp'
        if config.get(other + '_enabled', False):
            if private_read(config[other + '_secret_file']).strip() == secret:
                raise ValueError('dedicated-secret-values-required')
        bypass = None
        if config.get('origin', ORIGIN) != ORIGIN and config.get('preview_bypass_secret_file'):
            bypass = private_read(config['preview_bypass_secret_file']).strip()
            if not valid_token(bypass):
                raise ValueError('invalid-preview-token')
        state.update(status='running', started_at=now, attempts=state['attempts'] + 1)
        atomic(path, state)
        outcome, code = invoke(job, secret, request, config.get('origin', ORIGIN), bypass)
        now = clock()
        state.update(reason=outcome, http_status=code, finished_at=now)
        if outcome == 'preconnect' and state['attempts'] < MAX_ATTEMPTS:
            state.update(status='retry', next_at=now + 60 * 2 ** (state['attempts'] - 1))
        elif outcome in ('success', 'skipped'):
            state.update(status=outcome)
            if outcome == 'success':
                state['last_success_at'] = now
                state['last_healthy_at'] = now
                state['last_success_slot'] = state['slot']
        else:
            state.update(status='terminal', blocked=outcome == 'auth')
            record_failure(root, job, state, outcome, code, now)
        atomic(path, state)
        return outcome


def retry(config, root=ROOT, clock=time.time, request=http):
    results = {}
    for job in PATHS:
        state = read_state(root / (job + '.json'))
        if state.get('status') == 'retry':
            results[job] = run(job, config, root, clock, request, retry_only=True)
    return results


def active_incidents(config, root, now, started):
    active = []
    for job in PATHS:
        state = read_state(root / (job + '.json'))
        if state.get('blocked') or state.get('status') == 'terminal':
            active.append(job + ':failure')
        if state.get('status') == 'running' and now - state.get('started_at', now) > 120:
            active.append(job + ':interrupted')
        if not config.get(job + '_enabled', False):
            continue
        if job == 'whatsapp':
            late = now - (state.get('last_healthy_at') or started) > 180
        else:
            due = slot(job, now)
            late = now > max(due, started) + 900 and (state.get('last_success_slot') or 0) < due
        if late:
            active.append(job + ':late')
    return sorted(active)


def telegram_http(url, headers, data):
    return http(url, headers, data, timeout=12)


def notify(event, config, request=telegram_http):
    # Reuse the existing private KAN133 config without printing/copying credentials.
    private = Path(config.get('telegram_config_file', '/etc/clicaepede/kan133/config.json'))
    if private != Path('/etc/clicaepede/kan133/config.json'):
        raise ValueError('telegram-config-not-allowlisted')
    credentials = json.loads(private_read(private))
    token = credentials['telegram_token']
    if not isinstance(token, str) or not token or any(c not in '0123456789:abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_-' for c in token):
        raise ValueError('telegram-token-invalid')
    chat = credentials['telegram_chat_id']
    payload = json.dumps({'chat_id': chat, 'text': '[KAN135] ' + event}).encode()
    code, body = request('https://api.telegram.org/bot' + token + '/sendMessage',
                         {'Content-Type': 'application/json'}, payload)
    if code != 200 or body.get('ok') is not True or not body.get('result', {}).get('message_id') or str(body['result'].get('chat', {}).get('id')) != str(chat):
        raise ValueError('alert-unconfirmed')


def monitor(config, root=ROOT, clock=time.time, send=notify):
    with locked(root, 'monitor'):
        path = root / 'monitor.json'
        state = read_state(path)
        now = clock()
        started = state.setdefault('started_at', now)
        active = active_incidents(config, root, now, started)
        previous = state.get('active', [])
        pending = state.setdefault('pending', {})
        consumed = state.setdefault('consumed_failures', {})
        confirmed = state.setdefault('confirmed_failures', {})
        for job in PATHS:
            try:
                acknowledge_failure(root, job, confirmed.get(job, 0))
                with locked(root, job):
                    dead = read_state(root / (job + '.dead-letter.json'))
            except Busy:
                continue
            sequence = dead.get('sequence', 1 if dead else 0)
            if sequence <= max(consumed.get(job, 0), confirmed.get(job, 0), dead.get('ack_sequence', 0)):
                continue
            key = job + ':failure'
            event = 'incident:' + key
            if key in previous and event not in pending and confirmed.get(job, 0):
                # Same already-notified active episode: coalesce, no alert storm.
                confirmed[job] = sequence
            else:
                delivery = pending.setdefault(event, {'attempts': 0, 'next_at': now})
                delivery['failure_sequence'] = sequence
                delivery.setdefault('failure_at', dead.get('first_unconfirmed', {}).get('at', dead['at']))
                if key not in active:
                    pending.setdefault('recovery:' + key, {'attempts': 0, 'next_at': now})
            consumed[job] = sequence
        for key in set(active) - set(previous):
            pending.setdefault('incident:' + key, {'attempts': 0, 'next_at': now})
        for key in set(previous) - set(active):
            pending.setdefault('recovery:' + key, {'attempts': 0, 'next_at': now})
        for key in active:
            pending.pop('recovery:' + key, None)
        state.update(active=active, checked_at=now)
        atomic(path, state)
        delivered = 0
        for event, delivery in sorted(list(pending.items())):
            if event.startswith('recovery:') and event[len('recovery:'):] in active_incidents(config, root, clock(), started):
                pending.pop(event, None)
                atomic(path, state)
                continue
            if event.startswith('recovery:') and 'incident:' + event[len('recovery:'):] in pending:
                continue
            if delivery['attempts'] >= 3 or now < delivery['next_at']:
                continue
            if delivered >= 3:
                break
            delivered += 1
            # Reserve attempt durably before network, including monitor restarts.
            delivery['attempts'] += 1
            delivery['next_at'] = now + 60 * 2 ** (delivery['attempts'] - 1)
            atomic(path, state)
            try:
                send(event, config)
                if 'failure_sequence' in delivery:
                    job = event.split(':')[1]
                    confirmed[job] = max(confirmed.get(job, 0), delivery['failure_sequence'])
                del pending[event]
            except Exception:
                pass
            atomic(path, state)
        return {'active': active, 'pending_alerts': len(pending),
                'terminal_alerts': sum(x['attempts'] >= 3 for x in pending.values())}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('job', choices=[*PATHS, 'monitor', 'retry'])
    parser.add_argument('--reset-auth', action='store_true')
    args = parser.parse_args()
    os.umask(0o077)
    try:
        config = config_read()
        if args.job == 'monitor':
            result = monitor(config)
        elif args.job == 'retry':
            result = retry(config)
        else:
            result = run(args.job, config, reset=args.reset_auth)
        print(json.dumps({'job': args.job, 'result': result}))
        failures = {'auth', 'blocked', 'interrupted', 'preconnect', 'ambiguous', 'http-failure', 'application-failure'}
        if isinstance(result, str):
            return 1 if result in failures else 0
        if args.job == 'retry':
            return 1 if any(value in failures for value in result.values()) else 0
        return 1 if result.get('active') or result.get('terminal_alerts') else 0
    except Busy:
        print(json.dumps({'job': args.job, 'result': 'local-lock-skipped'}))
        return 0
    except Exception:
        print(json.dumps({'job': args.job, 'result': 'local-failure'}))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
