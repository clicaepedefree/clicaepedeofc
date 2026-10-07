#!/usr/bin/env python3
"""Restricted offsite janitor. Dry-run unless explicitly invoked with --apply.

Main provisions the janitor's Auth identity/RLS and root:root 0600 config at
/etc/clicaepede/kan133/retention.json. No uploader/service-role credentials.
The restore gate is checked before Auth and again before deletion. The shared
backup lock prevents concurrent local backup/restore/retention runs. No paging,
redirects, retries, bucket-wide deletion, or more than 20 deletions per run.
"""

import base64
import contextlib
import datetime as dt
import json
import math
import os
from pathlib import Path
import re
import signal
import sys
import urllib.parse

import backup
from backup import request  # Existing no-redirect, no-proxy HTTPS transport.


CONFIG = Path('/etc/clicaepede/kan133/retention.json')
RESTORE = Path('/var/lib/clicaepede/kan133/last_restore.json')
BUCKET = 'infra-backups-qa'
PREFIX = 'kan133/evolution-qa/'
LIST_LIMIT = 1000
DELETE_LIMIT = 20
RETENTION_SECONDS = 7 * 86400
RUN_SECONDS = 180
UUID_PATTERN = r'[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}'
LEAF_PATTERN = r'(\d{8}T\d{6}Z)-' + UUID_PATTERN + r'\.age'


class GateError(Exception):
    """Static gate codes only; no HTTP, filenames or credential diagnostics."""


def require(condition, code):
    if not condition:
        raise GateError(code)


def owned_name(name):
    if not isinstance(name, str):
        return None
    leaf = name[len(PREFIX):] if name.startswith(PREFIX) else name
    match = re.fullmatch(LEAF_PATTERN, leaf)
    if match is None:
        return None
    try:
        dt.datetime.strptime(match[1], '%Y%m%dT%H%M%SZ')
    except ValueError:
        raise GateError('invalid-object-name-timestamp') from None
    return PREFIX + leaf


def timestamp(value):
    require(isinstance(value, str) and len(value) <= 64, 'invalid-created-at')
    try:
        parsed = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
        require(parsed.tzinfo is not None, 'invalid-created-at')
        epoch = parsed.timestamp()
        require(math.isfinite(epoch) and epoch >= 0, 'invalid-created-at')
        return epoch
    except (ValueError, OverflowError):
        raise GateError('invalid-created-at') from None


def listed_backups(objects, server_clock):
    """Normalize actual objects from this single prefix listing; ignore folders."""
    require(type(server_clock) in (int, float) and math.isfinite(server_clock) and
            server_clock > 0, 'invalid-server-clock')
    require(isinstance(objects, list), 'invalid-list-response')
    require(len(objects) < LIST_LIMIT, 'listing-truncated')
    rows = []
    names, ids = set(), set()
    for obj in objects:
        require(isinstance(obj, dict), 'invalid-list-entry')
        name = owned_name(obj.get('name'))
        if name is None or obj.get('id') is None:
            continue  # Folder entries have null id/metadata/timestamps.
        require(isinstance(obj['id'], str) and re.fullmatch(UUID_PATTERN, obj['id']) and
                isinstance(obj.get('metadata'), dict), 'invalid-object-metadata')
        require(obj.get('bucket_id', BUCKET) == BUCKET, 'foreign-bucket')
        require(name not in names and obj['id'] not in ids, 'duplicate-object')
        created = timestamp(obj.get('created_at'))
        require(created <= server_clock, 'future-object-clock')
        leaf_clock = dt.datetime.strptime(name[len(PREFIX):].split('-')[0],
                                         '%Y%m%dT%H%M%SZ').replace(tzinfo=dt.timezone.utc).timestamp()
        require(leaf_clock <= server_clock, 'future-object-clock')
        # An updated object is not an immutable backup, regardless of its name.
        if obj.get('updated_at') is not None:
            require(timestamp(obj['updated_at']) == created, 'non-immutable-object')
        rows.append((name, created, obj['id']))
        names.add(name)
        ids.add(obj['id'])
    return sorted(rows, key=lambda row: (row[1], row[2]), reverse=True)


def eligible(objects, server_clock):
    """Pure retention policy. Age uses Storage created_at, not filename/host time.

    Always preserve the two newest actual backups. Requiring two *strictly*
    newer timestamps also preserves boundary ties, conservatively matching RLS.
    Returns oldest-first full keys; caller caps deletes separately.
    """
    rows = listed_backups(objects, server_clock)
    if len(rows) < 3:
        return []
    second_newest = rows[1][1]
    return [name for name, created, _id in reversed(rows[2:])
            if server_clock - created >= RETENTION_SECONDS and created < second_newest]


def restore_gate():
    try:
        state = backup.read_json(RESTORE)
    except (OSError, ValueError, backup.Failure):
        raise GateError('restore-evidence-required') from None
    require(isinstance(state, dict) and state.get('status') == 'pass' and
            state.get('offsite_download_hash_verified') is True and
            state.get('offsite_key_decryption_verified') is True and
            state.get('cleanup_verified') is True, 'restore-evidence-required')


