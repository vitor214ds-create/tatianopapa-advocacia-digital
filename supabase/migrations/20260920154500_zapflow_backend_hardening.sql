-- ZapFlow backend hardening (2026-09-20)
-- Mirrors production hardening applied to Supabase.

create unique index if not exists whatsapp_accounts_session_id_global_key
  on public.whatsapp_accounts(session_id)
  where session_id is not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='zapflow_campaigns_organization_id_fkey') then
    alter table public.zapflow_campaigns
      add constraint zapflow_campaigns_organization_id_fkey
      foreign key (organization_id) references public.organizations(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname='zapflow_message_jobs_organization_id_fkey') then
    alter table public.zapflow_message_jobs
      add constraint zapflow_message_jobs_organization_id_fkey
      foreign key (organization_id) references public.organizations(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname='zapflow_message_jobs_whatsapp_account_id_fkey') then
    alter table public.zapflow_message_jobs
      add constraint zapflow_message_jobs_whatsapp_account_id_fkey
      foreign key (whatsapp_account_id) references public.whatsapp_accounts(id) on delete set null;
  end if;
end $$;

create table if not exists public.whatsapp_session_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  whatsapp_account_id uuid references public.whatsapp_accounts(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.whatsapp_session_events enable row level security;

create index if not exists zapflow_session_events_org_created_idx
  on public.whatsapp_session_events(organization_id, created_at desc);
create index if not exists zapflow_session_events_account_created_idx
  on public.whatsapp_session_events(whatsapp_account_id, created_at desc);

do $$
begin
  if not exists (select 1 from vault.secrets where name='zapflow:worker:secret') then
    perform vault.create_secret(
      encode(gen_random_bytes(32),'hex'),
      'zapflow:worker:secret',
      'ZapFlow durable queue worker secret',
      null
    );
  end if;
end $$;

create or replace function public.zapflow_worker_secret_valid(p_secret text)
returns boolean
language sql
security definer
set search_path=public,vault
as $$
  select exists(
    select 1 from vault.decrypted_secrets
    where name='zapflow:worker:secret'
      and decrypted_secret=p_secret
  );
$$;

create or replace function public.zapflow_claim_message_jobs_secure(
  p_worker_id text,
  p_limit integer,
  p_secret text
)
returns setof public.zapflow_message_jobs
language plpgsql
security definer
set search_path=public,vault
as $$
begin
  if not public.zapflow_worker_secret_valid(p_secret) then
    raise exception 'unauthorized worker';
  end if;

  return query
  with ranked as (
    select j.id,
           row_number() over (
             partition by j.session_id
             order by j.next_attempt_at asc,j.created_at asc
           ) as rn
    from public.zapflow_message_jobs j
    where (
      j.status in ('QUEUED','RETRY')
      and j.next_attempt_at<=now()
      and j.locked_at is null
    ) or (
      j.status='PROCESSING'
      and j.locked_at<now()-interval '10 minutes'
    )
  ),
  due as (
    select j.id
    from public.zapflow_message_jobs j
    join ranked r on r.id=j.id
    where r.rn=1
    order by j.next_attempt_at asc,j.created_at asc
    for update of j skip locked
    limit greatest(1,least(coalesce(p_limit,20),50))
  ),
  claimed as (
    update public.zapflow_message_jobs j
    set status='PROCESSING',
        locked_at=now(),
        locked_by=p_worker_id,
        attempts=j.attempts+1,
        updated_at=now()
    from due
    where j.id=due.id
    returning j.*
  )
  select * from claimed;
end;
$$;

create or replace function public.zapflow_finish_message_job_secure(
  p_job_id uuid,
  p_success boolean,
  p_provider_message_id text,
  p_error text,
  p_retry_at timestamptz,
  p_secret text
)
returns void
language plpgsql
security definer
set search_path=public,vault
as $$
declare
  v_campaign_id uuid;
  v_attempts integer;
  v_max_attempts integer;
  v_final boolean;
begin
  if not public.zapflow_worker_secret_valid(p_secret) then
    raise exception 'unauthorized worker';
  end if;

  select campaign_id,attempts,max_attempts
  into v_campaign_id,v_attempts,v_max_attempts
  from public.zapflow_message_jobs
  where id=p_job_id
  for update;

  if v_campaign_id is null then raise exception 'job not found'; end if;

  if p_success then
    update public.zapflow_message_jobs
    set status='SENT',
        sent_at=now(),
        provider_message_id=p_provider_message_id,
        last_error=null,
        locked_at=null,
        locked_by=null,
        updated_at=now()
    where id=p_job_id;
  else
    v_final:=coalesce(v_attempts,0)>=coalesce(v_max_attempts,3);
    update public.zapflow_message_jobs
    set status=case when v_final then 'FAILED' else 'RETRY' end,
        next_attempt_at=case when v_final then next_attempt_at else coalesce(p_retry_at,now()+interval '2 minutes') end,
        last_error=left(coalesce(p_error,'Falha inesperada'),2000),
        locked_at=null,
        locked_by=null,
        updated_at=now()
    where id=p_job_id;
  end if;

  perform public.zapflow_refresh_campaign_counters(v_campaign_id);
end;
$$;

revoke all on function public.zapflow_worker_secret_valid(text) from public,anon,authenticated;
grant execute on function public.zapflow_worker_secret_valid(text) to service_role;
revoke all on function public.zapflow_claim_message_jobs_secure(text,integer,text) from public,authenticated;
grant execute on function public.zapflow_claim_message_jobs_secure(text,integer,text) to anon;
revoke all on function public.zapflow_finish_message_job_secure(uuid,boolean,text,text,timestamptz,text) from public,authenticated;
grant execute on function public.zapflow_finish_message_job_secure(uuid,boolean,text,text,timestamptz,text) to anon;

create or replace function public.zapflow_create_campaign_with_jobs(
  p_organization_id uuid,
  p_name text,
  p_message text,
  p_total_recipients integer,
  p_eligible_recipients integer,
  p_rejected_recipients integer,
  p_jobs jsonb
)
returns uuid
language plpgsql
security invoker
set search_path=public,auth
as $$
declare
  v_uid uuid:=auth.uid();
  v_campaign_id uuid;
  v_job_count integer;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not exists (
    select 1 from public.organization_members om
    where om.organization_id=p_organization_id
      and om.user_id=v_uid
      and lower(om.role::text) in ('owner','admin')
  ) then raise exception 'forbidden'; end if;
  if p_name is null or length(trim(p_name))<2 or length(trim(p_name))>120 then raise exception 'invalid campaign name'; end if;
  if p_message is null or length(trim(p_message))<1 or length(trim(p_message))>4000 then raise exception 'invalid campaign message'; end if;
  if jsonb_typeof(p_jobs)<>'array' then raise exception 'jobs must be an array'; end if;
  v_job_count:=jsonb_array_length(p_jobs);
  if v_job_count<1 or v_job_count>5000 then raise exception 'invalid jobs count'; end if;
  if v_job_count<>p_eligible_recipients then raise exception 'eligible recipient count mismatch'; end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_jobs) as x(
      whatsapp_account_id uuid,session_id text,recipient_id text,recipient_name text,
      phone text,message text,next_attempt_at timestamptz,max_attempts integer
    )
    left join public.whatsapp_accounts wa
      on wa.id=x.whatsapp_account_id
     and wa.organization_id=p_organization_id
     and wa.session_id=x.session_id
     and wa.is_enabled=true
     and wa.connection_status='CONNECTED'
    where wa.id is null
  ) then raise exception 'invalid or disconnected WhatsApp account in jobs'; end if;

  insert into public.zapflow_campaigns(
    organization_id,name,message,status,total_recipients,eligible_recipients,rejected_recipients,created_by
  ) values (
    p_organization_id,trim(p_name),trim(p_message),'QUEUED',
    p_total_recipients,p_eligible_recipients,p_rejected_recipients,v_uid
  ) returning id into v_campaign_id;

  insert into public.zapflow_message_jobs(
    organization_id,campaign_id,whatsapp_account_id,session_id,recipient_id,recipient_name,
    phone,message,status,attempts,max_attempts,next_attempt_at
  )
  select p_organization_id,v_campaign_id,x.whatsapp_account_id,x.session_id,x.recipient_id,
         x.recipient_name,x.phone,x.message,'QUEUED',0,
         greatest(1,least(coalesce(x.max_attempts,3),10)),x.next_attempt_at
  from jsonb_to_recordset(p_jobs) as x(
    whatsapp_account_id uuid,session_id text,recipient_id text,recipient_name text,
    phone text,message text,next_attempt_at timestamptz,max_attempts integer
  );

  return v_campaign_id;
