-- Worker lock ownership hardening.
-- A job can only be finalized by the worker that currently owns its PROCESSING lock.

drop function if exists public.zapflow_finish_message_job_secure(
  uuid, boolean, text, text, timestamptz, text
);

create or replace function public.zapflow_finish_message_job_secure(
  p_job_id uuid,
  p_worker_id text,
  p_success boolean,
  p_provider_message_id text,
  p_error text,
  p_retry_at timestamptz,
  p_secret text
)
returns boolean
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
    and status='PROCESSING'
    and locked_by=p_worker_id
  for update;

  if v_campaign_id is null then
    return false;
  end if;

  if p_success then
    update public.zapflow_message_jobs
    set status='SENT',
        sent_at=now(),
        provider_message_id=p_provider_message_id,
        last_error=null,
        locked_at=null,
        locked_by=null,
        updated_at=now()
    where id=p_job_id
      and status='PROCESSING'
      and locked_by=p_worker_id;
  else
    v_final:=coalesce(v_attempts,0)>=coalesce(v_max_attempts,3);

    update public.zapflow_message_jobs
    set status=case when v_final then 'FAILED' else 'RETRY' end,
        next_attempt_at=case
          when v_final then next_attempt_at
          else coalesce(p_retry_at,now()+interval '2 minutes')
        end,
        last_error=left(coalesce(p_error,'Falha inesperada'),2000),
        locked_at=null,
        locked_by=null,
        updated_at=now()
    where id=p_job_id
      and status='PROCESSING'
      and locked_by=p_worker_id;
  end if;

  perform public.zapflow_refresh_campaign_counters(v_campaign_id);
  return true;
end;
$$;

revoke all on function public.zapflow_finish_message_job_secure(
  uuid,text,boolean,text,text,timestamptz,text
) from public,authenticated;

grant execute on function public.zapflow_finish_message_job_secure(
  uuid,text,boolean,text,text,timestamptz,text
) to anon;
