"""Opt-in native full-ServiceSpec/CAS probe. Synthetic service only."""
import copy
import json
import hashlib
import inspect
import os
from pathlib import Path
import signal
import sys
import time
import uuid

import engine_transport
import managed_cutover as managed
import managed_lifecycle as lifecycle
import volume_transfer

LABEL = 'clicaepede.kan140.engine-probe'


def require(value):
    if not value:
        raise RuntimeError('engine-probe-rejected')


class Interrupted(BaseException):
    pass


class InterruptState:
    seen = False
    cleaning = False
    def handle(self, signum, frame):
        if not self.seen:
            self.seen = True
            if not self.cleaning:raise Interrupted()


def rehearse(docker, sdk_factory=engine_transport.UnixEngineAPI, *, cleanup_factory,
             checkpoint, interrupt=None):
    interrupt = interrupt or InterruptState()
    name = 'kan140-engine-fixture-' + uuid.uuid4().hex
    network = name + '-net'
    service_id = None
    network_attempted = False
    network_ack = False
    service_attempted = False
    service_ack = False
    receipt = {'status':'running','production_cutover':False,'cleanup_verified':False,
               'attempt':name.removeprefix('kan140-engine-fixture-')}
    end = time.monotonic() + 120
    def wait(predicate):
        while time.monotonic() < end:
            if predicate():return
            time.sleep(0.2)
        raise RuntimeError('engine-probe-timeout')
    def service_rows():
        ids = docker.run('service','ls','--format','{{.ID}}','--filter','label='+LABEL+'='+name).stdout.decode().split()
        return [docker.data('service','inspect',sid)[0] for sid in ids]
    try:
        checkpoint({**receipt,'phase':'starting','service_name':name,'network_name':network})
        docker.run('image','inspect',volume_transfer.PG_IMAGE)
        require(not service_rows())
        network_attempted = True
        checkpoint({**receipt,'phase':'network-create-intent','service_name':name,'network_name':network})
        docker.run('network','create','--driver','overlay','--internal','--label',LABEL+'='+name,network)
        network_ack = True
        net = docker.data('network','inspect',network)[0]
        require(net['Internal'] is True and net['Labels'] == {LABEL:name})
        service_attempted = True
        checkpoint({**receipt,'phase':'service-create-intent','service_name':name,'network_name':network})
        created = docker.run('service','create','--detach','--name',name,
            '--label',LABEL+'='+name,'--network',network,'--replicas','0',
            '--container-label',LABEL+'='+name,'--limit-cpu','0.10','--limit-memory','64m',
            '--mount','type=tmpfs,dst=/var/lib/postgresql/data,tmpfs-size=1048576',
            '--health-cmd','kill -0 1','--health-interval','1s','--health-retries','2',
            '--health-start-period','1s','--stop-grace-period','1s',
            '--entrypoint','/bin/sh',volume_transfer.PG_IMAGE,'-ec','exec sleep 300')
        service_ack = True
        service_id = created.stdout.decode().strip()
        sdk = sdk_factory(fixture_scope=name,overall_timeout=180)
        version = sdk.version()
        require(version['ApiVersion'] == '1.56')
        engine = lifecycle.Engine(sdk,full_spec_reviewed=True)
        before = engine.service(service_id)
        require(before['Spec']['Name'] == name and before['Spec']['Labels'] == {LABEL:name})
        new = copy.deepcopy(before['Spec'])
        new['Mode']['Replicated']['Replicas'] = 1
        running = engine.update(before,new)
        require(running['Spec'] == new)
        def healthy():
            ids=docker.run('ps','-q','--no-trunc','--filter',
                           'label=com.docker.swarm.service.id='+service_id).stdout.decode().split()
            if len(ids)!=1:return False
            item=sdk.inspect_container(ids[0])
            require(item['Config']['Labels'].get(LABEL)==name and
                    item['Config']['Image']==volume_transfer.PG_IMAGE and
                    not item['HostConfig'].get('PortBindings') and
                    len(item['Mounts'])==1 and item['Mounts'][0]['Type']=='tmpfs' and
                    item['Mounts'][0]['Destination']=='/var/lib/postgresql/data' and
                    set(item['NetworkSettings']['Networks'])=={network})
            return item['State'].get('Health',{}).get('Status')=='healthy'
        wait(healthy)
        # Reuse the stale real daemon version; the adapter must never resend it.
        blocked=False
        try:engine.update(before,before['Spec'])
        except lifecycle.Rejected:blocked=True
        require(blocked and engine.service(service_id)['Spec']==new)
        current=engine.service(service_id)
        stopped=copy.deepcopy(current['Spec'])
        stopped['Mode']['Replicated']['Replicas']=0
        require(engine.update(current,stopped)['Spec']==stopped)
        wait(lambda:not docker.run('ps','-q','--filter',
                         'label=com.docker.swarm.service.id='+service_id).stdout.strip())
        receipt.update(status='pass',full_spec_preserved=True,stale_snapshot_rejected=True,
                       effective_workload_healthy=True,replicas_roundtrip=True)
    except BaseException:
        receipt.update(status='fail',phase='work-rejected')
    finally:
        interrupt.cleaning = True
        # A NEW bounded client starts its deadline only now, not at work start.
        docker = cleanup_factory()
        cleanup=True
        try:
            if service_attempted:
                rows=service_rows()
                require(len(rows)<=1)
                if not rows and not service_ack:cleanup=False
                for row in rows:
                    require(row['Spec']['Name']==name and row['Spec']['Labels']=={LABEL:name})
                    service_id=row['ID']
                    docker.run('service','rm',service_id)
                cleanup_end=time.monotonic()+30
                while time.monotonic()<cleanup_end:
                    ids=docker.run('ps','-aq','--no-trunc','--filter','label='+LABEL+'='+name).stdout.decode().split()
                    if not ids:break
                    for cid in ids:
                        result=docker.run('container','inspect',cid,check=False)
                        if result.returncode:
                            require(result.stderr.decode().strip()=='Error response from daemon: No such container: '+cid)
                            continue
                        item=json.loads(result.stdout)[0]
                        require(item['Config']['Labels'].get(LABEL)==name and
                                item['Config']['Labels'].get('com.docker.swarm.service.id')==service_id and
                                not any(m['Type']=='volume' for m in item['Mounts']))
                        if not item['State']['Running']:docker.run('container','rm',cid)
                    time.sleep(0.2)
                require(not docker.run('ps','-aq','--filter','label='+LABEL+'='+name).stdout.strip())
                require(not service_rows())
            if network_attempted:
                nets=docker.run('network','ls','-q','--filter','label='+LABEL+'='+name).stdout.decode().split()
                require(len(nets)<=1)
                if not nets and not network_ack:cleanup=False
                for nid in nets:
                    net=docker.data('network','inspect',nid)[0]
                    require(net['Name']==network and net['Labels']=={LABEL:name})
                    require(not docker.run('ps','-aq','--filter','network='+nid).stdout.strip())
                    docker.run('network','rm',nid)
                require(not docker.run('network','ls','-q','--filter','label='+LABEL+'='+name).stdout.strip())
        except BaseException:
            cleanup=False
        receipt['cleanup_verified']=cleanup
        if not cleanup or interrupt.seen:receipt['status']='fail'
        checkpoint({**receipt,'service_name':name,'network_name':network})
    return receipt