end;
$$;

revoke all on function public.zapflow_create_campaign_with_jobs(uuid,text,text,integer,integer,integer,jsonb) from public,anon;
grant execute on function public.zapflow_create_campaign_with_jobs(uuid,text,text,integer,integer,integer,jsonb) to authenticated;

create or replace function public.get_or_create_evolution_webhook_secret(p_organization_id uuid)
returns text
language plpgsql
security definer
set search_path=public,vault,auth
as $$
declare
  v_uid uuid:=auth.uid();
  v_name text:='zapflow:evolution:webhook:'||p_organization_id::text;
  v_secret text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not exists (
    select 1 from public.organization_members om
    where om.organization_id=p_organization_id
      and om.user_id=v_uid
      and lower(om.role::text) in ('owner','admin')
  ) then raise exception 'forbidden'; end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name=v_name limit 1;
  if v_secret is null then
    v_secret:=encode(gen_random_bytes(32),'hex');
    perform vault.create_secret(v_secret,v_name,'ZapFlow Evolution webhook secret',null);
  end if;
  return v_secret;
end;
$$;

revoke all on function public.get_or_create_evolution_webhook_secret(uuid) from public,anon;
grant execute on function public.get_or_create_evolution_webhook_secret(uuid) to authenticated;

drop function if exists public.ingest_evolution_webhook(text,text,text,jsonb);

