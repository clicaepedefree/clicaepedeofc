const fs = require('node:fs');
const crypto = require('node:crypto');
const env = require('dotenv').parse(fs.readFileSync('.env.local'));
async function main() {
  let input=''; for await (const chunk of process.stdin) input+=chunk;
  const c=JSON.parse(input), base=c.supabase_url, admin=env.SUPABASE_SERVICE_ROLE_KEY;
  async function call(path,key,jwt,method='GET',body,contentType='application/json',extra={}) {
    return fetch(base+path,{method,headers:{apikey:key,Authorization:'Bearer '+jwt,'Content-Type':contentType,...extra},body,signal:AbortSignal.timeout(20000)});
  }
  const login = await call('/auth/v1/token?grant_type=password',c.anon_key,c.anon_key,'POST',JSON.stringify({email:c.uploader_email,password:c.uploader_password}));
  if(!login.ok) throw Error('Uploader login failed');
  const jwt=(await login.json()).access_token;
  const probe='kan133/evolution-qa/permission-probe-'+crypto.randomUUID()+'.age';
  const path='/storage/v1/object/infra-backups-qa/'+probe;
  const results={}; let ordinaryId;
  function expect(name,pass){results[name]=pass;if(!pass)throw Error('Security test failed: '+name);}
  try {
    const put=await call(path,c.anon_key,jwt,'POST','non-backup-permission-probe','application/octet-stream');
    expect('scoped_upload',(put.status===200));
    const get=await call('/storage/v1/object/authenticated/infra-backups-qa/'+probe,c.anon_key,jwt);
    expect('scoped_download',get.ok && await get.text()==='non-backup-permission-probe');
    const overwrite=await call(path,c.anon_key,jwt,'POST','overwrite','application/octet-stream',{'x-upsert':'true'});
    expect('overwrite_denied',!overwrite.ok);
    const anon=await call('/storage/v1/object/authenticated/infra-backups-qa/'+probe,c.anon_key,c.anon_key);
    expect('anonymous_denied',!anon.ok);
    const outside=await call('/storage/v1/object/infra-backups-qa/outside/probe.age',c.anon_key,jwt,'POST','probe','application/octet-stream');
    expect('other_prefix_denied',!outside.ok);
    const other=await call('/storage/v1/object/store-files/kan133-permission-probe.age',c.anon_key,jwt,'POST','probe','application/octet-stream');
    expect('app_bucket_write_denied',!other.ok);
    const password=crypto.randomBytes(40).toString('base64url');
    const create=await call('/auth/v1/admin/users',admin,admin,'POST',JSON.stringify({email:'kan133-negative-'+crypto.randomUUID()+'@clicaepede.com.br',password,email_confirm:true}));
    if(!create.ok)throw Error('Negative identity creation failed');
    const user=await create.json();ordinaryId=user.id;
    const sign=await call('/auth/v1/token?grant_type=password',c.anon_key,c.anon_key,'POST',JSON.stringify({email:user.email,password}));
    const ordinary=(await sign.json()).access_token;
    const read=await call('/storage/v1/object/authenticated/infra-backups-qa/'+probe,c.anon_key,ordinary);
    expect('ordinary_identity_denied',!read.ok);
    const removal=await call('/storage/v1/object/infra-backups-qa',c.anon_key,jwt,'DELETE',JSON.stringify({prefixes:[probe]}));
    const still=await call('/storage/v1/object/authenticated/infra-backups-qa/'+probe,c.anon_key,jwt);
    expect('uploader_delete_denied',still.ok);
    console.log(JSON.stringify({status:'passed',results}));
  } finally {
    await call('/storage/v1/object/infra-backups-qa',admin,admin,'DELETE',JSON.stringify({prefixes:[probe]}));
    if(ordinaryId) await call('/auth/v1/admin/users/'+ordinaryId,admin,admin,'DELETE');
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
