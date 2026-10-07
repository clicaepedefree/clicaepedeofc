create table infra_qa.retention_principal(singleton boolean primary key default true check(singleton),id uuid not null unique references auth.users(id));
alter table infra_qa.retention_principal enable row level security;
revoke all on infra_qa.retention_principal from public,anon,authenticated,service_role;
insert into infra_qa.retention_principal(id) select id from auth.users
where email='infra-retention-qa@clicaepede.com.br' and raw_app_meta_data->>'purpose'='kan133-backup-retention';
create function infra_qa.is_janitor() returns boolean language sql stable security definer set search_path=pg_catalog as $$
select exists(select 1 from infra_qa.retention_principal where id=(select auth.uid()));
$$;
create function infra_qa.retention_eligible(target uuid) returns boolean language sql stable security definer set search_path=pg_catalog as $$
select (select infra_qa.is_janitor()) and exists(
 select 1 from storage.objects o where o.id=target and o.bucket_id='infra-backups-qa'
 and o.name ~ '^kan133/evolution-qa/[0-9]{8}T[0-9]{6}Z-[a-f0-9-]{36}[.]age$'
 and o.created_at < now()-interval '7 days'
 and 2 <= (select count(*) from storage.objects newer where newer.bucket_id=o.bucket_id
   and newer.name ~ '^kan133/evolution-qa/[0-9]{8}T[0-9]{6}Z-[a-f0-9-]{36}[.]age$'
   and (newer.created_at,newer.id) > (o.created_at,o.id))
);
$$;
revoke all on function infra_qa.is_janitor(),infra_qa.retention_eligible(uuid) from public,anon,authenticated,service_role;
grant execute on function infra_qa.is_janitor(),infra_qa.retention_eligible(uuid) to authenticated;
create policy kan133_retention_select on storage.objects for select to authenticated
using(bucket_id='infra-backups-qa' and name ~ '^kan133/evolution-qa/[0-9]{8}T[0-9]{6}Z-[a-f0-9-]{36}[.]age$' and (select infra_qa.is_janitor()));
create policy kan133_retention_delete on storage.objects for delete to authenticated
using(infra_qa.retention_eligible(id));
