"""Provision a disabled native controller using dummy files, never live data.

Create is non-idempotent: record intent before calling and never retry it.
The existing Swarm stack and its volumes are not modified by this step.
"""
import hashlib
import json
import time
import uuid

import panel_client

LABEL = 'clicaepede.kan140.preparation'
IMAGE = 'postgres:17.11-bookworm@sha256:3645570cccdfa447589da9f57dd740faa29b30938e861289a5574b6ca6b03826'


class Rejected(Exception):
    pass


def require(value, code):
    if not value:
        raise Rejected(code)


def fixture_source(root, nonce):
    require(len(nonce) == 32 and all(c in '0123456789abcdef' for c in nonce), 'fixture-identity')
    return {'services': {'evolution': {
        'image': IMAGE, 'labels': {LABEL: nonce},
        'entrypoint': ['/bin/sh', '-ec'],
        'command': ['test -r /run/secrets/fixture-secret && '
                    'cmp -s /run/secrets/fixture-secret /run/configs/fixture-config'],
        'network_mode': 'none', 'restart': 'no', 'cpus': '0.10', 'mem_limit': '64m',
        'cap_drop': ['ALL'], 'security_opt': ['no-new-privileges:true'],
        'tmpfs': ['/var/lib/postgresql/data:ro'], 'logging': {'driver': 'none'},
        'secrets': ['fixture-secret'],
        'configs': [{'source': 'fixture-config', 'target': '/run/configs/fixture-config'}]}},
        'configs': {'fixture-config': {'file': str(root / 'fixture-config')}},
        'secrets': {'fixture-secret': {'file': str(root / 'fixture-secret')}}}


def service_record(value):
    require(isinstance(value, dict), 'native-inspect-shape')
    record = value.get('service', value)
    require(isinstance(record, dict), 'native-inspect-shape')
    return record


def source_matches(record, source):
    spec = record.get('source')
    require(isinstance(spec, dict) and spec.get('type') == 'inline'
            and isinstance(spec.get('content'), str), 'native-source-shape')
    try:
        parsed = json.loads(spec['content'])
    except (TypeError, ValueError):
        raise Rejected('native-source-unproven') from None
    require(parsed == source, 'native-source-drift')


def actions_terminal(value):
    require(isinstance(value, list) and 0 < len(value) <= 20, 'native-actions-shape')
    for row in value:
        require(isinstance(row, dict), 'native-actions-shape')
        require(row.get('projectName') == panel_client.PROJECT and
                row.get('serviceName') == panel_client.SERVICE, 'native-action-scope')
        status = row.get('status')
        require(status in ('pending', 'running', 'queued', 'success', 'error', 'failed', 'done'),
                'native-action-status')
        if status in ('pending', 'running', 'queued'):
            return False
    return True


