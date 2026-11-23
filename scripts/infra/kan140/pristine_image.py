"""Read migrations from a fresh pinned image, never a mutable workload.

Trusted root caller MUST hold backup.lock and install first-unwind signal
handlers (e.g. managed_lifecycle.interruption_handlers). BaseException cleanup
runs on that unwind; default SIGTERM/SIGKILL cannot execute Python finally.
docker is a bounded managed_cutover.Docker-compatible dependency. The callable
cleanup_factory() MUST construct a NEW Docker; its fresh budget is capped here
at 30 seconds. No SSH, startup API, secrets, real data mounts or native CLI.
checkpoint(dict) must durably replace the previous receipt, not append a PASS.
This helper does not approve cutover or modify the migration observer.
"""
import hashlib
import json
import math
import os
import re
import time
import uuid

import migration_contract

IMAGE = ('localhost:5001/clicaepede/evolution-api:2.3.7-node24.22.1-security20261022'
         '@sha256:4303aaffa99dd1e03a421cb24e3372dc0af07c8258cf82326aab157dd051c98d')
LABEL = 'clicaepede.kan140.prisma-fixture'
TMPFS = {'/evolution/instances': 'ro,nosuid,nodev,noexec,size=1048576'}
MAX_JSON = 128 * 1024
MIGRATION_COUNT = 57


class Rejected(RuntimeError):
    pass


def require(value):
    if not value:
        raise Rejected('pristine-image-rejected')


def _run(docker, *args):
    result = docker.run(*args)
    require(result.returncode == 0 and type(result.stdout) is bytes and
            len(result.stdout) <= MAX_JSON and type(result.stderr) is bytes and
            len(result.stderr) <= MAX_JSON)
    return result.stdout


def _json(docker, *args):
    def pairs(items):
        value = {}
        for key, item in items:
            require(key not in value)
            value[key] = item
        return value
    return json.loads(_run(docker, *args), object_pairs_hook=pairs,
                      parse_constant=lambda value: require(False))


def _one(docker, *args):
    value = _json(docker, *args)
    require(type(value) is list and len(value) == 1 and type(value[0]) is dict)
    return value[0]


def _ids(docker, name):
    rows = _run(docker, 'container', 'ls', '-aq', '--no-trunc', '--filter',
                'name=^/' + name + '$').decode('ascii').split()
    require(len(rows) <= 1 and all(re.fullmatch(r'[a-f0-9]{64}', cid) for cid in rows))
    return rows


def _owned(item, name, cid):
    require(item['Id'] == cid and item['Name'] == '/' + name and
            item['Config']['Labels'].get(LABEL) == name)
    # Never rm -v. Even cleanup refuses unexpected bind or volume attachments.
    require(type(item['Mounts']) is list and
            all(m.get('Type') == 'tmpfs' for m in item['Mounts']) and
            not item['HostConfig'].get('Binds') and not item['HostConfig'].get('Mounts') and
            not item['HostConfig'].get('VolumesFrom'))


def _configuration(item, name, cid, image_id, image_env):
    _owned(item, name, cid)
    config, host = item['Config'], item['HostConfig']
    require(item['Image'] == image_id and config['Image'] == IMAGE and
            config['Entrypoint'] == ['node'] and config['Cmd'] == ['-e', migration_contract.IMAGE_FILES] and
            config['WorkingDir'] == '/evolution' and config.get('Env') == image_env and
            config.get('Healthcheck', {}).get('Test') == ['NONE'] and
            not config.get('OpenStdin') and not config.get('Tty'))
    require(host['NetworkMode'] == 'none' and host['ReadonlyRootfs'] is True and
            host['CapDrop'] == ['ALL'] and not host.get('CapAdd') and
            host['SecurityOpt'] in (['no-new-privileges'], ['no-new-privileges:true']) and
            host['LogConfig']['Type'] == 'none' and host['NanoCpus'] == 100000000 and
            host['Memory'] == 134217728 and host['PidsLimit'] == 32 and
            host['Tmpfs'] == TMPFS and host['Privileged'] is False and
            host.get('RestartPolicy', {}).get('Name') == 'no' and
            not host.get('AutoRemove') and not host.get('PortBindings') and
            not host.get('Devices') and not host.get('DeviceRequests'))
    require(set(config.get('Volumes') or {}) <= set(TMPFS))
    require(all(m.get('Destination') == '/evolution/instances' and m.get('RW') is False
                and not m.get('Source') and not m.get('Name') for m in item['Mounts']))


