-- Reconcile production hardening that existed outside the repository.

create or replace function public.set_evolution_gateway_config(
  p_organization_id uuid,
  p_base_url text,
  p_api_key text
)
returns void
language plpgsql
security definer
set search_path=public,vault,auth
as $$
declare
  v_uid uuid:=auth.uid();
  v_url_name text:='zapflow:evolution:url:'||p_organization_id::text;
  v_key_name text:='zapflow:evolution:key:'||p_organization_id::text;
  v_secret_id uuid;
  v_base_url text:=rtrim(trim(p_base_url),'/');
  v_private_railway boolean;
  v_public_https boolean;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  if not exists (
    select 1 from public.organization_members
    where organization_id=p_organization_id
      and user_id=v_uid
      and lower(role::text) in ('owner','admin')
  ) then raise exception 'forbidden'; end if;

  v_private_railway :=
    v_base_url ~ '^http://[A-Za-z0-9.-]+\.railway\.internal(:[0-9]{1,5})?$';

  v_public_https :=
    v_base_url ~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?$'
    and v_base_url !~* '^https://(localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[01])\.)';

  if v_base_url is null or not (v_private_railway or v_public_https) then
    raise exception 'invalid Evolution base URL';
  end if;

  if p_api_key is null
     or length(trim(p_api_key))<8
     or length(trim(p_api_key))>1024
  then raise exception 'invalid Evolution API key'; end if;

  select id into v_secret_id
  from vault.secrets
  where name=v_url_name
  limit 1;

  if v_secret_id is null then
    perform vault.create_secret(v_base_url,v_url_name,'ZapFlow Evolution API URL',null);
  else
    perform vault.update_secret(v_secret_id,v_base_url,v_url_name,'ZapFlow Evolution API URL',null);
  end if;

  v_secret_id:=null;
  select id into v_secret_id
  from vault.secrets
  where name=v_key_name
  limit 1;

  if v_secret_id is null then
    perform vault.create_secret(trim(p_api_key),v_key_name,'ZapFlow Evolution API key',null);
  else
    perform vault.update_secret(v_secret_id,trim(p_api_key),v_key_name,'ZapFlow Evolution API key',null);
  end if;
end;
$$;

create or replace function public.get_evolution_gateway_config(p_organization_id uuid)
returns table(base_url text, api_key text)
language plpgsql
security definer
set search_path=public,vault,auth
as $$
declare
  v_uid uuid:=auth.uid();
  v_url_name text:='zapflow:evolution:url:'||p_organization_id::text;
  v_key_name text:='zapflow:evolution:key:'||p_organization_id::text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  if not exists (
    select 1 from public.organization_members
    where organization_id=p_organization_id
      and user_id=v_uid
      and lower(role::text) in ('owner','admin')
  ) then raise exception 'forbidden'; end if;

  return query
  select
    (select decrypted_secret from vault.decrypted_secrets where name=v_url_name limit 1),
    (select decrypted_secret from vault.decrypted_secrets where name=v_key_name limit 1);
end;
$$;

revoke all on function public.set_evolution_gateway_config(uuid,text,text) from public,anon;
revoke all on function public.get_evolution_gateway_config(uuid) from public,anon;
grant execute on function public.set_evolution_gateway_config(uuid,text,text) to authenticated;
grant execute on function public.get_evolution_gateway_config(uuid) to authenticated;

alter table public.zapflow_campaigns
  add column if not exists canceled_count integer not null default 0;

alter table public.zapflow_campaigns
  drop constraint if exists zapflow_campaigns_counts_check;

alter table public.zapflow_campaigns
  add constraint zapflow_campaigns_counts_check
  check (
    total_recipients>=0
    and eligible_recipients>=0
    and rejected_recipients>=0
    and sent_count>=0
    and failed_count>=0
    and canceled_count>=0
    and eligible_recipients+rejected_recipients=total_recipients
    and sent_count+failed_count+canceled_count<=eligible_recipients
  );

