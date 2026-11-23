import copy
import unittest

import workload_contract as w


class WorkloadTests(unittest.TestCase):
    def sample(self, role='postgres'):
        definition = {'image':'fixture@sha256:'+'a'*64,'entrypoint':['/fixture-entry'],
            'command':['fixture-command'],'environment':{'FIXTURE':'yes'},'cpus':'0.50',
            'mem_limit':'512M','mem_reservation':'128M',
            'logging':{'driver':'json-file','options':{'max-size':'10m','max-file':'3'}},
            'healthcheck':{'test':['CMD-SHELL','echo $$(fixture)'],'interval':'15s',
                          'timeout':'5s','retries':5,'start_period':'60s'}}
        image={'Id':'sha256:'+'b'*64,'Config':{'Env':['PATH=/fixture'], 'Labels':{},
                'WorkingDir':'/fixture','User':'','ExposedPorts':{'5432/tcp':{}}}}
        names=['clica-qa_evolution-qa_internal']+(['easypanel'] if role=='evolution' else [])
        networks={name:{'Name':name,'Id':str(i),'Driver':'overlay' if name=='easypanel' else 'bridge',
                        'Scope':'swarm' if name=='easypanel' else 'local','Internal':name!='easypanel'}
                  for i,name in enumerate(names)}
        item={'Image':image['Id'],'Config':{'Image':definition['image'],'Env':['PATH=/fixture','FIXTURE=yes'],
              'Entrypoint':definition['entrypoint'],'Cmd':definition['command'],'Labels':{},
              'WorkingDir':'/fixture','User':'','ExposedPorts':{'5432/tcp':{}},
              'Healthcheck':w.health(definition['healthcheck'])},
              'HostConfig':{'RestartPolicy':{'Name':'unless-stopped','MaximumRetryCount':0},
              'NanoCpus':500000000,'Memory':512*1024**2,'MemoryReservation':128*1024**2,
              'LogConfig':{'Type':'json-file','Config':copy.deepcopy(definition['logging']['options'])},
              'PublishAllPorts':False,'Privileged':False,'IpcMode':'private','NetworkMode':names[0]},
              'NetworkSettings':{'Networks':{name:{'NetworkID':networks[name]['Id'],
                  'Aliases':['clica-qa_evolution-qa_evolution'] if name=='easypanel' else []} for name in names}}}
        return item,definition,image,networks

    def test_exact_roles_and_engine_start_interval_default(self):
        for role in ('postgres','redis','evolution'):
            args=self.sample(role)
            self.assertTrue(w.validate(role,*args))
            args[0]['Config']['Healthcheck']['StartInterval']=5000000000
            self.assertTrue(w.validate(role,*args))

    def test_effective_workload_drift_matrix(self):
        for field in ('command','env','health','port','memory','logging','network','alias','privileged'):
            item,definition,image,networks=self.sample('evolution')
            if field=='command':item['Config']['Cmd']=['/bin/true']
            if field=='env':item['Config']['Env'].append('UNEXPECTED=true')
            if field=='health':item['Config']['Healthcheck']['Test']=['CMD','true']
            if field=='port':item['HostConfig']['PortBindings']={'8080/tcp':[{'HostPort':'8080'}]}
            if field=='memory':item['HostConfig']['Memory']=0
            if field=='logging':item['HostConfig']['LogConfig']['Config']['max-file']='99'
            if field=='network':networks['clica-qa_evolution-qa_internal']['Internal']=False
            if field=='alias':item['NetworkSettings']['Networks']['easypanel']['Aliases']=[]
            if field=='privileged':item['HostConfig']['Privileged']=True
            with self.subTest(field=field),self.assertRaises(w.Rejected):
                w.validate('evolution',item,definition,image,networks)

    def test_env_duplicates_and_bad_memory_rejected(self):
        with self.assertRaises(w.Rejected):w.environment(['FIXTURE=a','FIXTURE=b'])
        for value in ('0M','1G','512M-extra'):
            with self.assertRaises(w.Rejected):w.memory(value)

    def test_canonical_redis_entrypoint_clears_image_cmd_and_null_labels(self):
        item,definition,image,networks=self.sample('redis')
        definition.pop('command')
        image['Config']['Cmd']=['redis-server']
        image['Config']['Labels']=None
        for command in (None,[]):
            item['Config']['Cmd']=command
            item['Config']['Healthcheck']['StartInterval']=0
            self.assertTrue(w.validate('redis',item,definition,image,networks))
        item['Config']['Cmd']=['redis-server']
        with self.assertRaises(w.Rejected):w.validate('redis',item,definition,image,networks)

    def test_host_security_and_resolution_overrides_are_rejected(self):
        for field,value in (('SecurityOpt',['seccomp=unconfined']),
                            ('ExtraHosts',['postgres:203.0.113.4']),('Dns',['203.0.113.4']),
                            ('DnsSearch',['fixture.invalid']),('GroupAdd',['0'])):
            args=self.sample()
            args[0]['HostConfig'][field]=value
            with self.subTest(field=field),self.assertRaises(w.Rejected):w.validate('postgres',*args)


if __name__=='__main__':unittest.main()
