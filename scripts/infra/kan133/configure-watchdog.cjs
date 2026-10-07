const fs=require('node:fs');
const env=require('dotenv').parse(fs.readFileSync('.env.local'));
async function main(){
  let raw='';for await(const chunk of process.stdin)raw+=chunk;
  const c=JSON.parse(raw);
  const jwt=fs.readFileSync('D:/ProjetoIA/credentials/kan133/public-anon-key.txt','utf8').trim();
  const r=await fetch(c.supabase_url+'/rest/v1/rpc/kan133_configure_watchdog',{
    method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({p_token:c.telegram_token,p_chat_id:Number(c.telegram_chat_id),p_anon_key:jwt,p_edge_url:c.supabase_url+'/functions/v1/kan133-watchdog'}),signal:AbortSignal.timeout(20000),
  });
  if(!r.ok) {
    const body=await r.json().catch(()=>({}));
    let controlled=String(body.message||'response-redacted');
    for(const secret of [c.telegram_token,c.uploader_password,env.SUPABASE_SERVICE_ROLE_KEY,jwt]) {
      if(secret) controlled=controlled.replaceAll(secret,'[redacted]');
    }
    controlled=controlled.replace(/https?:\S+/g,'[url-redacted]').slice(0,180);
    throw Error('Watchdog rejected: HTTP '+r.status+' '+(body.code||'unknown')+' '+controlled);
  }
  console.log('{"status":"configured","token_location":"Supabase Vault","privileged_key_on_vps":false}');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
