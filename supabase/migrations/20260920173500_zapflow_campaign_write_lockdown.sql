-- Campaign/job write lockdown.
-- All writes must pass through validated RPCs or worker functions.

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
security definer
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

  if p_name is null or length(trim(p_name))<2 or length(trim(p_name))>120 then
    raise exception 'invalid campaign name';
  end if;

  if p_message is null or length(trim(p_message))<1 or length(trim(p_message))>4000 then
    raise exception 'invalid campaign message';
  end if;

  if jsonb_typeof(p_jobs)<>'array' then raise exception 'jobs must be an array'; end if;

  v_job_count:=jsonb_array_length(p_jobs);
  if v_job_count<1 or v_job_count>5000 then raise exception 'invalid jobs count'; end if;
  if p_total_recipients<1 or p_total_recipients>5000 then raise exception 'invalid recipient total'; end if;
  if p_eligible_recipients<1 or p_rejected_recipients<0 then raise exception 'invalid recipient counts'; end if;
  if v_job_count<>p_eligible_recipients then raise exception 'eligible recipient count mismatch'; end if;
  if p_eligible_recipients+p_rejected_recipients<>p_total_recipients then raise exception 'recipient count mismatch'; end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_jobs) as x(
      whatsapp_account_id uuid,session_id text,recipient_id text,recipient_name text,
      phone text,message text,next_attempt_at timestamptz,max_attempts integer
    )
    where x.phone !~ '^[0-9]{8,15}$'
       or x.message is distinct from p_message
       or char_length(coalesce(x.recipient_name,''))>200
       or char_length(coalesce(x.recipient_id,''))>120
       or x.next_attempt_at is null
       or x.max_attempts is null
       or x.max_attempts not between 1 and 10
  ) then raise exception 'invalid job payload'; end if;

  if (
    select count(distinct x.phone)
    from jsonb_to_recordset(p_jobs) as x(
      whatsapp_account_id uuid,session_id text,recipient_id text,recipient_name text,
      phone text,message text,next_attempt_at timestamptz,max_attempts integer
    )
  ) <> v_job_count then
    raise exception 'duplicate recipient phone';
  end if;

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

  if exists (
    select 1
    from jsonb_to_recordset(p_jobs) as x(
      whatsapp_account_id uuid,session_id text,recipient_id text,recipient_name text,
      phone text,message text,next_attempt_at timestamptz,max_attempts integer
    )
    join public.zapflow_suppressions s
      on s.organization_id=p_organization_id
     and s.phone=x.phone
  ) then raise exception 'suppressed recipient in jobs'; end if;

  insert into public.zapflow_campaigns(
    organization_id,name,message,status,total_recipients,
    eligible_recipients,rejected_recipients,created_by
  )
  values(
    p_organization_id,trim(p_name),p_message,'QUEUED',p_total_recipients,
    p_eligible_recipients,p_rejected_recipients,v_uid
  )
  returning id into v_campaign_id;

  insert into public.zapflow_message_jobs(
    organization_id,campaign_id,whatsapp_account_id,session_id,
    recipient_id,recipient_name,phone,message,status,attempts,
    max_attempts,next_attempt_at
  )
  select
    p_organization_id,v_campaign_id,x.whatsapp_account_id,x.session_id,
    x.recipient_id,x.recipient_name,x.phone,x.message,'QUEUED',0,
    x.max_attempts,x.next_attempt_at
  from jsonb_to_recordset(p_jobs) as x(
    whatsapp_account_id uuid,session_id text,recipient_id text,recipient_name text,
    phone text,message text,next_attempt_at timestamptz,max_attempts integer
  );

  return v_campaign_id;
end;
$$;

revoke all on function public.zapflow_create_campaign_with_jobs(
  uuid,text,text,integer,integer,integer,jsonb
) from public,anon;
grant execute on function public.zapflow_create_campaign_with_jobs(
  uuid,text,text,integer,integer,integer,jsonb
) to authenticated;

drop policy if exists zapflow_campaigns_admin_insert on public.zapflow_campaigns;
drop policy if exists zapflow_campaigns_admin_update on public.zapflow_campaigns;
drop policy if exists zapflow_campaigns_admin_delete on public.zapflow_campaigns;

drop policy if exists zapflow_message_jobs_admin_insert on public.zapflow_message_jobs;
drop policy if exists zapflow_message_jobs_admin_update on public.zapflow_message_jobs;
drop policy if exists zapflow_message_jobs_admin_delete on public.zapflow_message_jobs;
