#!/usr/bin/env python3
"""Allowlisted QA telemetry and persistent, deduplicated Telegram delivery."""
import datetime
import json
import os
from pathlib import Path
import subprocess
import time
import urllib.request
import urllib.error
try:
    import fcntl
except ImportError:
    fcntl=None

ROOT = Path('/var/lib/clicaepede/kan133')
CONFIG = Path('/etc/clicaepede/kan133/config.json')
SERVICES = ['clica-evolution-qa_evolution', 'clica-evolution-qa_postgres', 'clica-evolution-qa_redis', 'easypanel', 'easypanel-traefik']

class DeliveryFailed(Exception):
    def __init__(self,retry_after=0):
        self.retry_after=retry_after

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):
        raise RuntimeError('redirect-rejected')

def atomic(path, data):
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(data), encoding='utf8')
    os.chmod(temp, 0o600)
    os.replace(temp, path)

def request(url, data=None, headers=None, method=None):
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(url, body, headers or {}, method=method)
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect())
    with opener.open(req, timeout=12) as response:
        result=response.read(65537)
        if len(result)>65536:
            raise RuntimeError('response-size-limit')
        return json.loads(result)

def token(config):
    return request(config['supabase_url']+'/auth/v1/token?grant_type=password',
                   {'email':config['uploader_email'], 'password':config['uploader_password']},
                   {'apikey':config['anon_key'], 'Content-Type':'application/json'})['access_token']

def notify(config, message):
    try:
        result = request('https://api.telegram.org/bot'+config['telegram_token']+'/sendMessage',
                         {'chat_id':config['telegram_chat_id'], 'text':message}, {'Content-Type':'application/json'})
    except urllib.error.HTTPError as error:
        retry=0
        if error.code==429:
            try:
                value=json.loads(error.read(65536)).get('parameters',{}).get('retry_after')
                if type(value) is int and 0<=value<=999999:
                    retry=value
            except Exception:
                pass
        raise DeliveryFailed(retry) from None
    if (result.get('ok') is not True or not result.get('result', {}).get('message_id')
        or str(result.get('result',{}).get('chat',{}).get('id'))!=str(config['telegram_chat_id'])):
        raise RuntimeError('telegram-delivery-not-confirmed')
    return result['result']['message_id']

def delivery_due(event,now):
    if now<event['next']:
        return False
    if event['attempts']>=5:
        event['attempts']=0
        event['retry_windows']=event.get('retry_windows',0)+1
    return True

def failed_delivery(event,now,retry_after=0):
    event['attempts']+=1
    event['next']=now+max(min(3600,60*2**event['attempts']),retry_after)
    if event['attempts']>=5:
        event['next']=max(event['next'],now+6*3600)

def collect(previous):
    cpu = [int(x) for x in Path('/proc/stat').read_text().splitlines()[0].split()[1:]]
    old = previous.get('cpu_ticks', cpu)
    delta = sum(cpu)-sum(old)
    cpu_percent = round(100*(1-((cpu[3]+cpu[4])-(old[3]+old[4]))/delta), 2) if delta > 0 else 0
    memory = dict((line.split(':')[0],int(line.split()[1])) for line in Path('/proc/meminfo').read_text().splitlines())
    ram = round(100*(1-memory['MemAvailable']/memory['MemTotal']),2)
    disk = os.statvfs('/')
    disk_percent = round(100*(1-disk.f_bavail/disk.f_blocks),2)
    result = subprocess.run(['docker','service','ls','--format','{{json .}}'],capture_output=True,check=True,timeout=8)
    services = [json.loads(line) for line in result.stdout.decode().splitlines()]
    replica = {s['Name']:s['Replicas'] for s in services if s['Name'] in SERVICES}
    unhealthy = [name for name in SERVICES if replica.get(name) != '1/1']
    tasks = {}
    oom_ids=[]
    for service in SERVICES:
        ids = subprocess.run(['docker','ps','-q','--filter','label=com.docker.swarm.service.name='+service],capture_output=True,check=True,timeout=8).stdout.decode().split()
        tasks[service] = ids
        history=subprocess.run(['docker','ps','-aq','--filter','label=com.docker.swarm.service.name='+service],capture_output=True,check=True,timeout=8).stdout.decode().split()
        for container in history:
            state = json.loads(subprocess.run(['docker','inspect','--format','{{json .State}}',container],capture_output=True,check=True,timeout=8).stdout)
            if state.get('OOMKilled'):
                oom_ids.append(container)
            if state.get('Running') and state.get('Health',{}).get('Status') == 'unhealthy':
                unhealthy.append(service)
    changed = bool(previous.get('tasks')) and tasks != previous['tasks']
    try:
        with urllib.request.urlopen('https://evolution-staging.clicaepede.com.br',timeout=8) as response:
            evolution_ok = response.status == 200
    except Exception:
        evolution_ok = False
    return {'cpu_percent':cpu_percent,'ram_percent':ram,'disk_percent':disk_percent,
            'evolution_ok':evolution_ok,'unhealthy_services':sorted(set(unhealthy)),
            'container_changed':changed,'container_oom':bool(set(oom_ids)-set(previous.get('oom_ids',[])))}, cpu, tasks,oom_ids

