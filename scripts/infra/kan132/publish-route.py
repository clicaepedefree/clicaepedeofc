#!/usr/bin/env python3
import json
import os
import shutil
import tempfile
from pathlib import Path

path = Path('/etc/easypanel/traefik/config/kan131-qa.yaml')
config = json.loads(path.read_text())
routers = config['http']['routers']
for name in ('kan131-block-panel-http', 'kan131-block-panel-https'):
    assert routers[name]['service'] == 'noop@internal', 'Panel guards missing'
qa = routers['kan131-evolution-qa-https']
assert qa['rule'] == 'Host(`evolution-staging.clicaepede.com.br`)'
assert qa['tls']['certResolver'] == 'letsencrypt'
backup = Path('/var/backups/kan132-qa-route-before.yaml')
if not backup.exists():
    shutil.copy2(path, backup)
qa['service'] = 'kan132-evolution'
config['http'].setdefault('services', {})['kan132-evolution'] = {
    'loadBalancer': {'passHostHeader': True, 'servers': [
        {'url': 'http://clica-evolution-qa_evolution:8080'}
    ]}
}
# Same filesystem, ignored temporary extension: file provider sees only the complete change.
fd, temporary = tempfile.mkstemp(dir=path.parent, suffix='.tmp')
try:
    with os.fdopen(fd, 'w') as output:
        json.dump(config, output, indent=2)
        output.write('\n')
    os.chmod(temporary, 0o644)
    os.replace(temporary, path)
finally:
    if os.path.exists(temporary):
        os.unlink(temporary)
print('QA route published; existing TLS, HTTP redirect and panel guards preserved')
