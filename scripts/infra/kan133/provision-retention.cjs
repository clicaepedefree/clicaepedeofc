const fs=require('node:fs');
const crypto=require('node:crypto');
const env=require('dotenv').parse(fs.readFileSync('.env.local'));
async function main(){
  let raw='';for await(const chunk of process.stdin)raw+=chunk;
  const c=JSON.parse(raw), password=crypto.randomBytes(40).toString('base64url');
  const email='infra-retention-qa@clicaepede.com.br';
  const r=await fetch(c.supabase_url+'/auth/v1/admin/users',{
    method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({email,password,email_confirm:true,app_metadata:{purpose:'kan133-backup-retention'}}),signal:AbortSignal.timeout(20000),
  });
  if(!r.ok)throw Error('Dedicated retention identity failed; do not reset existing credentials');
  process.stdout.write(JSON.stringify({supabase_url:c.supabase_url,anon_key:c.anon_key,janitor_email:email,janitor_password:password}));
}
main().catch(()=>{console.error('Retention bootstrap failed.');process.exitCode=1;});
