import copy
import subprocess
import unittest

import engine_probe as p


SID='a'*25
CID='b'*64


class Docker:
    def __init__(self):
        self.net=None
        self.service=None
        self.calls=[]
        self.fail_create=False
        self.foreign=False
        self.inflight=False

    def run(self,*args,**kwargs):
        self.calls.append(args)
        output=''
        if args[:2]==('network','create'):
            self.net={'Name':args[-1],'Labels':{p.LABEL:args[-1][:-4]},'Internal':True}
        elif args[:2]==('service','create'):
            if self.inflight:raise TimeoutError('fixture-inflight-unknown')
            name=args[args.index('--name')+1]
            self.service={'ID':SID,'Version':{'Index':1},'Spec':{'Name':name,
                'Labels':{p.LABEL:name},'Mode':{'Replicated':{'Replicas':0}},
                'TaskTemplate':{'ContainerSpec':{'Image':p.volume_transfer.PG_IMAGE,
                    'Env':['FIXTURE=preserve'],'Mounts':[{'Type':'tmpfs'}]}},'KeepFutureField':{'yes':True}}}
            output=SID
            if self.fail_create:raise RuntimeError('fixture-create-ack-lost')
        elif args[:2]==('service','ls'):
            output=SID if self.service else ''
        elif args[:2]==('service','rm'):
            self.service=None
        elif args[:2]==('network','ls'):
            output='fixture-network' if self.net else ''
        elif args[:2]==('network','rm'):
            self.net=None
        elif args[0]=='ps':
            output=CID if self.service and self.service['Spec']['Mode']['Replicated']['Replicas'] else ''
        return subprocess.CompletedProcess(args,0,output.encode(),b'')

    def data(self,*args):
        if args[0]=='network':return [copy.deepcopy(self.net)]
        if args[0]=='service':
            value=copy.deepcopy(self.service)
            if self.foreign:value['Spec']['Labels'][p.LABEL]='foreign'
            return [value]
        raise AssertionError('unexpected fixture inspect')


class SDK:
    def __init__(self,docker):self.docker=docker
    def version(self):return {'ApiVersion':'1.56'}
    def inspect_service(self,sid):return copy.deepcopy(self.docker.service)
    def containers(self,all=True):return []
    def update_container(self,*a,**kw):raise AssertionError('no fixture container mutation')
    def stop(self,*a,**kw):raise AssertionError('no fixture container mutation')
    def inspect_container(self,cid):
        return {'Config':{'Labels':{p.LABEL:self.docker.service['Spec']['Name']},
                         'Image':p.volume_transfer.PG_IMAGE},
                'HostConfig':{},'Mounts':[{'Type':'tmpfs','Destination':'/var/lib/postgresql/data'}],
                'NetworkSettings':{'Networks':{self.docker.net['Name']:{}}},
                'State':{'Health':{'Status':'healthy'}}}
    def _url(self,template,sid):return template.format(sid)
    def _post_json(self,path,*,params,data):
        self.docker.service['Spec']=copy.deepcopy(data)
        self.docker.service['Version']['Index']+=1
        return None
    def _raise_for_status(self,response):pass


class ProbeTests(unittest.TestCase):
    def run_probe(self,docker,**kwargs):
        self.saved=[]
        return p.rehearse(docker,lambda **kw:SDK(docker),
            cleanup_factory=lambda:docker,checkpoint=self.saved.append,**kwargs)

    def test_full_roundtrip_isolated_and_cleaned(self):
        docker=Docker()
        result=self.run_probe(docker)
        self.assertEqual(result['status'],'pass')
        self.assertTrue(result['cleanup_verified'])
        self.assertTrue(result['full_spec_preserved'])
        self.assertTrue(result['stale_snapshot_rejected'])
        self.assertEqual(self.saved[0]['status'],'running')
        self.assertEqual(self.saved[-1]['attempt'],result['attempt'])
        self.assertIsNone(docker.net)
        self.assertIsNone(docker.service)
        create=next(a for a in docker.calls if a[:2]==('service','create'))
        self.assertIn('type=tmpfs,dst=/var/lib/postgresql/data,tmpfs-size=1048576',create)
        self.assertNotIn('--publish',create)

    def test_uncertain_create_still_cleans_only_owned_resources(self):
        docker=Docker()
        docker.fail_create=True
        result=self.run_probe(docker)
        self.assertEqual(result['status'],'fail')
        self.assertTrue(result['cleanup_verified'])
        self.assertIsNone(docker.service)
        self.assertIsNone(docker.net)

    def test_foreign_ownership_cannot_be_deleted(self):
        docker=Docker()
        docker.foreign=True
        result=self.run_probe(docker)
        self.assertFalse(result['cleanup_verified'])
        self.assertEqual(result['status'],'fail')
        self.assertFalse(any(a[:2]==('service','rm') for a in docker.calls))

    def test_inflight_create_absence_is_not_cleanup_proof(self):
        docker=Docker()
        docker.inflight=True
        result=self.run_probe(docker)
        self.assertEqual(result['status'],'fail')
        self.assertFalse(result['cleanup_verified'])
        self.assertEqual(self.saved[-1]['status'],'fail')

    def test_exhausted_work_uses_new_cleanup_budget(self):
        docker=Docker()
        cleanup_called=[]
        saved=[]
        def checkpoint(value):
            saved.append(value)
            if value.get('phase')=='service-create-intent':raise TimeoutError('fixture-work-deadline')
        def cleanup_factory():
            cleanup_called.append(True)
            return docker
        result=p.rehearse(docker,lambda **kw:SDK(docker),
            cleanup_factory=cleanup_factory,checkpoint=checkpoint)
        self.assertEqual(cleanup_called,[True])
        self.assertEqual(result['status'],'fail')
        self.assertIsNone(docker.net)

    def test_signal_during_cleanup_is_deferred_and_cannot_pass(self):
        docker=Docker()
        interrupt=p.InterruptState()
        def cleanup_factory():
            interrupt.handle(p.signal.SIGTERM,None)
            return docker
        result=p.rehearse(docker,lambda **kw:SDK(docker),cleanup_factory=cleanup_factory,
            checkpoint=lambda row:None,interrupt=interrupt)
        self.assertEqual(result['status'],'fail')
        self.assertTrue(result['cleanup_verified'])
        self.assertIsNone(docker.net)


if __name__=='__main__':unittest.main()
