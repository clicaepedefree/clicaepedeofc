#!/usr/bin/env python3
"""Receive offsite age identity over SSH stdin only; never persist it on the VPS."""
import hashlib
import json
import os
import signal
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import time
import backup
import restore

def finish(root,lease,result,started):
    # Keep the recovery lease until TemporaryDirectory removed all plaintext.
    backup.require(not root.exists())
    if result.get('cleanup_verified'):
        lease.unlink()
        backup.sync_dir(backup.ROOT)
    result.update(offsite_download_hash_verified=True,offsite_key_decryption_verified=True,
                  total_elapsed_seconds=round(time.monotonic()-started,3))
    backup.atomic_json(backup.ROOT/'last_restore.json',result)
    print(json.dumps(result,sort_keys=True))
    return 0 if result['status']=='pass' else 1

def main():
    os.umask(0o077)
    def interrupted(_signal,_frame):
        raise restore.GateError('restore-interrupted')
    signal.signal(signal.SIGTERM,interrupted)
    signal.signal(signal.SIGINT,interrupted)
    started=time.monotonic()
    identity=sys.stdin.buffer.read(4097)
    backup.require(len(identity)<=4096 and b'AGE-SECRET-KEY-1' in identity)
    with backup.locked(backup.ROOT):
        settings=backup.config()
        state=backup.read_json(backup.ROOT/'last_backup.json')
        headers={'apikey':settings['anon_key'],'Content-Type':'application/json'}
        session=json.loads(backup.request(settings['supabase_url']+'/auth/v1/token?grant_type=password','POST',headers,
                       json.dumps({'email':settings['uploader_email'],'password':settings['uploader_password']}).encode(),65536))
        data=backup.request(settings['supabase_url']+'/storage/v1/object/authenticated/infra-backups-qa/'+state['name'],'GET',
                            {'apikey':settings['anon_key'],'Authorization':'Bearer '+session['access_token']})
        backup.require(len(data)==state['size'] and hashlib.sha256(data).hexdigest()==state['sha256'])
        with tempfile.TemporaryDirectory(prefix='restore-offsite-',dir=backup.ROOT) as directory:
            root=Path(directory)
            unpack=root/'input'
            unpack.mkdir(mode=0o700)
            validator=restore.Validator(unpack,'config/evolution-qa/secrets',200)
            lease=backup.ROOT/'restore_lease.json'
            backup.require(not lease.exists())
            backup.atomic_json(lease,{'owner':validator.owner,'directory':str(root)})
            encrypted=root/'bundle.age'
            encrypted.write_bytes(data)
            tar=root/'bundle.tar.gz'
            subprocess.run(['age','--decrypt','--identity','-','--output',str(tar),str(encrypted)],input=identity,
                           stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=30,check=True)
            identity=b''
            with tarfile.open(tar,'r:*') as archive:
                members=archive.getmembers()
                backup.require(len(members)<=100000 and sum(m.size for m in members)<=256*1024*1024)
                for member in members:
                    path=Path(member.name)
                    backup.require(not path.is_absolute() and '..' not in path.parts and (member.isdir() or member.isfile()))
                    member.uid=member.gid=0
                    member.uname=member.gname='root'
                    member.mode=0o700 if member.isdir() else 0o600
                archive.extractall(unpack,members=members,filter='data')
            result=validator.run()
        return finish(root,lease,result,started)

if __name__=='__main__':
    try:
        raise SystemExit(main())
    except Exception:
        print('{"status":"fail","gate":"offsite-restore-wrapper"}')
        raise SystemExit(1)
