"""Opt-in real Swarm controller test. Synthetic sleepers, NOT application QA.

Uses independent service/volume/network names and a private control directory.
Does not publish canonical ownership, load credentials, pair or send messages.
"""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from unittest import mock
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'kan133'))
import backup
import runtime

LABEL = 'clicaepede.kan140.controller-probe'
ENABLED = os.name == 'posix' and os.environ.get('KAN140_SWARM_CONTROL_INTEGRATION') == 'true'


@unittest.skipUnless(ENABLED, 'opt-in synthetic Swarm controller rehearsal')
class NativeSwarmControlTests(unittest.TestCase):
    def test_pause_resume_recreated_id_and_stale_marker_fencing(self):
        self.assertEqual(os.geteuid(), 0)
        project = 'kan140-control-' + uuid.uuid4().hex[:16]
        volume_names = {role: project + '-' + role for role in runtime.ROLES}
        # All three sleepers use the PG image, including its declared VOLUME.
        targets = dict.fromkeys(runtime.ROLES, '/var/lib/postgresql/data')
        network = project + '-net'
        services = []
        created_volumes = []
        network_created = False
        competing = project + '-opposite'
        competing_created = False
        canonical = Path('/opt/clicaepede/kan132/stack.yaml')
        self.assertEqual(canonical.resolve(strict=True), canonical)
        self.assertEqual(canonical.stat().st_uid, 0)
        self.assertEqual(canonical.stat().st_mode & 0o777, 0o600)
        image = json.loads(canonical.read_text())['services']['postgres']['image']
        self.assertRegex(image, r'^postgres:17\.11-bookworm@sha256:[a-f0-9]{64}$')
        with tempfile.TemporaryDirectory(prefix=project + '-', dir='/opt/clicaepede') as directory:
            root = Path(directory)
            root.chmod(0o700)
            control, state = root / 'control', root / 'state'
            control.mkdir(mode=0o700)
            state.mkdir(mode=0o700)

            def docker(*args, check=True):
                result = subprocess.run(['docker', '--host', 'unix:///var/run/docker.sock',
                                         '--config', str(root), *args],
                                        capture_output=True, text=True, timeout=30)
                if check and result.returncode:
                    raise AssertionError('synthetic-controller-docker-rejected')
                return result

            def inspect_service(identity):
                row = json.loads(docker('service', 'inspect', identity).stdout)[0]
                self.assertEqual(row['Spec']['Labels'][LABEL], project)
                return row

            def wait_healthy(identity):
                end = time.monotonic() + 90
                while time.monotonic() < end:
                    ids = docker('ps', '-q', '--no-trunc', '--filter',
                                 'label=com.docker.swarm.service.id=' + identity).stdout.split()
                    if len(ids) == 1:
                        item = json.loads(docker('inspect', ids[0]).stdout)[0]
                        if item['State'].get('Health', {}).get('Status') == 'healthy':
                            return ids[0]
                    time.sleep(1)
                self.fail('synthetic-controller-not-healthy')

            def private_json(path, value):
                raw = json.dumps(value, sort_keys=True, separators=(',', ':')).encode()
                path.write_bytes(raw)
                path.chmod(0o600)
                return hashlib.sha256(raw).hexdigest()

            docker('image', 'inspect', image)
            node = json.loads(docker('info', '--format', '{{json .Swarm}}').stdout)
            self.assertTrue(node['ControlAvailable'])
            try:
                docker('network', 'create', '--driver', 'overlay', '--internal',
                       '--label', LABEL + '=' + project, network)
                network_created = True
                for role in runtime.ROLES:
                    name = volume_names[role]
                    absent = docker('volume', 'inspect', name, check=False)
                    self.assertNotEqual(absent.returncode, 0)
                    docker('volume', 'create', '--label', LABEL + '=' + project, name)
                    created_volumes.append(name)
                    target = targets[role]
                    result = docker('service', 'create', '--detach', '--name', project + '_' + role,
                                    '--label', 'com.docker.stack.namespace=' + project,
                                    '--label', LABEL + '=' + project,
                                    '--container-label', 'com.docker.stack.namespace=' + project,
                                    '--network', network, '--replicas', '1',
                                    '--limit-cpu', '0.10', '--limit-memory', '64m',
                                    '--mount', f'type=volume,src={name},dst={target}',
                                    '--health-cmd', 'test -f ' + target + '/.controller-probe',
                                    '--health-interval', '1s', '--health-retries', '30',
                                    '--entrypoint', '/bin/sh', image, '-ec',
                                    'printf fixture > ' + target + '/.controller-probe; exec sleep 3600')
                    identity = result.stdout.strip()
                    self.assertRegex(identity, r'^[a-z0-9]{25}$')
                    services.append(identity)
                    wait_healthy(identity)
                source = {'project': project, 'services': {}}
                pins = {}
                for role, identity in zip(runtime.ROLES, services):
                    spec = inspect_service(identity)['Spec']
                    source['services'][role] = {'service_id': identity, 'spec': spec}
                    pins[role] = {'service_id': identity,
                                  'container_spec_sha256': runtime.spec_hash(spec['TaskTemplate']['ContainerSpec'])}
                source_hash = private_json(control / 'swarm.json', source)
                receipt = {'schema': 1, 'generation': 2, 'runtime': 'swarm', 'project': project,
                           'source_sha256': source_hash, 'compose_controller_disabled': True}
                receipt_hash = private_json(control / 'compose-disabled.json', receipt)
                owner = {'schema': 1, 'state': 'active', 'runtime': 'swarm', 'generation': 2,
                         'project': project, 'services': dict.fromkeys(runtime.ROLES, image),
                         'volumes': volume_names, 'mount_hashes': {}, 'swarm_services': pins,
                         'source': {'path': str(control / 'swarm.json'), 'sha256': source_hash},
                         'handoff': {'path': str(control / 'compose-disabled.json'), 'sha256': receipt_hash}}
                # No actual previous controller: generation one is a synthetic held transition.
                private_json(control / 'managed', {'schema': 1, 'generation': 1})
                private_json(control / 'ownership.json', {'state': 'blocked'})
                with mock.patch.multiple(runtime, ROOT=control, MANIFEST=control / 'ownership.json',
                                         SENTINEL=control / 'managed', SWARM_PROJECT=project,
                                         SWARM_VOLUMES=volume_names, TARGETS=targets), backup.locked(state):
                    runtime.publish(owner)
                    executor = backup.Executor(state)
                    active = executor.active_runtime()
                    old_id = active.containers('evolution')[0]['Id']
                    executor.pause()
                    saved = backup.read_json(executor.marker)
                    self.assertEqual(saved['service_id'], pins['evolution']['service_id'])
                    self.assertEqual(executor.replicas(), 0)
                    executor.recover(interrupted=False)
                    new_id = active.containers('evolution')[0]['Id']
                    self.assertNotEqual(old_id, new_id)
                    self.assertFalse(executor.marker.exists())
                    self.assertTrue((control / 'managed').exists())
                    executor.pause()
                    original = backup.read_json(executor.marker)
                    stale = json.loads(json.dumps(original))
                    stale['ownership']['generation'] = 1
                    private_json(executor.marker, stale)
                    with self.assertRaises(backup.StageFailure):
                        executor.recover(interrupted=False)
                    self.assertEqual(executor.replicas(), 0)
                    self.assertTrue(executor.marker.exists())
                    private_json(executor.marker, original)
                    executor.recover(interrupted=False)
                    docker('container', 'create', '--name', competing, '--network', 'none',
                           '--tmpfs', '/var/lib/postgresql/data:ro',
                           '--restart', 'always', '--label', LABEL + '=' + project,
                           '--label', 'clicaepede.owner=easypanel-compose-qa',
                           '--entrypoint', '/bin/true', image)
                    competing_created = True
                    with self.assertRaises(backup.StageFailure):
                        executor.pause()
                    self.assertEqual(executor.replicas(), 1)
                    self.assertFalse(executor.marker.exists())
            finally:
                if competing_created:
                    item = json.loads(docker('inspect', competing).stdout)[0]
                    self.assertEqual(item['Config']['Labels'][LABEL], project)
                    self.assertFalse(any(m['Type'] == 'volume' for m in item['Mounts']))
                    docker('container', 'rm', '-v', competing)
                listed = docker('service', 'ls', '--filter', 'label=' + LABEL + '=' + project,
                                '--format', '{{.ID}}').stdout.split()
                cleanup_ids = [inspect_service(identity)['ID'] for identity in listed]
                for identity in cleanup_ids:
                    inspect_service(identity)
                    docker('service', 'rm', identity)
                end = time.monotonic() + 60
                while time.monotonic() < end:
                    ids = docker('ps', '-aq', '--no-trunc', '--filter',
                                 'label=com.docker.stack.namespace=' + project).stdout.split()
                    if not ids:
                        break
                    for identity in ids:
                        result = docker('container', 'inspect', identity, check=False)
                        absent = f'Error response from daemon: No such container: {identity}'
                        if result.returncode:
                            self.assertEqual(result.stderr.strip(), absent)
                            continue
                        item = json.loads(result.stdout)[0]
                        self.assertEqual(item['Config']['Labels']['com.docker.stack.namespace'], project)
                        self.assertIn(item['Config']['Labels']['com.docker.swarm.service.id'], cleanup_ids)
                        if not item['State']['Running'] and not item['State'].get('Restarting'):
                            removed = docker('container', 'rm', identity, check=False)
                            if removed.returncode:
                                self.assertEqual(removed.stderr.strip(), absent)
                    time.sleep(1)
                self.assertFalse(docker('ps', '-aq', '--filter',
                                        'label=com.docker.stack.namespace=' + project).stdout.strip())
                cleanup_networks = docker('network', 'ls', '-q', '--filter',
                                          'label=' + LABEL + '=' + project).stdout.split()
                for identity in cleanup_networks:
                    item = json.loads(docker('network', 'inspect', identity).stdout)[0]
                    self.assertEqual(item['Labels'][LABEL], project)
                    self.assertEqual(item['Name'], network)
                    def foreign_endpoints(value):
                        return {key: endpoint for key, endpoint in value.get('Containers', {}).items()
                                if not (key.startswith('lb-') and
                                        endpoint.get('Name') == network + '-endpoint')}
                    end = time.monotonic() + 60
                    while foreign_endpoints(item) and time.monotonic() < end:
                        time.sleep(1)
                        item = json.loads(docker('network', 'inspect', identity).stdout)[0]
                    self.assertFalse(foreign_endpoints(item))
                    docker('network', 'rm', identity)
                cleanup_volumes = docker('volume', 'ls', '-q', '--filter',
                                         'label=' + LABEL + '=' + project).stdout.split()
                for name in cleanup_volumes:
                    self.assertIn(name, volume_names.values())
                    item = json.loads(docker('volume', 'inspect', name).stdout)[0]
                    self.assertEqual(item['Labels'][LABEL], project)
                    docker('volume', 'rm', name)
                self.assertFalse(docker('volume', 'ls', '-q', '--filter',
                                       'label=' + LABEL + '=' + project).stdout.strip())


if __name__ == '__main__':
    unittest.main()
