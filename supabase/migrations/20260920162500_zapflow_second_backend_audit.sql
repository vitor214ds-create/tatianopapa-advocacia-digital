-- Second ZapFlow backend audit hardening.

create or replace function public.zapflow_get_gateway_config_for_worker(
  p_organization_id uuid,
  p_secret text
)
returns table(base_url text, api_key text)
language plpgsql
security definer
set search_path=public,vault
as $$
begin
  if not public.zapflow_worker_secret_valid(p_secret) then
    raise exception 'unauthorized worker';
  end if;

  return query
  select
    (select decrypted_secret from vault.decrypted_secrets
      where name='zapflow:evolution:url:'||p_organization_id::text limit 1),
    (select decrypted_secret from vault.decrypted_secrets
      where name='zapflow:evolution:key:'||p_organization_id::text limit 1);
end;
$$;

revoke all on function public.zapflow_get_gateway_config_for_worker(uuid,text)
  from public,authenticated;
grant execute on function public.zapflow_get_gateway_config_for_worker(uuid,text)
  to anon;

create or replace function public.zapflow_reserve_whatsapp_account(
  p_organization_id uuid,
  p_session_id text
)
returns table(account_id uuid, is_new boolean)
language plpgsql
security invoker
set search_path=public,auth
as $$
declare
  v_uid uuid:=auth.uid();
  v_existing uuid;
  v_id uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  if not exists (
    select 1 from public.organization_members om
    where om.organization_id=p_organization_id
      and om.user_id=v_uid
      and lower(om.role::text) in ('owner','admin')
  ) then raise exception 'forbidden'; end if;

  if p_session_id is null
     or p_session_id !~ '^zapflow-[0-9a-fA-F]{8}-[A-Za-z0-9_-]{1,50}$'
  then raise exception 'invalid session id'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text,0));

  select id into v_existing
  from public.whatsapp_accounts
  where organization_id=p_organization_id and session_id=p_session_id
  limit 1;

  if v_existing is not null then
    return query select v_existing,false;
    return;
  end if;

  if (select count(*) from public.whatsapp_accounts where organization_id=p_organization_id)>=10
  then raise exception 'whatsapp account limit reached'; end if;

  insert into public.whatsapp_accounts(
    organization_id,internal_name,provider,session_id,status,
    connection_status,session_status,reconnect_required,is_enabled,last_seen_at
  )
  values(
    p_organization_id,p_session_id,'evolution_baileys',p_session_id,'CREATING',
    'CONNECTING','CONNECTING',false,true,now()
  )
  returning id into v_id;

  return query select v_id,true;
end;
$$;

revoke all on function public.zapflow_reserve_whatsapp_account(uuid,text) from public,anon;
grant execute on function public.zapflow_reserve_whatsapp_account(uuid,text) to authenticated;

alter table public.zapflow_campaigns
  drop constraint if exists zapflow_campaigns_status_check,
  drop constraint if exists zapflow_campaigns_counts_check,
  drop constraint if exists zapflow_campaigns_name_check,
  drop constraint if exists zapflow_campaigns_message_check;

alter table public.zapflow_campaigns
  add constraint zapflow_campaigns_status_check
    check(status in ('QUEUED','PROCESSING','COMPLETED','PARTIAL','FAILED','CANCELED')),
  add constraint zapflow_campaigns_counts_check
    check(
      total_recipients>=0 and eligible_recipients>=0 and rejected_recipients>=0
      and sent_count>=0 and failed_count>=0
      and eligible_recipients+rejected_recipients=total_recipients
      and sent_count+failed_count<=eligible_recipients
    ),
  add constraint zapflow_campaigns_name_check
    check(char_length(trim(name)) between 2 and 120),
  add constraint zapflow_campaigns_message_check
    check(char_length(message) between 1 and 4000);

alter table public.zapflow_message_jobs
  drop constraint if exists zapflow_message_jobs_status_check,
  drop constraint if exists zapflow_message_jobs_attempts_check,
  drop constraint if exists zapflow_message_jobs_phone_check,
  drop constraint if exists zapflow_message_jobs_message_check;

alter table public.zapflow_message_jobs
  add constraint zapflow_message_jobs_status_check
    check(status in ('QUEUED','PROCESSING','RETRY','SENT','FAILED','CANCELED')),
  add constraint zapflow_message_jobs_attempts_check
    check(attempts>=0 and max_attempts between 1 and 10),
  add constraint zapflow_message_jobs_phone_check
    check(phone ~ '^[0-9]{8,15}$'),
  add constraint zapflow_message_jobs_message_check
    check(char_length(message) between 1 and 4000);

alter table public.whatsapp_accounts
  drop constraint if exists whatsapp_accounts_connection_status_check,
  drop constraint if exists whatsapp_accounts_session_status_check,
  drop constraint if exists whatsapp_accounts_weight_check;

alter table public.whatsapp_accounts
  add constraint whatsapp_accounts_connection_status_check
    check(connection_status is null or connection_status in ('CONNECTING','WAITING_QR','CONNECTED','DISCONNECTED')),
  add constraint whatsapp_accounts_session_status_check
    check(session_status is null or session_status in ('CONNECTING','WAITING_QR','CONNECTED','DISCONNECTED')),
  add constraint whatsapp_accounts_weight_check
    check(
      (distribution_weight is null or distribution_weight between 1 and 1000)
      and (weight is null or weight between 1 and 1000)
    );