def main():
    require(os.name=='posix' and os.geteuid()==0 and os.environ.get('KAN140_ENGINE_PROBE')=='true')
    sys.path.insert(0,'/opt/clicaepede/kan133')
    import backup
    import runtime
    managed.directory(managed.ROOT)
    interrupt=InterruptState()
    previous={sig:signal.signal(sig,interrupt.handle) for sig in (signal.SIGINT,signal.SIGTERM)}
    try:
      with backup.locked(backup.ROOT):
        require(not runtime.fenced() and not any((backup.ROOT/n).exists()
                    for n in ('maintenance.json','restore_lease.json')))
        cfg=json.loads(runtime.trusted_bytes(Path('/etc/clicaepede/kan135/config.json')))
        require(cfg['whatsapp_enabled'] is False)
        result=rehearse(managed.Docker(managed.ROOT,seconds=150),
            cleanup_factory=lambda:managed.Docker(managed.ROOT,seconds=60),
            checkpoint=lambda value:backup.atomic_json(managed.ROOT/'engine-probe.json',value),
            interrupt=interrupt)
        result.update(observed_at=int(time.time()),
            transport_sha256=hashlib.sha256(Path(engine_transport.__file__).read_bytes()).hexdigest(),
            consumer_sha256=hashlib.sha256(inspect.getsource(lifecycle.Engine).encode()).hexdigest())
        backup.atomic_json(managed.ROOT/'engine-probe.json',result)
        print(json.dumps(result,sort_keys=True))
        return 0 if result['status']=='pass' else 1
    finally:
        for sig,handler in previous.items():signal.signal(sig,handler)


if __name__=='__main__':
    try:raise SystemExit(main())
    except Exception:
        print('{"status":"fail","phase":"engine-probe-rejected","production_cutover":false}')
        raise SystemExit(1)
