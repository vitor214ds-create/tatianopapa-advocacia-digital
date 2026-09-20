-- Persistent opt-out, webhook minimization and retention.

create table if not exists public.zapflow_suppressions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  phone text not null,
  reason text not null default 'opt_out',
  source text not null default 'manual',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, phone),
  constraint zapflow_suppressions_phone_check check (phone ~ '^[0-9]{8,15}$'),
  constraint zapflow_suppressions_source_check check (source in ('manual','webhook','import','system'))
);

alter table public.zapflow_suppressions enable row level security;

drop policy if exists zapflow_suppressions_members_read on public.zapflow_suppressions;
drop policy if exists zapflow_suppressions_admin_insert on public.zapflow_suppressions;
drop policy if exists zapflow_suppressions_admin_update on public.zapflow_suppressions;
drop policy if exists zapflow_suppressions_admin_delete on public.zapflow_suppressions;

create policy zapflow_suppressions_members_read
on public.zapflow_suppressions for select to authenticated
using (
  exists (
    select 1 from public.organization_members om
    where om.organization_id=zapflow_suppressions.organization_id
      and om.user_id=(select auth.uid())
  )
);

create policy zapflow_suppressions_admin_insert
on public.zapflow_suppressions for insert to authenticated
with check (
  exists (
    select 1 from public.organization_members om
    where om.organization_id=zapflow_suppressions.organization_id
      and om.user_id=(select auth.uid())
      and lower(om.role::text) in ('owner','admin')
  )
);

create policy zapflow_suppressions_admin_update
on public.zapflow_suppressions for update to authenticated
using (
  exists (
    select 1 from public.organization_members om
    where om.organization_id=zapflow_suppressions.organization_id
      and om.user_id=(select auth.uid())
      and lower(om.role::text) in ('owner','admin')
  )
)
with check (
  exists (
    select 1 from public.organization_members om
    where om.organization_id=zapflow_suppressions.organization_id
      and om.user_id=(select auth.uid())
      and lower(om.role::text) in ('owner','admin')
  )
);

create policy zapflow_suppressions_admin_delete
on public.zapflow_suppressions for delete to authenticated
using (
  exists (
    select 1 from public.organization_members om
    where om.organization_id=zapflow_suppressions.organization_id
      and om.user_id=(select auth.uid())
      and lower(om.role::text) in ('owner','admin')
  )
);

create index if not exists zapflow_suppressions_org_phone_idx
  on public.zapflow_suppressions(organization_id,phone);

create or replace function public.zapflow_get_suppressed_phones(
  p_organization_id uuid,
  p_phones text[]
)
returns table(phone text)
language plpgsql
security invoker
set search_path=public,auth
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not exists (
    select 1 from public.organization_members om
    where om.organization_id=p_organization_id
      and om.user_id=auth.uid()
  ) then raise exception 'forbidden'; end if;

  return query
  select s.phone
  from public.zapflow_suppressions s
  where s.organization_id=p_organization_id
    and s.phone=any(p_phones);
end;
$$;

revoke all on function public.zapflow_get_suppressed_phones(uuid,text[]) from public,anon;
grant execute on function public.zapflow_get_suppressed_phones(uuid,text[]) to authenticated;

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
  if p_eligible_recipients+p_rejected_recipients<>p_total_recipients then raise exception 'recipient count mismatch'; end if;

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

revoke all on function public.zapflow_create_campaign_with_jobs(uuid,text,text,integer,integer,integer,jsonb)
  from public,anon;
grant execute on function public.zapflow_create_campaign_with_jobs(uuid,text,text,integer,integer,integer,jsonb)
  to authenticated;

