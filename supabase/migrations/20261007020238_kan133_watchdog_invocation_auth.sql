-- Resolve the explicitly configured PUBLIC invocation JWT, not deprecated Edge defaults.
create function public.kan133_watchdog_authorized(p_token text) returns boolean
language sql stable security definer set search_path=pg_catalog as $$
select coalesce(length(p_token)<=4096 and exists(
  select 1 from infra_qa.watchdog_config where singleton and enabled and anon_key=p_token
),false);
$$;
revoke all on function public.kan133_watchdog_authorized(text) from public,anon,authenticated,service_role;
grant execute on function public.kan133_watchdog_authorized(text) to service_role;
drop function public.kan133_configure_watchdog(text,bigint,text,text);