class Preparation:
    def __init__(self, api, docker, root, save, *, nonce=None, seconds=120):
        self.api, self.docker, self.root, self.save = api, docker, root, save
        self.nonce = nonce or uuid.uuid4().hex
        self.source = fixture_source(root, self.nonce)
        self.end = time.monotonic() + seconds
        self.created = False
        self.owned = False

    def checkpoint(self, phase):
        self.save({'schema': 1, 'phase': phase, 'nonce': self.nonce,
                   'project': panel_client.PROJECT, 'service': panel_client.SERVICE,
                   'source_sha256': hashlib.sha256(json.dumps(self.source, sort_keys=True).encode()).hexdigest()})

    def inspect(self):
        record = service_record(self.api.call('inspectComposeService', panel_client.service_payload()))
        source_matches(record, self.source)
        self.owned = True
        return record

    def wait_container(self):
        while time.monotonic() < self.end:
            ids = self.docker.run('ps', '-aq', '--no-trunc', '--filter',
                                  'label=' + LABEL + '=' + self.nonce).stdout.decode().split()
            require(len(ids) <= 1, 'fixture-container-count')
            if ids:
                item = self.docker.data('container', 'inspect', ids[0])[0]
                require(item['Config']['Labels'].get(LABEL) == self.nonce and
                        item['Config']['Image'] == IMAGE and
                        item['HostConfig']['NetworkMode'] == 'none' and
                        not item['HostConfig'].get('PortBindings') and
                        item['HostConfig']['RestartPolicy']['Name'] == 'no', 'fixture-container-policy')
                require(all(not m['RW'] for m in item['Mounts'] if m['Type'] == 'bind') and
                        not any(m['Type'] == 'volume' for m in item['Mounts']), 'fixture-mount-policy')
                expected = {
                    (str(self.root / 'fixture-secret'), '/run/secrets/fixture-secret'),
                    (str(self.root / 'fixture-config'), '/run/configs/fixture-config'),
                }
                binds = [(m.get('Source'), m.get('Destination')) for m in item['Mounts'] if m['Type'] == 'bind']
                require(len(binds) == 2 and set(binds) == expected and
                        all(m['Type'] in ('bind', 'tmpfs') for m in item['Mounts']), 'fixture-bind-proof')
                definition = self.source['services']['evolution']
                require(item['Config'].get('Entrypoint') == definition['entrypoint'] and
                        item['Config'].get('Cmd') == definition['command'], 'fixture-command-proof')
                if item['State']['Status'] == 'exited':
                    require(item['State']['ExitCode'] == 0 and not item['State'].get('OOMKilled'),
                            'fixture-read-failed')
                    return item
            # Do not interpret an unknown action schema as successful deployment.
            self.api.call('listActions', panel_client.actions_payload())
            time.sleep(1)
        raise Rejected('native-preparation-timeout')

    def wait_idle(self):
        while time.monotonic() < self.end:
            if actions_terminal(self.api.call('listActions', panel_client.actions_payload())):
                return
            time.sleep(1)
        raise Rejected('native-actions-timeout')

    def run(self):
        project = self.api.call('inspectProject', panel_client.project_payload())
        require(isinstance(project, dict) and isinstance(project.get('project'), dict) and
                project['project'].get('name') == panel_client.PROJECT and
                project.get('services') == [], 'project-not-empty')
        self.checkpoint('creating')
        self.created = True  # Cover ambiguous POST outcome; never retry create.
        try:
            try:
                self.api.call('createComposeService', panel_client.create_compose_payload(
                    json.dumps(self.source), trusted_source=True), trusted_source=True)
            except panel_client.PanelError:
                # An empty/ambiguous response is reconciled by authoritative read.
                self.inspect()
            self.inspect()
            item = self.wait_container()
            self.wait_idle()
            self.api.call('stopComposeService', panel_client.service_payload())
            record = self.inspect()
            require(record.get('enabled') is False, 'native-controller-not-disabled')
            self.wait_idle()
            self.checkpoint('disabled-verified')
            return {'status': 'pass', 'phase': 'native-controller-prepared',
                    'fixture_host_files_readable': True, 'controller_enabled': False,
                    'compose_project': item['Config']['Labels'].get('com.docker.compose.project'),
                    'production_cutover': False}
        except BaseException:
            try:
                self.checkpoint('needs-reconciliation')
            finally:
                if self.created:
                    try:
                        self.inspect()  # Never stop a different source after ambiguous create.
                        self.api.call('stopComposeService', panel_client.service_payload())
                    except (panel_client.PanelError, Rejected):
                        pass
            raise

    def reconcile(self):
        self.inspect()  # Refuse to touch a different source under the same name.
        self.api.call('stopComposeService', panel_client.service_payload())
        record = self.inspect()
        require(record.get('enabled') is False, 'native-controller-not-disabled')
        self.wait_idle()
        self.checkpoint('disabled-reconciled')
        return {'status': 'pass', 'phase': 'native-controller-reconciled',
                'controller_enabled': False, 'production_cutover': False}

    def materialize_fixture(self):
        """Resume the exact disabled fixture; never repeat create.

        EasyPanel 2.38.1 create stores inline metadata but does not materialize
        code/docker-compose.yml. Its supported update endpoint does that step.
        """
        record = self.inspect()
        require(record.get('enabled') is False, 'native-controller-not-disabled')
        self.wait_idle()
        existing = self.docker.run('ps', '-aq', '--no-trunc', '--filter',
                                   'label=' + LABEL + '=' + self.nonce).stdout.decode().split()
        require(not existing, 'fixture-preexisting-container')
        self.created = True
        try:
            self.checkpoint('materializing-fixture')
            self.api.call('updateComposeSourceInline', panel_client.inline_source_payload(
                json.dumps(self.source), trusted_source=True), trusted_source=True)
            require(self.inspect().get('enabled') is False, 'native-controller-not-disabled')
            self.checkpoint('deploying-fixture')
            self.api.call('deployComposeService', panel_client.deploy_compose_payload())
            item = self.wait_container()
            self.wait_idle()
            self.api.call('stopComposeService', panel_client.service_payload())
            require(self.inspect().get('enabled') is False, 'native-controller-not-disabled')
            self.wait_idle()
            self.checkpoint('disabled-verified')
            return {'status': 'pass', 'phase': 'native-controller-prepared',
                    'fixture_host_files_readable': True, 'controller_enabled': False,
                    'compose_project': item['Config']['Labels'].get('com.docker.compose.project'),
                    'production_cutover': False}
        except BaseException:
            try:
                self.checkpoint('needs-reconciliation')
            finally:
                try:
                    self.inspect()
                    self.api.call('stopComposeService', panel_client.service_payload())
                except (panel_client.PanelError, Rejected):
                    pass
            raise
