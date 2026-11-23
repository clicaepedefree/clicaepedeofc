"""Root-only native controller preparation; never stops the legacy stack.

Credentials arrive as one bounded JSON object on stdin; not argv, env or disk.
The operator leaves a durable intent before native create's automatic deploy.
"""
import json
import os
from pathlib import Path
import re
import signal
import sys
import uuid

import managed_cutover as managed
import panel_client
import panel_preparation


class OperatorInterrupted(BaseException):
    """Must bypass the HTTP client's ordinary transport-error conversion."""


def interrupt_handler():
    interrupted = False
    def stop(signum, frame):
        nonlocal interrupted
        if not interrupted:
            interrupted = True
            raise OperatorInterrupted('operator-interrupted')
    return stop


def summarize(value):
    if isinstance(value, dict):
        result = {'fields': {k: type(v).__name__ for k, v in value.items()}}
        for key in ('enabled', 'running', 'finished', 'isRunning'):
            if type(value.get(key)) is bool:
                result[key] = value[key]
        if value.get('status') in ('pending', 'running', 'queued', 'success', 'error', 'failed', 'done'):
            result['status'] = value['status']
        return result
    if isinstance(value, list):
        return [summarize(row) for row in value[:20]]
    return {'type': type(value).__name__}


def main():
    managed.require(os.name == 'posix' and os.geteuid() == 0 and
                    os.environ.get('KAN140_NATIVE_PREPARATION') == 'true', 'native-opt-in-required')
    raw = sys.stdin.buffer.read(8193)
    managed.require(len(raw) <= 8192, 'input-limit')
    data = json.loads(raw)
    managed.require(isinstance(data, dict) and set(data) == {'mode', 'email', 'password'} and
                    data['mode'] in ('inspect', 'prepare', 'reconcile', 'materialize-fixture'), 'operator-input')
    sys.path.insert(0, '/opt/clicaepede/kan133')
    import backup
    managed.directory(managed.ROOT)
    docker = managed.Docker(managed.ROOT)
    stop = interrupt_handler()
    previous = {s: signal.signal(s, stop) for s in (signal.SIGINT, signal.SIGTERM)}
    try:
        with backup.locked(backup.ROOT):
            managed.require(not any((backup.ROOT / n).exists() for n in ('maintenance.json', 'restore_lease.json')),
                            'maintenance-pending')
            cfg = json.loads(managed.read_private(Path('/etc/clicaepede/kan135/config.json')))
            managed.require(cfg['whatsapp_enabled'] is False, 'worker-not-paused')
            with panel_client.Client(data.pop('email'), data.pop('password'), timeout=20) as api:
                mode = data['mode']
                if mode == 'inspect':
                    project = api.call('inspectProject', panel_client.project_payload())
                    domains = api.call('listDomains', {})
                    out = {'project': summarize(project), 'domains':summarize(domains)}
                    if isinstance(project, dict) and project.get('services'):
                        native = api.call('inspectComposeService', panel_client.service_payload())
                        out['native'] = summarize(native)
                        if isinstance(native, dict):
                            out['native_children'] = {k: summarize(v) for k, v in native.items() if isinstance(v, dict)}
                        out['actions'] = summarize(api.call('listActions', panel_client.actions_payload()))
                        rows = api.call('listActions', panel_client.actions_payload())
                        out['action_diagnostics'] = []
                        for row in rows[:3]:
                            if row.get('projectName') != panel_client.PROJECT or row.get('serviceName') != panel_client.SERVICE:
                                continue
                            action = api.call('getAction', panel_client.action_payload(row['id']))
                            strings = []
                            def collect(value):
                                if isinstance(value, str):strings.append(value.lower())
                                elif isinstance(value, dict):
                                    for child in value.values():collect(child)
                                elif isinstance(value, list):
                                    for child in value:collect(child)
                            collect(action)
                            text = '\n'.join(strings)
                            paths = re.findall(r"/(?:etc/clicaepede/kan140/panel-fixture|etc/easypanel)/[a-zA-Z0-9_./-]+", text)
                            safe_paths = [re.sub(r'[a-f0-9]{32}', '<nonce>', path) for path in paths]
                            out['action_diagnostics'].append({'shape':summarize(action), 'fixture_paths':safe_paths[:8], 'matches':[
                                phrase for phrase in ('no such file', 'not found', 'permission denied',
                                  'invalid', 'must be', 'is not allowed', 'additional property',
                                  'secret', 'config', 'network', 'pull access denied', 'error',
                                  'validating', 'cannot', 'failed', 'enoent', 'eacces') if phrase in text]})
                    return {'status': 'pass', 'phase': 'read-only-inspection', 'metadata': out,
                            'production_cutover': False}
                journal = managed.ROOT / 'panel-preparation.json'
                if mode == 'prepare':
                    managed.require(not os.path.lexists(journal), 'preparation-already-recorded')
                    nonce = uuid.uuid4().hex
                else:
                    saved = json.loads(managed.read_private(journal))
                    managed.require(saved['schema'] == 1 and saved['project'] == panel_client.PROJECT
                                    and saved['service'] == panel_client.SERVICE, 'preparation-journal-drift')
                    nonce = saved['nonce']
                managed.directory(managed.ROOT / 'panel-fixture')
                folder = managed.ROOT / 'panel-fixture' / nonce
                managed.directory(folder)
                for name in ('fixture-config', 'fixture-secret'):
                    managed.write_new(folder / name, b'KAN140_NON_SECRET_FIXTURE\n', 0o444)
                preparation = panel_preparation.Preparation(api, docker, folder,
                    lambda record: backup.atomic_json(journal, record), nonce=nonce)
                if mode == 'prepare':return preparation.run()
                if mode == 'materialize-fixture':
                    attempt = managed.ROOT / 'panel-materialization-attempt.json'
                    managed.require(not os.path.lexists(attempt), 'materialization-already-attempted')
                    managed.write_new(attempt, json.dumps({'schema':1,'nonce':nonce}).encode())
                    return preparation.materialize_fixture()
                return preparation.reconcile()
    finally:
        for signum, handler in previous.items():
            signal.signal(signum, handler)


if __name__ == '__main__':
    try:
        value = main()
        print(json.dumps(value, sort_keys=True))
    except BaseException as error:
        code = str(error) if isinstance(error, (OperatorInterrupted, managed.Rejected, panel_preparation.Rejected,
                                              panel_client.PanelError)) else 'private-operator-failed'
        print(json.dumps({'status': 'fail', 'code': code, 'production_cutover': False}))
        raise SystemExit(1)