create or replace function public.ingest_evolution_webhook(
  p_organization_id uuid,p_secret text,p_instance_name text,p_event text,p_payload jsonb
)
returns boolean
language plpgsql
security definer
set search_path=public,vault
as $$
declare
  v_expected text;
  v_account_id uuid;
  v_state text;
  v_normalized text;
begin
  if p_secret is null or length(p_secret)<32 then return false; end if;
  select decrypted_secret into v_expected
  from vault.decrypted_secrets
  where name='zapflow:evolution:webhook:'||p_organization_id::text
  limit 1;
  if v_expected is null or v_expected<>p_secret then return false; end if;

  select id into v_account_id
  from public.whatsapp_accounts
  where organization_id=p_organization_id and session_id=p_instance_name
  limit 1;
  if v_account_id is null then return false; end if;

  insert into public.whatsapp_session_events(organization_id,whatsapp_account_id,event_type,payload)
  values(p_organization_id,v_account_id,left(coalesce(p_event,'UNKNOWN'),120),coalesce(p_payload,'{}'::jsonb));

  if upper(coalesce(p_event,'')) like '%CONNECTION%' then
    v_state:=upper(coalesce(p_payload#>>'{data,state}',p_payload->>'state',p_payload#>>'{data,status}',''));
    v_normalized:=case
      when v_state like '%OPEN%' or v_state like '%CONNECTED%' then 'CONNECTED'
      when v_state like '%CONNECTING%' then 'CONNECTING'
      else 'DISCONNECTED'
    end;
    update public.whatsapp_accounts
    set session_status=v_normalized,connection_status=v_normalized,last_seen_at=now(),
        connected_at=case when v_normalized='CONNECTED' then coalesce(connected_at,now()) else connected_at end,
        reconnect_required=(v_normalized='DISCONNECTED'),updated_at=now()
    where id=v_account_id;
  else
    update public.whatsapp_accounts set last_seen_at=now(),updated_at=now() where id=v_account_id;
  end if;
  return true;
end;
$$;

revoke all on function public.ingest_evolution_webhook(uuid,text,text,text,jsonb) from public,authenticated;
grant execute on function public.ingest_evolution_webhook(uuid,text,text,text,jsonb) to anon;

revoke all on function public.zapflow_worker_secret_valid(text) from public,anon,authenticated;
grant execute on function public.zapflow_worker_secret_valid(text) to service_role;

-- RLS policies use (select auth.uid()) to avoid per-row auth function re-evaluation.
drop policy if exists whatsapp_accounts_member_read on public.whatsapp_accounts;
drop policy if exists whatsapp_accounts_admin_write on public.whatsapp_accounts;
drop policy if exists whatsapp_accounts_admin_insert on public.whatsapp_accounts;
drop policy if exists whatsapp_accounts_admin_update on public.whatsapp_accounts;
drop policy if exists whatsapp_accounts_admin_delete on public.whatsapp_accounts;
create policy whatsapp_accounts_member_read on public.whatsapp_accounts for select to authenticated
using (exists(select 1 from public.organization_members m where m.organization_id=whatsapp_accounts.organization_id and m.user_id=(select auth.uid())));
create policy whatsapp_accounts_admin_insert on public.whatsapp_accounts for insert to authenticated
with check (exists(select 1 from public.organization_members m where m.organization_id=whatsapp_accounts.organization_id and m.user_id=(select auth.uid()) and lower(m.role::text) in ('owner','admin')));
create policy whatsapp_accounts_admin_update on public.whatsapp_accounts for update to authenticated
using (exists(select 1 from public.organization_members m where m.organization_id=whatsapp_accounts.organization_id and m.user_id=(select auth.uid()) and lower(m.role::text) in ('owner','admin')))
with check (exists(select 1 from public.organization_members m where m.organization_id=whatsapp_accounts.organization_id and m.user_id=(select auth.uid()) and lower(m.role::text) in ('owner','admin')));
create policy whatsapp_accounts_admin_delete on public.whatsapp_accounts for delete to authenticated
using (exists(select 1 from public.organization_members m where m.organization_id=whatsapp_accounts.organization_id and m.user_id=(select auth.uid()) and lower(m.role::text) in ('owner','admin')));

drop policy if exists zapflow_templates_members_read on public.zapflow_message_templates;
drop policy if exists zapflow_templates_admin_write on public.zapflow_message_templates;
drop policy if exists zapflow_templates_admin_insert on public.zapflow_message_templates;
drop policy if exists zapflow_templates_admin_update on public.zapflow_message_templates;
drop policy if exists zapflow_templates_admin_delete on public.zapflow_message_templates;
create policy zapflow_templates_members_read on public.zapflow_message_templates for select to authenticated
using (exists(select 1 from public.organization_members om where om.organization_id=zapflow_message_templates.organization_id and om.user_id=(select auth.uid())));
create policy zapflow_templates_admin_insert on public.zapflow_message_templates for insert to authenticated
with check (exists(select 1 from public.organization_members om where om.organization_id=zapflow_message_templates.organization_id and om.user_id=(select auth.uid()) and lower(om.role::text) in ('owner','admin')));
create policy zapflow_templates_admin_update on public.zapflow_message_templates for update to authenticated
using (exists(select 1 from public.organization_members om where om.organization_id=zapflow_message_templates.organization_id and om.user_id=(select auth.uid()) and lower(om.role::text) in ('owner','admin')))
with check (exists(select 1 from public.organization_members om where om.organization_id=zapflow_message_templates.organization_id and om.user_id=(select auth.uid()) and lower(om.role::text) in ('owner','admin')));
create policy zapflow_templates_admin_delete on public.zapflow_message_templates for delete to authenticated
using (exists(select 1 from public.organization_members om where om.organization_id=zapflow_message_templates.organization_id and om.user_id=(select auth.uid()) and lower(om.role::text) in ('owner','admin')));

drop policy if exists zapflow_campaigns_members_read on public.zapflow_campaigns;
drop policy if exists zapflow_campaigns_admin_write on public.zapflow_campaigns;
drop policy if exists zapflow_campaigns_admin_insert on public.zapflow_campaigns;
drop policy if exists zapflow_campaigns_admin_update on public.zapflow_campaigns;
drop policy if exists zapflow_campaigns_admin_delete on public.zapflow_campaigns;
create policy zapflow_campaigns_members_read on public.zapflow_campaigns for select to authenticated
using (exists(select 1 from public.organization_members om where om.organization_id=zapflow_campaigns.organization_id and om.user_id=(select auth.uid())));
create policy zapflow_campaigns_admin_insert on public.zapflow_campaigns for insert to authenticated
with check (exists(select 1 from public.organization_members om where om.organization_id=zapflow_campaigns.organization_id and om.user_id=(select auth.uid()) and lower(om.role::text) in ('owner','admin')));
create policy zapflow_campaigns_admin_update on public.zapflow_campaigns for update to authenticated
using (exists(select 1 from public.organization_members om where om.organization_id=zapflow_campaigns.organization_id and om.user_id=(select auth.uid()) and lower(om.role::text) in ('owner','admin')))
with check (exists(select 1 from public.organization_members om where om.organization_id=zapflow_campaigns.organization_id and om.user_id=(select auth.uid()) and lower(om.role::text) in ('owner','admin')));
create policy zapflow_campaigns_admin_delete on public.zapflow_campaigns for delete to authenticated
using (exists(select 1 from public.organization_members om where om.organization_id=zapflow_campaigns.organization_id and om.user_id=(select auth.uid()) and lower(om.role::text) in ('owner','admin')));

drop policy if exists zapflow_message_jobs_members_read on public.zapflow_message_jobs;
drop policy if exists zapflow_message_jobs_admin_write on public.zapflow_message_jobs;
drop policy if exists zapflow_message_jobs_admin_insert on public.zapflow_message_jobs;
drop policy if exists zapflow_message_jobs_admin_update on public.zapflow_message_jobs;
drop policy if exists zapflow_message_jobs_admin_delete on public.zapflow_message_jobs;
create policy zapflow_message_jobs_members_read on public.zapflow_message_jobs for select to authenticated
using (exists(select 1 from public.organization_members om where om.organization_id=zapflow_message_jobs.organization_id and om.user_id=(select auth.uid())));
create policy zapflow_message_jobs_admin_insert on public.zapflow_message_jobs for insert to authenticated
with check (exists(select 1 from public.organization_members om where om.organization_id=zapflow_message_jobs.organization_id and om.user_id=(select auth.uid()) and lower(om.role::text) in ('owner','admin')));
create policy zapflow_message_jobs_admin_update on public.zapflow_message_jobs for update to authenticated
using (exists(select 1 from public.organization_members om where om.organization_id=zapflow_message_jobs.organization_id and om.user_id=(select auth.uid()) and lower(om.role::text) in ('owner','admin')))
with check (exists(select 1 from public.organization_members om where om.organization_id=zapflow_message_jobs.organization_id and om.user_id=(select auth.uid()) and lower(om.role::text) in ('owner','admin')));
create policy zapflow_message_jobs_admin_delete on public.zapflow_message_jobs for delete to authenticated
using (exists(select 1 from public.organization_members om where om.organization_id=zapflow_message_jobs.organization_id and om.user_id=(select auth.uid()) and lower(om.role::text) in ('owner','admin')));

drop policy if exists zapflow_session_events_members_read on public.whatsapp_session_events;
create policy zapflow_session_events_members_read on public.whatsapp_session_events for select to authenticated
using (exists(select 1 from public.organization_members om where om.organization_id=whatsapp_session_events.organization_id and om.user_id=(select auth.uid())));


create index if not exists zapflow_campaigns_organization_idx
  on public.zapflow_campaigns(organization_id);

create index if not exists zapflow_message_jobs_organization_idx
  on public.zapflow_message_jobs(organization_id);

create index if not exists zapflow_message_jobs_whatsapp_account_idx
  on public.zapflow_message_jobs(whatsapp_account_id)
  where whatsapp_account_id is not null;
