#!/usr/bin/env python3
"""Owned, no-egress QA resources used to exercise SIGKILL orphan cleanup."""
import json
import os
from pathlib import Path
import signal
import subprocess
import tempfile
import backup
import restore
with backup.locked(backup.ROOT):
    lease=backup.ROOT/'restore_lease.json'
    backup.require(not lease.exists())
    directory=Path(tempfile.mkdtemp(prefix='restore-offsite-',dir=backup.ROOT))
    validator=restore.Validator(directory,seconds=200)
    backup.atomic_json(lease,{'owner':validator.owner,'directory':str(directory)})
    (directory/'plaintext-non-secret-fixture').write_text('KAN133 orphan cleanup proof')
    temp=Path(tempfile.mkdtemp(prefix=validator.owner+'-',dir=backup.ROOT))
    (temp/'non-secret-fixture').write_text('KAN133 private staging cleanup proof')
    label=restore.LABEL+'='+validator.owner
    def docker(*args):
        subprocess.run(['docker',*args],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=15)
    docker('network','create','--internal','--label',label,validator.network)
    volume=validator.owner+'-redis-data'
    docker('volume','create','--label',label,volume)
    image=restore.stack_contract()['redis']['image']
    docker('container','create','--name',validator.containers['redis'],'--label',label,'--pull','never',
           '--network',validator.network,'--memory','32m','--pids-limit','32','--log-driver','none',
           '--mount','type=volume,source='+volume+',target=/data','--entrypoint','/bin/sh',image,'-c','sleep 120')
    docker('container','start',validator.containers['redis'])
    print(json.dumps({'drill':'restore-orphans-prepared','next':'intentional-SIGKILL'}),flush=True)
    os.kill(os.getpid(),signal.SIGKILL)
