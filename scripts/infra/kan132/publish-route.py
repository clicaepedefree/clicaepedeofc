#!/usr/bin/env python3
import json
import os
import shutil
import tempfile
from pathlib import Path
import fcntl
import stat

def ownership_guard():
    if any(os.path.lexists('/etc/clicaepede/kan140/' + name)
           for name in ('ownership.json', 'managed')):
        raise SystemExit('ownership-rejected')

ownership_guard()
os.umask(0o077)
if os.geteuid() != 0:
    raise SystemExit('ownership-rejected')
lock_root = Path('/var/lib/clicaepede/kan133')
lock_root.mkdir(mode=0o700, parents=True, exist_ok=True)
metadata = lock_root.lstat()
if (lock_root.resolve() != lock_root or metadata.st_uid != 0
        or stat.S_IMODE(metadata.st_mode) != 0o700):
    raise SystemExit('ownership-rejected')
lock_fd = os.open('/var/lib/clicaepede/kan133/backup.lock',
                  os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
metadata = os.fstat(lock_fd)
if (not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != 0
        or stat.S_IMODE(metadata.st_mode) != 0o600 or metadata.st_nlink != 1):
    raise SystemExit('ownership-rejected')
fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
ownership_guard()

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
