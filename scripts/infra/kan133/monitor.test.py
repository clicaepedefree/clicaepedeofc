import importlib.util
import io
from pathlib import Path
import unittest
from unittest.mock import patch
import urllib.error
spec=importlib.util.spec_from_file_location('monitor',Path(__file__).with_name('monitor.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class MonitorTests(unittest.TestCase):
    def metrics(self,**overrides):
        return dict(cpu_percent=0,ram_percent=0,disk_percent=0,evolution_ok=True,
                    unhealthy_services=[],container_changed=False,container_oom=False,**overrides)
    def fresh(self):
        return {'captured_at':'1970-01-01T00:00:00Z','verified_at':'1970-01-01T00:00:01Z'}
    def test_healthy(self):
        self.assertEqual(m.incidents(self.metrics(),{},self.fresh(),3600),set())
    def test_thresholds(self):
        metrics=self.metrics();metrics.update(cpu_percent=61,ram_percent=71,disk_percent=71)
        state={}
        self.assertEqual(m.incidents(metrics,state,self.fresh(),3600),{'disk-space'})
        self.assertEqual(m.incidents(metrics,state,self.fresh(),4500),{'disk-space','cpu_percent','ram_percent'})
    def test_capture_age_not_upload_age(self):
        backup=self.fresh();backup['verified_at']='1970-01-02T00:00:00Z'
        self.assertIn('backup-rpo-exceeded',m.incidents(self.metrics(),{},backup,86400))
    def test_failures(self):
        metrics=self.metrics();metrics.update(evolution_ok=False,container_changed=True,container_oom=True)
        active=m.incidents(metrics,{}, {'failed':True},3600)
        self.assertEqual(active,{'service-unavailable','container-restarted','container-oom','backup-failed','backup-unverified'})
    def test_telegram_requires_matching_confirmed_chat(self):
        with patch.object(m,'request',return_value={'ok':True,'result':{'message_id':7,'chat':{'id':8}}}):
            with self.assertRaises(RuntimeError):m.notify({'telegram_token':'fixture','telegram_chat_id':'9'},'test')
        with patch.object(m,'request',return_value={'ok':True,'result':{'message_id':7,'chat':{'id':9}}}):
            self.assertEqual(m.notify({'telegram_token':'fixture','telegram_chat_id':'9'},'test'),7)
    def test_rate_limit(self):
        error=urllib.error.HTTPError('https://fixture',429,'limited',{},io.BytesIO(b'{"parameters":{"retry_after":900}}'))
        with patch.object(m,'request',side_effect=error):
            with self.assertRaises(m.DeliveryFailed) as caught:m.notify({'telegram_token':'fixture','telegram_chat_id':'9'},'test')
        self.assertEqual(caught.exception.retry_after,900)
    def test_recovery_clears_sustained_threshold(self):
        state={'sustained':{'cpu_percent':0,'ram_percent':0}}
        m.incidents(self.metrics(),state,self.fresh(),3600)
        self.assertEqual(state['sustained'],{})
    def test_delivery_resumes_after_bounded_failure_window(self):
        event={'attempts':4,'next':0}
        m.failed_delivery(event,1000)
        self.assertEqual(event['attempts'],5)
        self.assertEqual(event['next'],1000+6*3600)
        self.assertFalse(m.delivery_due(event,1001))
        self.assertTrue(m.delivery_due(event,event['next']))
        self.assertEqual(event['attempts'],0)
        self.assertEqual(event['retry_windows'],1)
    def test_cooldown_does_not_violate_telegram_retry_after(self):
        event={'attempts':4,'next':0}
        m.failed_delivery(event,1000,80000)
        self.assertEqual(event['next'],81000)

if __name__=='__main__':unittest.main()