create or replace function public.zapflow_refresh_campaign_counters(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_sent integer;
  v_failed integer;
  v_canceled integer;
  v_pending integer;
  v_eligible integer;
begin
  select
    count(*) filter(where status='SENT'),
    count(*) filter(where status='FAILED'),
    count(*) filter(where status='CANCELED'),
    count(*) filter(where status in ('QUEUED','PROCESSING','RETRY'))
  into v_sent,v_failed,v_canceled,v_pending
  from public.zapflow_message_jobs
  where campaign_id=p_campaign_id;

  select eligible_recipients into v_eligible
  from public.zapflow_campaigns
  where id=p_campaign_id;

  update public.zapflow_campaigns
  set sent_count=coalesce(v_sent,0),
      failed_count=coalesce(v_failed,0),
      canceled_count=coalesce(v_canceled,0),
      status=case
        when coalesce(v_pending,0)>0 then 'PROCESSING'
        when coalesce(v_sent,0)=coalesce(v_eligible,0)
             and coalesce(v_failed,0)=0
             and coalesce(v_canceled,0)=0 then 'COMPLETED'
        when coalesce(v_canceled,0)=coalesce(v_eligible,0)
             and coalesce(v_sent,0)=0
             and coalesce(v_failed,0)=0 then 'CANCELED'
        when coalesce(v_sent,0)>0 then 'PARTIAL'
        else 'FAILED'
      end,
      started_at=coalesce(started_at,now()),
      completed_at=case when coalesce(v_pending,0)=0 then now() else null end,
      updated_at=now()
  where id=p_campaign_id;
end;
$$;

revoke all on function public.zapflow_refresh_campaign_counters(uuid)
from public,anon,authenticated;
grant execute on function public.zapflow_refresh_campaign_counters(uuid)
to service_role;

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
declare
  v_campaign_id uuid;
begin
  if not public.zapflow_worker_secret_valid(p_secret) then
    raise exception 'unauthorized worker';
  end if;

  for v_campaign_id in
    select distinct j.campaign_id
    from public.zapflow_message_jobs j
    join public.zapflow_suppressions s
      on s.organization_id=j.organization_id
     and s.phone=j.phone
    where j.status in ('QUEUED','RETRY')
       or (j.status='PROCESSING' and j.locked_at<now()-interval '10 minutes')
  loop
    update public.zapflow_message_jobs j
    set status='CANCELED',
        last_error='Recipient suppressed before send',
        locked_at=null,
        locked_by=null,
        updated_at=now()
    where j.campaign_id=v_campaign_id
      and (
        j.status in ('QUEUED','RETRY')
        or (j.status='PROCESSING' and j.locked_at<now()-interval '10 minutes')
      )
      and exists (
        select 1 from public.zapflow_suppressions s
        where s.organization_id=j.organization_id
          and s.phone=j.phone
      );

    perform public.zapflow_refresh_campaign_counters(v_campaign_id);
  end loop;

  for v_campaign_id in
    select distinct j.campaign_id
    from public.zapflow_message_jobs j
    where j.whatsapp_account_id is null
      and (
        j.status in ('QUEUED','RETRY')
        or (j.status='PROCESSING' and j.locked_at<now()-interval '10 minutes')
      )
  loop
    update public.zapflow_message_jobs j
    set status='CANCELED',
        last_error='WhatsApp session removed before send',
        locked_at=null,
        locked_by=null,
        updated_at=now()
    where j.campaign_id=v_campaign_id
      and j.whatsapp_account_id is null
      and (
        j.status in ('QUEUED','RETRY')
        or (j.status='PROCESSING' and j.locked_at<now()-interval '10 minutes')
      );

    perform public.zapflow_refresh_campaign_counters(v_campaign_id);
  end loop;

  return query
  with ranked as (
    select j.id,
           row_number() over (
             partition by j.session_id
             order by j.next_attempt_at asc,j.created_at asc
           ) as rn
    from public.zapflow_message_jobs j
    join public.whatsapp_accounts wa
      on wa.id=j.whatsapp_account_id
     and wa.organization_id=j.organization_id
     and wa.session_id=j.session_id
     and wa.is_enabled=true
     and wa.connection_status='CONNECTED'
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

revoke all on function public.zapflow_claim_message_jobs_secure(text,integer,text)
from public,authenticated;
grant execute on function public.zapflow_claim_message_jobs_secure(text,integer,text)
to anon;

create or replace function public.zapflow_delete_whatsapp_account(
  p_organization_id uuid,
  p_account_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path=public,auth
as $$
declare
  v_uid uuid:=auth.uid();
  v_campaign_id uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  if not exists (
    select 1 from public.organization_members om
    where om.organization_id=p_organization_id
      and om.user_id=v_uid
      and lower(om.role::text) in ('owner','admin')
  ) then raise exception 'forbidden'; end if;

  if not exists (
    select 1 from public.whatsapp_accounts wa
    where wa.id=p_account_id and wa.organization_id=p_organization_id
  ) then return false; end if;

  for v_campaign_id in
    select distinct campaign_id
    from public.zapflow_message_jobs
    where whatsapp_account_id=p_account_id
      and (
        status in ('QUEUED','RETRY')
        or (status='PROCESSING' and locked_at<now()-interval '10 minutes')
      )
  loop
    update public.zapflow_message_jobs
    set status='CANCELED',
        last_error='WhatsApp session removed before send',
        locked_at=null,
        locked_by=null,
        updated_at=now()
    where whatsapp_account_id=p_account_id
      and campaign_id=v_campaign_id
      and (
        status in ('QUEUED','RETRY')
        or (status='PROCESSING' and locked_at<now()-interval '10 minutes')
      );

    perform public.zapflow_refresh_campaign_counters(v_campaign_id);
  end loop;

  delete from public.whatsapp_accounts
  where id=p_account_id and organization_id=p_organization_id;

  return true;
end;
$$;

revoke all on function public.zapflow_delete_whatsapp_account(uuid,uuid)
from public,anon;
grant execute on function public.zapflow_delete_whatsapp_account(uuid,uuid)
to authenticated;