def incidents(metrics, state, backup, now):
    active = set()
    for signal, threshold in [('cpu_percent',60),('ram_percent',70)]:
        if metrics[signal] >= threshold:
            start = state.setdefault('sustained',{}).setdefault(signal,now)
            if now-start >= 900:
                active.add(signal)
        else:
            state.setdefault('sustained',{}).pop(signal,None)
    if metrics['disk_percent'] >= 70:
        active.add('disk-space')
    if not metrics['evolution_ok'] or metrics['unhealthy_services']:
        active.add('service-unavailable')
    if metrics['container_oom']:
        active.add('container-oom')
    if metrics['container_changed']:
        active.add('container-restarted')
    if backup.get('failed'):
        active.add('backup-failed')
    captured = backup.get('captured_at')
    if not captured or not backup.get('verified_at'):
        active.add('backup-unverified')
    else:
        age = now-datetime.datetime.fromisoformat(captured.replace('Z','+00:00')).timestamp()
        if age < 0 or age >= 86400:
            active.add('backup-rpo-exceeded')
        elif age >= 64800:
            active.add('backup-aging')
    return active

def main():
    os.umask(0o077)
    ROOT.mkdir(mode=0o700,parents=True,exist_ok=True)
    with (ROOT/'monitor.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        config = json.loads(CONFIG.read_text())
        state_path = ROOT/'monitor.json'
        state = json.loads(state_path.read_text()) if state_path.exists() else {}
        metrics, ticks, tasks,oom_ids = collect(state)
        backup_path = ROOT/'last_backup.json'
        backup = json.loads(backup_path.read_text()) if backup_path.exists() else {}
        now = time.time()
        active = incidents(metrics,state,backup,now)
        previous = set(state.get('active',[]))
        pending = state.setdefault('pending',{})
        for code in sorted(active-previous):
            pending.setdefault('incident:'+code,{'message':'[QA KAN-133] Alerta: '+code,'attempts':0,'next':0})
        for code in sorted(previous-active):
            pending.setdefault('recovery:'+code,{'message':'[QA KAN-133] Recuperado: '+code,'attempts':0,'next':0})
        state.update(active=sorted(active),cpu_ticks=ticks,tasks=tasks,oom_ids=oom_ids,metrics=metrics)
        atomic(state_path,state)
        for key,event in list(pending.items()):
            if not delivery_due(event,now):
                continue
            try:
                message_id = notify(config,event['message'])
                state['last_delivery'] = {'at':now,'message_id':message_id}
                del pending[key]
            except Exception as error:
                failed_delivery(event,now,getattr(error,'retry_after',0))
            atomic(state_path,state)
        try:
            jwt = token(config)
            request(config['supabase_url']+'/rest/v1/kan133_heartbeat?singleton=eq.true',
                    {'captured_at':backup.get('captured_at'),'offsite_verified_at':backup.get('verified_at'),
                     'backup_failed':bool(backup.get('failed')),'metrics':{
                         'cpu_percent':metrics['cpu_percent'],'ram_percent':metrics['ram_percent'],
                         'disk_percent':metrics['disk_percent'],'container_restarts':int(metrics['container_changed']),
                         'container_oom':int(metrics['container_oom'])}},
                    {'apikey':config['anon_key'],'Authorization':'Bearer '+jwt,'Content-Type':'application/json','Prefer':'return=representation'},'PATCH')
            state['heartbeat_uploaded_at'] = now
        except Exception:
            state['heartbeat_upload_failed_at'] = now
        atomic(state_path,state)
        print(json.dumps({'metrics':metrics,'active':sorted(active),'pending_deliveries':len(pending),
                          'delivery_cooldown':sum(event['attempts']>=5 for event in pending.values()),
                          'heartbeat_ok':state.get('heartbeat_uploaded_at')==now}))

if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('{"status":"monitor-failed"}')
        raise SystemExit(1)
