-- ZapFlow durable campaign queue
-- Safe to run more than once. Does not alter unrelated project tables.

create extension if not exists pgcrypto;

create table if not exists public.zapflow_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  name text not null,
  message text not null,
  status text not null default 'QUEUED' check (status in ('DRAFT','QUEUED','PROCESSING','COMPLETED','PARTIAL','FAILED','CANCELLED')),
  total_recipients integer not null default 0,
  eligible_recipients integer not null default 0,
  rejected_recipients integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  created_by uuid,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.zapflow_message_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  campaign_id uuid not null references public.zapflow_campaigns(id) on delete cascade,
  whatsapp_account_id uuid,
  session_id text not null,
  recipient_id text,
  recipient_name text,
  phone text not null,
  message text not null,
  status text not null default 'QUEUED' check (status in ('QUEUED','PROCESSING','RETRY','SENT','FAILED','CANCELLED')),
  attempts integer not null default 0,
  max_attempts integer not null default 4,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  provider_message_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists zapflow_campaigns_org_created_idx
  on public.zapflow_campaigns (organization_id, created_at desc);
create index if not exists zapflow_message_jobs_claim_idx
  on public.zapflow_message_jobs (status, next_attempt_at, created_at)
  where status in ('QUEUED','RETRY');
create index if not exists zapflow_message_jobs_campaign_idx
  on public.zapflow_message_jobs (campaign_id, status);
create index if not exists zapflow_message_jobs_org_idx
  on public.zapflow_message_jobs (organization_id, created_at desc);

alter table public.zapflow_campaigns enable row level security;
alter table public.zapflow_message_jobs enable row level security;

drop policy if exists "zapflow_campaigns_members_read" on public.zapflow_campaigns;
create policy "zapflow_campaigns_members_read"
on public.zapflow_campaigns for select to authenticated
using (exists (
  select 1 from public.organization_members om
  where om.organization_id = zapflow_campaigns.organization_id
    and om.user_id = auth.uid()
));

drop policy if exists "zapflow_campaigns_admin_write" on public.zapflow_campaigns;
create policy "zapflow_campaigns_admin_write"
on public.zapflow_campaigns for all to authenticated
using (exists (
  select 1 from public.organization_members om
  where om.organization_id = zapflow_campaigns.organization_id
    and om.user_id = auth.uid()
    and om.role in ('OWNER','ADMIN')
))
with check (exists (
  select 1 from public.organization_members om
  where om.organization_id = zapflow_campaigns.organization_id
    and om.user_id = auth.uid()
    and om.role in ('OWNER','ADMIN')
));

drop policy if exists "zapflow_message_jobs_members_read" on public.zapflow_message_jobs;
create policy "zapflow_message_jobs_members_read"
on public.zapflow_message_jobs for select to authenticated
using (exists (
  select 1 from public.organization_members om
  where om.organization_id = zapflow_message_jobs.organization_id
    and om.user_id = auth.uid()
));

drop policy if exists "zapflow_message_jobs_admin_write" on public.zapflow_message_jobs;
create policy "zapflow_message_jobs_admin_write"
on public.zapflow_message_jobs for all to authenticated
using (exists (
  select 1 from public.organization_members om
  where om.organization_id = zapflow_message_jobs.organization_id
    and om.user_id = auth.uid()
    and om.role in ('OWNER','ADMIN')
))
with check (exists (
  select 1 from public.organization_members om
  where om.organization_id = zapflow_message_jobs.organization_id
    and om.user_id = auth.uid()
    and om.role in ('OWNER','ADMIN')
));

-- Atomically claims due jobs so multiple workers cannot send the same message.
create or replace function public.zapflow_claim_message_jobs(
  p_worker_id text,
  p_limit integer default 20
)
returns setof public.zapflow_message_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select j.id
    from public.zapflow_message_jobs j
    where j.status in ('QUEUED','RETRY')
      and j.next_attempt_at <= now()
      and (j.locked_at is null or j.locked_at < now() - interval '10 minutes')
    order by j.next_attempt_at asc, j.created_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 20), 100))
  ), claimed as (
    update public.zapflow_message_jobs j
    set status = 'PROCESSING',
        locked_at = now(),
        locked_by = p_worker_id,
        attempts = j.attempts + 1,
        updated_at = now()
    from due
    where j.id = due.id
    returning j.*
  )
  select * from claimed;
end;
$$;

revoke all on function public.zapflow_claim_message_jobs(text, integer) from public, anon, authenticated;
grant execute on function public.zapflow_claim_message_jobs(text, integer) to service_role;

create or replace function public.zapflow_refresh_campaign_counters(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sent integer;
  v_failed integer;
  v_pending integer;
begin
  select
    count(*) filter (where status = 'SENT'),
    count(*) filter (where status = 'FAILED'),
    count(*) filter (where status in ('QUEUED','PROCESSING','RETRY'))
  into v_sent, v_failed, v_pending
  from public.zapflow_message_jobs
  where campaign_id = p_campaign_id;

  update public.zapflow_campaigns
  set sent_count = coalesce(v_sent, 0),
      failed_count = coalesce(v_failed, 0),
      status = case
        when coalesce(v_pending, 0) > 0 then 'PROCESSING'
        when coalesce(v_failed, 0) = 0 then 'COMPLETED'
        when coalesce(v_sent, 0) > 0 then 'PARTIAL'
        else 'FAILED'
      end,
      started_at = coalesce(started_at, now()),
      completed_at = case when coalesce(v_pending, 0) = 0 then now() else null end,
      updated_at = now()
  where id = p_campaign_id;
end;
$$;

revoke all on function public.zapflow_refresh_campaign_counters(uuid) from public, anon, authenticated;
grant execute on function public.zapflow_refresh_campaign_counters(uuid) to service_role;
