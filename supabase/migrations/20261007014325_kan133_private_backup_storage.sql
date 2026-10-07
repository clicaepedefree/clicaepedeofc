-- Dedicated QA infrastructure identity; no business tables or existing buckets change.
create schema if not exists infra_qa;
revoke all on schema infra_qa from public, anon, authenticated;
create table infra_qa.principal (
  singleton boolean primary key default true check (singleton),
  id uuid not null unique references auth.users(id)
);
alter table infra_qa.principal enable row level security;
revoke all on infra_qa.principal from public, anon, authenticated;
insert into infra_qa.principal(id)
select id from auth.users where email='infra-backup-qa@clicaepede.com.br'
and raw_app_meta_data->>'purpose'='kan133-backup-uploader';
create function infra_qa.is_uploader() returns boolean language sql stable
security definer set search_path=pg_catalog as $$
  select exists(select 1 from infra_qa.principal where id=(select auth.uid()));
$$;
revoke all on function infra_qa.is_uploader() from public, anon, authenticated;
grant usage on schema infra_qa to authenticated;
grant execute on function infra_qa.is_uploader() to authenticated;
create policy kan133_backup_insert on storage.objects for insert to authenticated
with check(bucket_id='infra-backups-qa' and name like 'kan133/evolution-qa/%.age'
  and (select infra_qa.is_uploader()));
create policy kan133_backup_select on storage.objects for select to authenticated
using(bucket_id='infra-backups-qa' and name like 'kan133/evolution-qa/%.age'
  and (select infra_qa.is_uploader()));
-- No UPDATE, upsert or DELETE rights for the VPS credential.