def settings():
    try:
        value = backup.read_json(CONFIG)  # O_NOFOLLOW, root-owned regular 0600/nlink=1.
    except (OSError, ValueError, backup.Failure):
        raise GateError('janitor-private-config-required') from None
    fields = {'supabase_url', 'anon_key', 'janitor_email', 'janitor_password'}
    require(isinstance(value, dict) and set(value) == fields, 'janitor-config-fields')
    require(all(isinstance(value[k], str) and 0 < len(value[k]) <= 8192 and
                '\x00' not in value[k] and '\r' not in value[k] and '\n' not in value[k]
                for k in fields), 'janitor-config-values')
    url = urllib.parse.urlsplit(value['supabase_url'])
    require(url.scheme == 'https' and url.hostname == backup.SUPABASE_HOST and
            url.port in (None, 443) and not url.username and not url.password and
            url.path in ('', '/') and not url.query and not url.fragment, 'janitor-config-host')
    key = value['anon_key']
    if key.startswith('sb_publishable_'):
        require(re.fullmatch(r'sb_publishable_[A-Za-z0-9_-]{16,256}', key), 'anon-key-required')
    else:
        require(not key.startswith('sb_secret_') and backup.jwt_role(key) == 'anon', 'anon-key-required')
    return {**value, 'supabase_url': value['supabase_url'].rstrip('/')}


def login(config):
    session = json.loads(request(config['supabase_url'] + '/auth/v1/token?grant_type=password',
                                 'POST', {'apikey': config['anon_key'], 'Content-Type': 'application/json'},
                                 json.dumps({'email': config['janitor_email'],
                                             'password': config['janitor_password']}).encode(), 65536))
    require(isinstance(session, dict), 'invalid-auth-session')
    token = session.get('access_token')
    require(isinstance(token, str) and len(token) <= 16384 and '\r' not in token and '\n' not in token,
            'invalid-auth-token')
    try:
        payload = token.split('.')[1]
        claims = json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))
    except (ValueError, IndexError, TypeError):
        raise GateError('invalid-auth-token') from None
    user = session.get('user')
    require(isinstance(claims, dict) and isinstance(user, dict) and
            claims.get('role') == 'authenticated' and isinstance(user.get('id'), str) and
            re.fullmatch(UUID_PATTERN, user['id']) and claims.get('sub') == user['id'] and
            user.get('email') == config['janitor_email'] and
            isinstance(user.get('app_metadata'), dict) and
            user['app_metadata'].get('purpose') == 'kan133-backup-retention', 'janitor-identity-required')
    # Transport is fixed-host HTTPS without redirects. This fresh password-login
    # response is the trust source, not a JWT received from a caller or disk.
    require(type(claims.get('iat')) is int and type(claims.get('exp')) is int and
            0 < claims['iat'] < claims['exp'], 'invalid-server-clock')
    return token, claims['iat']


@contextlib.contextmanager
def bounded():
    def expired(_signum, _frame):
        raise GateError('retention-timeout')
    previous = signal.signal(signal.SIGALRM, expired)
    timer = signal.setitimer(signal.ITIMER_REAL, RUN_SECONDS)
    try:
        yield
    finally:
        signal.setitimer(signal.ITIMER_REAL, *timer)
        signal.signal(signal.SIGALRM, previous)


def run(apply=False):
    counts = {'listed': 0, 'eligible': 0, 'selected': 0, 'deleted': 0}
    stage = 'restore-evidence'
    try:
        restore_gate()
        stage = 'janitor-config'
        config = settings()
        stage = 'fresh-auth-login'
        token, clock = login(config)
        headers = {'apikey': config['anon_key'], 'Authorization': 'Bearer ' + token,
                   'Content-Type': 'application/json'}
        stage = 'storage-list'
        objects = json.loads(request(config['supabase_url'] + '/storage/v1/object/list/' + BUCKET,
                                     'POST', headers, json.dumps({'prefix': PREFIX, 'limit': LIST_LIMIT,
                                     'sortBy': {'column': 'created_at', 'order': 'desc'}}).encode(), 2 * 1024 * 1024))
        rows = listed_backups(objects, clock)
        counts['listed'] = len(rows)
        candidates = eligible(objects, clock)
        counts['eligible'] = len(candidates)
        selected = candidates[:DELETE_LIMIT]
        counts['selected'] = len(selected)
        if apply and selected:
            stage = 'restore-evidence-recheck'
            restore_gate()
            listed = {row[0] for row in rows}
            require(len(selected) <= DELETE_LIMIT and len(set(selected)) == len(selected) and
                    all(name in listed and owned_name(name) == name for name in selected), 'delete-scope')
            stage = 'storage-delete'
            deleted = json.loads(request(config['supabase_url'] + '/storage/v1/object/' + BUCKET,
                                         'DELETE', headers, json.dumps({'prefixes': selected}).encode(), 65536))
            require(isinstance(deleted, list), 'invalid-delete-response')
            names = []
            for obj in deleted:
                require(isinstance(obj, dict) and obj.get('name') in selected and
                        obj.get('bucket_id', BUCKET) == BUCKET, 'invalid-delete-response')
                names.append(obj['name'])
            require(len(set(names)) == len(names), 'invalid-delete-response')
            counts['deleted'] = len(names)
            require(set(names) == set(selected), 'delete-incomplete')
        return {'status': 'pass', 'gate': 'retention-applied' if apply else 'retention-dry-run',
                'dry_run': not apply, **counts}
    except GateError as error:
        return {'status': 'fail', 'gate': str(error), 'stage': stage, 'dry_run': not apply, **counts}
    except Exception:
        return {'status': 'fail', 'gate': 'retention-operation-failed', 'stage': stage,
                'dry_run': not apply, **counts}


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if argv not in ([], ['--apply']):
        print(json.dumps({'status': 'fail', 'gate': 'invalid-command'}))
        return 1
    try:
        require(sys.platform == 'linux' and os.geteuid() == 0, 'linux-root-required')
        with bounded(), backup.locked(backup.ROOT):
            result = run(apply=bool(argv))
    except GateError as error:
        result = {'status': 'fail', 'gate': str(error)}
    except BaseException:
        result = {'status': 'fail', 'gate': 'retention-operation-failed'}
    print(json.dumps(result, sort_keys=True))
    return 0 if result['status'] == 'pass' else 1


if __name__ == '__main__':
    sys.exit(main())
