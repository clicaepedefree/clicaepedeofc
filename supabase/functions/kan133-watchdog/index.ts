// Telegram credentials never enter pg_net, response bodies, or logs.
const base = Deno.env.get('SUPABASE_URL')!;
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
async function rpc(name: string, body: unknown = {}) {
  const response = await fetch(base + '/rest/v1/rpc/' + name, {
    method: 'POST', headers: {apikey:key, Authorization:'Bearer '+key, 'Content-Type':'application/json'},
    body:JSON.stringify(body), signal:AbortSignal.timeout(8000), redirect:'error',
  });
  if (!response.ok) throw new Error('rpc-failed');
  return response.json();
}
Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return new Response(null,{status:405});
  const authorization=request.headers.get('Authorization')||'';
  if(!/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(authorization))
    return new Response(null,{status:401});
  // Gateway verifies the project JWT. Caller body/query/header overrides are ignored.
  try {
    if(await rpc('kan133_watchdog_authorized',{p_token:authorization.slice(7)})!==true)
      return new Response(null,{status:401});
    const context = await rpc('kan133_watchdog_context');
    if (!context.send) return new Response(null,{status:204});
    let ok=false, messageId=null, errorCode='network_error';
    try {
      const response=await fetch('https://api.telegram.org/bot'+context.token+'/sendMessage',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({chat_id:context.chat_id,text:context.text}),
        signal:AbortSignal.timeout(10000),redirect:'error',
      });
      const body=await response.json();
      ok=response.status===200 && body.ok===true && Number.isSafeInteger(body.result?.message_id)
        && body.result.message_id>0 && String(body.result?.chat?.id)===context.chat_id;
      if(ok) {messageId=body.result.message_id;errorCode='';}
      else if(response.status===429) {
        const retry=body.parameters?.retry_after;
        errorCode=Number.isInteger(retry)&&retry>=0&&retry<=999999?'rate_limited:'+retry:'rate_limited';
      } else errorCode=response.ok?'invalid_response':'http_error';
    } catch(error) {errorCode=error instanceof DOMException&&error.name==='TimeoutError'?'timeout':'network_error';}
    const recorded=await rpc('kan133_watchdog_result',{
      p_event_id:context.event_id,p_ok:ok,p_message_id:messageId,p_error_code:ok?null:errorCode,
    });
    return new Response(null,{status:recorded?204:503});
  } catch { return new Response(null,{status:503}); }
});
