async function main(){
  let raw='';for await(const chunk of process.stdin)raw+=chunk;
  const c=JSON.parse(raw),base=c.supabase_url;
  const login=await fetch(base+'/auth/v1/token?grant_type=password',{
    method:'POST',headers:{apikey:c.anon_key,'Content-Type':'application/json'},
    body:JSON.stringify({email:c.janitor_email,password:c.janitor_password}),signal:AbortSignal.timeout(20000),
  });
  if(!login.ok)throw Error('Janitor login failed');
  const jwt=(await login.json()).access_token;
  async function request(path,method,body,type='application/json'){
    return fetch(base+path,{method,headers:{apikey:c.anon_key,Authorization:'Bearer '+jwt,'Content-Type':type},body,
      signal:AbortSignal.timeout(20000)});
  }
  async function list(){
    const r=await request('/storage/v1/object/list/infra-backups-qa','POST',JSON.stringify({prefix:'kan133/evolution-qa/',limit:1000}));
    if(!r.ok)throw Error('Janitor list failed');
    return r.json();
  }
  const before=await list();
  if(before.length<2||before.some(o=>Date.now()-Date.parse(o.created_at)>7*86400000))throw Error('Recent backup safety fixture unavailable');
  const remove=await request('/storage/v1/object/infra-backups-qa','DELETE',JSON.stringify({prefixes:before.map(o=>'kan133/evolution-qa/'+o.name)}));
  if(!remove.ok||(await remove.json()).length!==0)throw Error('Janitor recent-delete guard failed');
  const after=await list();
  if(before.some(o=>!after.some(a=>a.id===o.id)))throw Error('Recent backup removed');
  const upload=await request('/storage/v1/object/infra-backups-qa/kan133/evolution-qa/forbidden.age','POST','forbidden','application/octet-stream');
  if(upload.ok)throw Error('Janitor gained uploader rights');
  console.log(JSON.stringify({status:'passed',recent_backups_preserved:before.length,recent_delete_denied:true,janitor_upload_denied:true}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
