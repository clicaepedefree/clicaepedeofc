// Local-only bootstrap. Stdout is consumed privately by provision.ps1, never logged.
const fs = require('node:fs');
const crypto = require('node:crypto');
const {parse} = require('dotenv');
const env = parse(fs.readFileSync('.env.local'));
const url = env.NEXT_PUBLIC_SUPABASE_URL || 'https://kktmjjmkbbtbibzbpcqj.supabase.co';
if (new URL(url).hostname !== 'kktmjjmkbbtbibzbpcqj.supabase.co') throw Error('Unexpected project');
async function post(path, body) {
  const response = await fetch(url+path,{method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  if (!response.ok) throw Error('Provisioning endpoint rejected request');
  return response.json();
}
async function main() {
  const email = 'infra-backup-qa@clicaepede.com.br';
  const password = crypto.randomBytes(40).toString('base64url');
  const result = await post('/auth/v1/admin/users',{email,password,email_confirm:true,app_metadata:{purpose:'kan133-backup-uploader'}});
  await post('/storage/v1/bucket',{id:'infra-backups-qa',name:'infra-backups-qa',public:false,file_size_limit:40*1024*1024,allowed_mime_types:['application/octet-stream']});
  process.stdout.write(JSON.stringify({supabase_url:url,anon_key:env.NEXT_PUBLIC_SUPABASE_ANON_KEY,uploader_email:email,uploader_password:password,uploader_id:result.id,bucket:'infra-backups-qa'}));
}
main().catch(()=>{process.stderr.write('Bootstrap failed; audit partial state before retry.\n');process.exitCode=1;});