def _files(raw):
    require(len(raw) <= MAX_JSON)
    rows = json.loads(raw)
    require(type(rows) is list and len(rows) == MIGRATION_COUNT)
    names = set()
    for row in rows:
        require(type(row) is dict and set(row) == {'name', 'checksum'} and
                type(row['name']) is str and re.fullmatch(r'[A-Za-z0-9_]{1,255}', row['name']) and
                type(row['checksum']) is str and re.fullmatch(r'[a-f0-9]{64}', row['checksum']) and
                row['name'] not in names)
        names.add(row['name'])
    return sorted(rows, key=lambda row: row['name'])


def inspect_migrations(docker, image_ref, *, cleanup_factory, checkpoint):
    """Return pristine name/checksum rows only after verified cleanup; else raise."""
    attempt = uuid.uuid4().hex
    name = 'kan140-prisma-fixture-' + attempt
    receipt = {'status': 'running', 'fixture': name, 'cleanup_verified': False,
               'attempt': attempt, 'gate': 'pristine-image-migrations', 'production_cutover': False}
    attempted = acknowledged = False
    failure = None
    rows = None
    try:
        checkpoint({**receipt, 'phase': 'starting'})
        require(hasattr(os, 'geteuid') and os.geteuid() == 0 and image_ref == IMAGE)
        image = _one(docker, 'image', 'inspect', IMAGE)
        image_id = image['Id']
        require(type(image_id) is str and re.fullmatch(r'sha256:[a-f0-9]{64}', image_id))
        repo_digest = IMAGE.split('@')[0].rsplit(':', 1)[0] + '@' + IMAGE.split('@')[1]
        require(repo_digest in image['RepoDigests'] and
                set(image['Config'].get('Volumes') or {}) <= set(TMPFS))
        require(not _ids(docker, name))
        checkpoint({**receipt, 'phase': 'create-intent'})
        attempted = True
        cid = _run(docker, 'create', '--name', name, '--label', LABEL + '=' + name,
                   '--network', 'none', '--read-only', '--cap-drop', 'ALL',
                   '--security-opt', 'no-new-privileges', '--log-driver', 'none',
                   '--cpus', '0.1', '--memory', '128m', '--pids-limit', '32',
                   '--no-healthcheck', '--pull', 'never', '--restart', 'no',
                   '--stop-timeout', '1', '--tmpfs',
                   '/evolution/instances:' + TMPFS['/evolution/instances'],
                   '--workdir', '/evolution', '--entrypoint', 'node', IMAGE,
                   '-e', migration_contract.IMAGE_FILES).decode('ascii').strip()
        require(re.fullmatch(r'[a-f0-9]{64}', cid))
        acknowledged = True
        item = _one(docker, 'container', 'inspect', cid)
        _configuration(item, name, cid, image_id, image['Config'].get('Env'))
        require(item['State']['Status'] == 'created' and item['State']['Running'] is False)
        checkpoint({**receipt, 'phase': 'start-intent'})
        output = _run(docker, 'start', '--attach', cid)
        item = _one(docker, 'container', 'inspect', cid)
        _configuration(item, name, cid, image_id, image['Config'].get('Env'))
        state = item['State']
        require(state['Status'] == 'exited' and state['Running'] is False and
                state['Restarting'] is False and state['OOMKilled'] is False and
                type(state['ExitCode']) is int and state['ExitCode'] == 0 and not state.get('Error'))
        rows = _files(output)
    except BaseException as error:
        failure = error
    finally:
        try:
            if attempted:
                cleaner = cleanup_factory()
                require(cleaner is not docker and type(cleaner.end) in (int, float) and
                        math.isfinite(cleaner.end) and cleaner.end > time.monotonic())
                cleaner.end = min(cleaner.end, time.monotonic() + 30)
                found = _ids(cleaner, name)
                # An unacknowledged create may still be in flight after absence.
                require(found or acknowledged)
                for own_id in found:
                    item = _one(cleaner, 'container', 'inspect', own_id)
                    _owned(item, name, own_id)
                    _run(cleaner, 'container', 'rm', '--force', own_id)
                require(not _ids(cleaner, name))
            receipt['cleanup_verified'] = True
        except BaseException as error:
            if failure is None:
                failure = error
        receipt.update(status='pass' if failure is None else 'fail', phase='complete')
        if failure is None:
            receipt.update(image_ref=IMAGE, image_id=image_id, migration_count=len(rows),
                           files_sha256=hashlib.sha256(json.dumps(rows, sort_keys=True,
                               separators=(',', ':')).encode()).hexdigest())
        try:
            checkpoint(dict(receipt))
        except BaseException as error:
            # A failed/ambiguous PASS write must be superseded by a FAIL attempt.
            receipt.update(status='fail', phase='checkpoint-failed')
            try:
                checkpoint(dict(receipt))
            except BaseException:
                pass
            if failure is None:
                failure = error
    if failure is not None:
        if not isinstance(failure, Exception):
            raise failure
        raise Rejected('pristine-image-failed') from None
    return rows
