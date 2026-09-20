-- Pre-launch operational hardening for ZapFlow.

create or replace function public.zapflow_dashboard_metrics(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_uid uuid:=auth.uid();
  v_sent_24h integer;
  v_failed_24h integer;
  v_pending integer;
  v_replies_24h integer;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not exists (
    select 1 from public.organization_members om
    where om.organization_id=p_organization_id and om.user_id=v_uid
  ) then raise exception 'forbidden'; end if;

  select count(*) into v_sent_24h
  from public.zapflow_message_jobs
  where organization_id=p_organization_id
    and status='SENT'
    and sent_at>=now()-interval '24 hours';

  select count(*) into v_failed_24h
  from public.zapflow_message_jobs
  where organization_id=p_organization_id
    and status='FAILED'
    and updated_at>=now()-interval '24 hours';

  select count(*) into v_pending
  from public.zapflow_message_jobs
  where organization_id=p_organization_id
    and status in ('QUEUED','RETRY','PROCESSING');

  select count(*) into v_replies_24h
  from public.whatsapp_session_events
  where organization_id=p_organization_id
    and created_at>=now()-interval '24 hours'
    and upper(event_type) like '%MESSAGES_UPSERT%'
    and lower(coalesce(payload->>'fromMe','false'))='false';

  return jsonb_build_object(
    'sent24h',coalesce(v_sent_24h,0),
    'failed24h',coalesce(v_failed_24h,0),
    'pending',coalesce(v_pending,0),
    'replies24h',coalesce(v_replies_24h,0)
  );
end;
$$;

revoke all on function public.zapflow_dashboard_metrics(uuid) from public,anon;
grant execute on function public.zapflow_dashboard_metrics(uuid) to authenticated;

update public.whatsapp_accounts
set connection_status='DISCONNECTED',
    session_status='DISCONNECTED',
    reconnect_required=true,
    updated_at=now()
where connection_status in ('CONNECTING','WAITING_QR')
  and updated_at < now()-interval '10 minutes';

do $$
declare v_job bigint;
begin
  select jobid into v_job from cron.job where jobname='zapflow_stale_session_cleanup' limit 1;
  if v_job is not null then perform cron.unschedule(v_job); end if;
end $$;

select cron.schedule(
  'zapflow_stale_session_cleanup',
  '*/5 * * * *',
  $cron$
    update public.whatsapp_accounts
    set connection_status='DISCONNECTED',
        session_status='DISCONNECTED',
        reconnect_required=true,
        updated_at=now()
    where connection_status in ('CONNECTING','WAITING_QR')
      and updated_at < now()-interval '10 minutes';
  $cron$
);

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
  if p_message ~* '{{\s*(?!nome\s*}}|telefone\s*}})[a-zA-Z0-9_]+\s*}}' then
    raise exception 'unsupported template variable';
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
       or char_length(coalesce(x.message,'')) not between 1 and 4000
       or x.message is distinct from
          regexp_replace(
            regexp_replace(
              p_message,
              '{{\s*nome\s*}}',
              coalesce(nullif(trim(x.recipient_name),''),'cliente'),
              'gi'
            ),
            '{{\s*telefone\s*}}',
            x.phone,
            'gi'
          )
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
      on s.organization_id=p_organization_id and s.phone=x.phone
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
      on s.organization_id=j.organization_id and s.phone=j.phone
    where j.status in ('QUEUED','RETRY')
       or (j.status='PROCESSING' and j.locked_at<now()-interval '10 minutes')
  loop
    update public.zapflow_message_jobs j
    set status='CANCELED',last_error='Recipient suppressed before send',
        locked_at=null,locked_by=null,updated_at=now()
    where j.campaign_id=v_campaign_id
      and (
        j.status in ('QUEUED','RETRY')
        or (j.status='PROCESSING' and j.locked_at<now()-interval '10 minutes')
      )
      and exists (
        select 1 from public.zapflow_suppressions s
        where s.organization_id=j.organization_id and s.phone=j.phone
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
    set status='CANCELED',last_error='WhatsApp session removed before send',
        locked_at=null,locked_by=null,updated_at=now()
    where j.campaign_id=v_campaign_id
      and j.whatsapp_account_id is null
      and (
        j.status in ('QUEUED','RETRY')
        or (j.status='PROCESSING' and j.locked_at<now()-interval '10 minutes')
      );
    perform public.zapflow_refresh_campaign_counters(v_campaign_id);
  end loop;

  return query
  with sent_24h as (
    select j.session_id,count(*)::integer as sent_count
    from public.zapflow_message_jobs j
    where j.status='SENT' and j.sent_at>=now()-interval '24 hours'
    group by j.session_id
  ),
  ranked as (
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
    left join sent_24h s on s.session_id=j.session_id
    where coalesce(s.sent_count,0)<150
      and (
        (
          j.status in ('QUEUED','RETRY')
          and j.next_attempt_at<=now()
          and j.locked_at is null
        )
        or (
          j.status='PROCESSING'
          and j.locked_at<now()-interval '10 minutes'
        )
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
    set status='PROCESSING',locked_at=now(),locked_by=p_worker_id,
        attempts=j.attempts+1,updated_at=now()
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
