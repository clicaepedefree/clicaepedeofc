const fs=require('node:fs');
async function main(){
  let raw='';for await(const chunk of process.stdin)raw+=chunk;
  const c=JSON.parse(raw),base=c.supabase_url, results={};
  async function api(path,jwt,body,method='POST') {
    return fetch(base+path,{method,headers:{apikey:c.anon_key,...(jwt?{Authorization:'Bearer '+jwt}:{}),'Content-Type':'application/json'},
      body:method==='GET'?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  }
  function expect(code,ok){results[code]=ok;if(!ok)throw Error('Watchdog security failed: '+code);}
  const login=await api('/auth/v1/token?grant_type=password',null,{email:c.uploader_email,password:c.uploader_password});
  const jwt=(await login.json()).access_token;
  for(const name of ['kan133_watchdog_context','kan133_configure_watchdog']) {
    const anon=await api('/rest/v1/rpc/'+name,null,{});
    expect(name+'_anonymous_denied',!anon.ok);
    const uploader=await api('/rest/v1/rpc/'+name,jwt,{});
    expect(name+'_uploader_denied',!uploader.ok);
  }
  const stamp=await api('/rest/v1/kan133_heartbeat?singleton=eq.true',jwt,{observed_at:new Date().toISOString()},'PATCH');
  expect('uploader_cannot_set_server_clock',!stamp.ok);
  const metrics=await api('/rest/v1/kan133_heartbeat?singleton=eq.true',jwt,{metrics:{token:'forbidden-non-secret-fixture'}},'PATCH');
  expect('freeform_sensitive_metrics_denied',!metrics.ok);
  const insert=await api('/rest/v1/kan133_heartbeat',jwt,{singleton:true,metrics:{}});
  expect('uploader_cannot_insert_heartbeat',!insert.ok);
  const without=await api('/functions/v1/kan133-watchdog',null,{});
  expect('edge_requires_gateway_auth',!without.ok);
  const key=fs.readFileSync('D:/ProjetoIA/credentials/kan133/public-anon-key.txt','utf8').trim();
  const invoke=await api('/functions/v1/kan133-watchdog',key,{chat_id:'ignored',text:'MUST NOT SEND',token:'ignored'});
  expect('edge_ignores_caller_overrides_http_'+invoke.status,invoke.status===204);
  expect('edge_returns_no_sensitive_context',(await invoke.text())==='');
  console.log(JSON.stringify({status:'passed',results}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
