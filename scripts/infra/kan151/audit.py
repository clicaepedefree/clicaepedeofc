#!/usr/bin/env python3
"""Read-only, bounded Evolution privacy inventory. Never emits raw logs/secrets."""
import base64
import hashlib
import json
from pathlib import Path
import re
import os
import selectors
import subprocess
import sys
import time
import urllib.request

SERVICE = 'clica-evolution-qa_evolution'


def command(args, timeout=40):
    result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            timeout=timeout, check=True)
    return result.stdout


def inspect(args):
    return json.loads(command(args))


def bounded_logs(args, maximum=64 * 1024 * 1024, timeout=60):
    assert isinstance(maximum, int) and 0 < maximum <= 64 * 1024 * 1024
    assert 0 < timeout <= 120
    process = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, bufsize=0)
    values = {'stdout': bytearray(), 'stderr': bytearray()}
    end = time.monotonic() + timeout
    with selectors.DefaultSelector() as ready:
        ready.register(process.stdout, selectors.EVENT_READ, 'stdout')
        ready.register(process.stderr, selectors.EVENT_READ, 'stderr')
        try:
            total = 0
            while ready.get_map():
                remaining = end - time.monotonic()
                if remaining <= 0:
                    raise TimeoutError('Bounded log read expired')
                for key, _ in ready.select(min(remaining, 1)):
                    chunk = os.read(key.fd, min(65536, maximum - total + 1))
                    if not chunk:
                        ready.unregister(key.fileobj)
                    else:
                        if total + len(chunk) > maximum:
                            raise ValueError('Log byte ceiling reached')
                        values[key.data].extend(chunk)
                        total += len(chunk)
            assert process.wait(timeout=max(1, end-time.monotonic())) == 0
            return {key: bytes(value) for key, value in values.items()}
        finally:
            if process.poll() is None:
                process.kill()
                process.wait(timeout=5)
            process.stdout.close()
            process.stderr.close()


def main(current_only=False):
    service = inspect(['docker', 'service', 'inspect', SERVICE])[0]
    spec = service['Spec']['TaskTemplate']['ContainerSpec']
    ids = command(['docker', 'ps', '-q', '--filter',
                   'label=com.docker.swarm.service.name=' + SERVICE]).decode().split()
    assert len(ids) == 1
    container = inspect(['docker', 'inspect', ids[0]])[0]
    config = json.loads(Path('/etc/clicaepede/kan135/config.json').read_text())
    key = command(['docker', 'exec', ids[0], 'cat', '/run/secrets/api_key']).decode().strip()

    def provider(route):
        request = urllib.request.Request('https://evolution-staging.clicaepede.com.br' + route,
                                         headers={'apikey': key})
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.load(response)

    state = provider('/instance/connectionState/clica-store-9-wa-1')
    webhook = provider('/webhook/find/clica-store-9-wa-1')
    source_configs = []
    for item in spec.get('Configs', []):
        data = inspect(['docker', 'config', 'inspect', item['ConfigID']])[0]
        source = base64.b64decode(data['Spec']['Data'])
        source_configs.append({'name': item['ConfigName'], 'target': item['File']['Name'],
                               'sha256': hashlib.sha256(source).hexdigest()})

    args = ['docker', 'logs', '--since', '168h', '--tail', '10000', ids[0]] if current_only else [
        'docker', 'service', 'logs', '--raw', '--no-trunc', '--since', '168h', '--tail', '10000', SERVICE]
    logs = bounded_logs(args)
    jid = re.compile(rb'(?i)\b[0-9]{5,20}(?:[-:][0-9]{1,20})?@(?:s\.whatsapp\.net|c\.us|lid|g\.us)\b')
    samples = {name: {'bytes': len(value), 'jidOccurrences': len(jid.findall(value)),
                      'pseudonymousJidOccurrences': len(re.findall(rb'\[JID:[a-f0-9]{32}\]', value)),
                      'pseudonymousPhoneOccurrences': len(re.findall(rb'\[PHONE:[a-f0-9]{32}\]', value))}
               for name, value in logs.items()}
    canonical = Path('/opt/clicaepede/kan132/stack.yaml')
    canonical_stack = json.loads(canonical.read_text())
    result = {
        'scope': SERVICE, 'readOnly': True, 'currentContainerOnly': current_only,
        'image': spec['Image'],
        'health': container['State'].get('Health', {}).get('Status'),
        'node': command(['docker', 'exec', ids[0], 'node', '--version']).decode().strip(),
        'replicas': service['Spec']['Mode']['Replicated']['Replicas'],
        'configSources': source_configs,
        'mounts': [{'type': m['Type'], 'target': m['Target']} for m in spec.get('Mounts', [])],
        'logOptions': service['Spec']['TaskTemplate'].get('LogDriver', {}),
        'canonicalImageMatches': canonical_stack['services']['evolution']['image'] == spec['Image'],
        'canonicalStackSha256': hashlib.sha256(canonical.read_bytes()).hexdigest(),
        'protectedContainerSpecSha256': hashlib.sha256(json.dumps(spec, sort_keys=True, separators=(',', ':')).encode()).hexdigest(),
        'providerState': state.get('instance', state).get('state'),
        'webhookEnabled': webhook.get('enabled'),
        'workerEnabled': config.get('whatsapp_enabled'),
        'workerTimer': command(['systemctl', 'show', 'kan135-whatsapp.timer',
                                '-p', 'ActiveState', '--value']).decode().strip(),
        'logsSevenDaysMax10000Lines': samples,
        'limits': 'Occurrences are not distinct contacts. No raw logs collected or deleted.'}
    print(json.dumps(result))


if __name__ == '__main__':
    try:
        assert sys.argv[1:] in ([], ['current'])
        main(sys.argv[1:] == ['current'])
    except BaseException as error:
        print(json.dumps({'status': 'AUDIT_FAILED', 'class': type(error).__name__}))
        raise SystemExit(1)
