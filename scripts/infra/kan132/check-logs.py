#!/usr/bin/env python3
import subprocess
from pathlib import Path

secrets = [path.read_text().strip() for path in
           Path('/etc/clicaepede/evolution-qa/secrets').iterdir() if path.is_file()]
assert secrets and all(len(value) >= 32 for value in secrets)
for service in ('postgres', 'redis', 'evolution'):
    logs = subprocess.run(['docker', 'service', 'logs', '--raw',
                           'clica-evolution-qa_' + service],
                          capture_output=True, text=True, check=True)
    content = logs.stdout + logs.stderr
    assert not any(secret in content for secret in secrets), 'Secret found in service logs'
    print(f'PASS: {service} logs contain none of the deployed secret values')