create or replace function public.ingest_evolution_webhook(
  p_organization_id uuid,
  p_secret text,
  p_instance_name text,
  p_event text,
  p_payload jsonb
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
  v_from_me text;
  v_jid text;
  v_text text;
  v_phone text;
  v_event_payload jsonb;
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

  if upper(coalesce(p_event,'')) like '%MESSAGES_%' then
    v_event_payload:=jsonb_strip_nulls(jsonb_build_object(
      'messageId', p_payload#>>'{data,key,id}',
      'fromMe', p_payload#>>'{data,key,fromMe}',
      'remoteJid', coalesce(
        nullif(p_payload#>>'{data,key,remoteJidAlt}',''),
        nullif(p_payload#>>'{data,key,remoteJid}','')
      ),
      'status', p_payload#>>'{data,status}'
    ));
  elsif upper(coalesce(p_event,'')) like '%CONNECTION%' then
    v_event_payload:=jsonb_strip_nulls(jsonb_build_object(
      'state', coalesce(
        p_payload#>>'{data,state}',
        p_payload->>'state',
        p_payload#>>'{data,status}'
      )
    ));
  else
    v_event_payload:='{}'::jsonb;
  end if;

  insert into public.whatsapp_session_events(
    organization_id,whatsapp_account_id,event_type,payload
  )
  values(
    p_organization_id,v_account_id,left(coalesce(p_event,'UNKNOWN'),120),v_event_payload
  );

  if upper(coalesce(p_event,'')) like '%CONNECTION%' then
    v_state:=upper(trim(coalesce(
      p_payload#>>'{data,state}',
      p_payload->>'state',
      p_payload#>>'{data,status}',
      ''
    )));

    v_normalized:=case
      when v_state in ('OPEN','CONNECTED') then 'CONNECTED'
      when v_state in ('CONNECTING','PAIRING','WAITING_QR') then 'CONNECTING'
      else 'DISCONNECTED'
    end;

    update public.whatsapp_accounts
    set session_status=v_normalized,
        connection_status=v_normalized,
        last_seen_at=now(),
        connected_at=case when v_normalized='CONNECTED' then coalesce(connected_at,now()) else connected_at end,
        reconnect_required=(v_normalized='DISCONNECTED'),
        updated_at=now()
    where id=v_account_id;
  else
    update public.whatsapp_accounts
    set last_seen_at=now(),updated_at=now()
    where id=v_account_id;
  end if;

  if upper(coalesce(p_event,'')) like '%MESSAGES_UPSERT%' then
    v_from_me:=lower(coalesce(p_payload#>>'{data,key,fromMe}','false'));
    v_jid:=coalesce(
      nullif(p_payload#>>'{data,key,remoteJidAlt}',''),
      nullif(p_payload#>>'{data,key,remoteJid}','')
    );
    v_text:=upper(trim(coalesce(
      p_payload#>>'{data,message,conversation}',
      p_payload#>>'{data,message,extendedTextMessage,text}',
      ''
    )));

    if v_from_me='false'
       and v_jid like '%@s.whatsapp.net'
       and v_text in ('SAIR','PARAR','CANCELAR','STOP')
    then
      v_phone:=regexp_replace(split_part(v_jid,'@',1),'[^0-9]','','g');

      if v_phone ~ '^[0-9]{8,15}$' then
        insert into public.zapflow_suppressions(
          organization_id,phone,reason,source,updated_at
        )
        values(
          p_organization_id,v_phone,'opt_out:'||lower(v_text),'webhook',now()
        )
        on conflict (organization_id,phone)
        do update set reason=excluded.reason,source='webhook',updated_at=now();
      end if;
    end if;
  end if;

  return true;
end;
$$;

do $$
declare
  v_job bigint;
begin
  select jobid into v_job from cron.job where jobname='zapflow_event_retention' limit 1;
  if v_job is not null then perform cron.unschedule(v_job); end if;
end $$;

select cron.schedule(
  'zapflow_event_retention',
  '17 3 * * *',
  $cron$
    delete from public.whatsapp_session_events
    where created_at < now() - interval '30 days';
  $cron$
);
