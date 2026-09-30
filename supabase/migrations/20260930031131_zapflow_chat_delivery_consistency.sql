CREATE OR REPLACE FUNCTION public.zapflow_ingest_chat_message(p_organization_id uuid, p_secret text, p_instance_name text, p_event text, p_payload jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault'
AS $function$
declare
  v_expected text;
  v_account_id uuid;
  v_provider_id text;
  v_remote_jid text;
  v_phone_jid text;
  v_phone text;
  v_from_me boolean;
  v_direction text;
  v_name text;
  v_text text;
  v_type text;
  v_preview text;
  v_mime text;
  v_seconds integer;
  v_thread_id uuid;
  v_sent_at timestamptz;
  v_ts text;
  v_event text := upper(replace(replace(coalesce(p_event,''),'.','_'),'-','_'));
begin
  if v_event <> 'MESSAGES_UPSERT' then
    return false;
  end if;

  if p_secret is null or length(p_secret) < 32 then
    return false;
  end if;

  select decrypted_secret into v_expected
  from vault.decrypted_secrets
  where name='zapflow:evolution:webhook:'||p_organization_id::text
  limit 1;

  if v_expected is null or v_expected <> p_secret then
    return false;
  end if;

  select id into v_account_id
  from public.whatsapp_accounts
  where organization_id=p_organization_id
    and session_id=p_instance_name
  limit 1;

  if v_account_id is null then
    return false;
  end if;

  v_provider_id := nullif(p_payload#>>'{data,key,id}','');
  v_remote_jid := nullif(p_payload#>>'{data,key,remoteJid}','');
  v_phone_jid := coalesce(
    nullif(p_payload#>>'{data,key,remoteJidAlt}',''),
    v_remote_jid
  );

  if v_provider_id is null or v_phone_jid is null then
    return false;
  end if;

  if v_phone_jid like '%@g.us' or v_phone_jid like '%@broadcast' or v_phone_jid='status@broadcast' then
    return false;
  end if;

  v_phone := regexp_replace(split_part(v_phone_jid,'@',1),'[^0-9]','','g');
  if v_phone !~ '^[0-9]{8,15}$' then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':' || p_instance_name || ':' || v_provider_id, 0));

  if exists (
    select 1
    from public.zapflow_chat_messages
    where organization_id=p_organization_id
      and session_id=p_instance_name
      and provider_message_id=v_provider_id
  ) then
    return true;
  end if;

  v_from_me := lower(coalesce(p_payload#>>'{data,key,fromMe}','false')) in ('true','1','t','yes');
  v_direction := case when v_from_me then 'OUT' else 'IN' end;
  v_name := nullif(trim(coalesce(
    p_payload#>>'{data,pushName}',
    p_payload#>>'{data,notifyName}',
    p_payload#>>'{data,verifiedBizName}',
    ''
  )),'');

  if v_from_me then v_name := null; end if;

  v_text := nullif(trim(coalesce(
    p_payload#>>'{data,message,conversation}',
    p_payload#>>'{data,message,extendedTextMessage,text}',
    p_payload#>>'{data,message,imageMessage,caption}',
    p_payload#>>'{data,message,videoMessage,caption}',
    p_payload#>>'{data,message,documentMessage,caption}',
    ''
  )),'');

  v_type := case
    when p_payload#>'{data,message,audioMessage}' is not null then 'AUDIO'
    when p_payload#>'{data,message,imageMessage}' is not null then 'IMAGE'
    when p_payload#>'{data,message,videoMessage}' is not null then 'VIDEO'
    when p_payload#>'{data,message,documentMessage}' is not null then 'DOCUMENT'
    when v_text is not null then 'TEXT'
    else 'OTHER'
  end;

  v_mime := coalesce(
    nullif(p_payload#>>'{data,message,audioMessage,mimetype}',''),
    nullif(p_payload#>>'{data,message,imageMessage,mimetype}',''),
    nullif(p_payload#>>'{data,message,videoMessage,mimetype}',''),
    nullif(p_payload#>>'{data,message,documentMessage,mimetype}','')
  );

  begin
    v_seconds := nullif(p_payload#>>'{data,message,audioMessage,seconds}','')::integer;
  exception when others then
    v_seconds := null;
  end;

  v_preview := left(coalesce(
    v_text,
    case v_type
      when 'AUDIO' then '🎤 Áudio'
      when 'IMAGE' then '🖼️ Imagem'
      when 'VIDEO' then '🎥 Vídeo'
      when 'DOCUMENT' then '📎 Documento'
      else 'Mensagem'
    end
  ),240);

  v_ts := coalesce(
    nullif(p_payload#>>'{data,messageTimestamp}',''),
    nullif(p_payload->>'messageTimestamp','')
  );
  begin
    if v_ts ~ '^[0-9]+([.][0-9]+)?$' then
      v_sent_at := to_timestamp(v_ts::double precision);
    else
      v_sent_at := now();
    end if;
  exception when others then
    v_sent_at := now();
  end;

  insert into public.zapflow_chat_threads(
    organization_id,whatsapp_account_id,session_id,contact_phone,contact_name,
    remote_jid,last_message_preview,last_message_at,last_direction,unread_count,updated_at
  )
  values(
    p_organization_id,v_account_id,p_instance_name,v_phone,v_name,
    v_remote_jid,v_preview,v_sent_at,v_direction,
    case when v_direction='IN' then 1 else 0 end,now()
  )
  on conflict (organization_id,whatsapp_account_id,contact_phone)
  do update set
    contact_name=coalesce(excluded.contact_name,zapflow_chat_threads.contact_name),
    remote_jid=coalesce(excluded.remote_jid,zapflow_chat_threads.remote_jid),
    last_message_preview=case when excluded.last_message_at >= zapflow_chat_threads.last_message_at then excluded.last_message_preview else zapflow_chat_threads.last_message_preview end,
    last_message_at=greatest(zapflow_chat_threads.last_message_at,excluded.last_message_at),
    last_direction=case when excluded.last_message_at >= zapflow_chat_threads.last_message_at then excluded.last_direction else zapflow_chat_threads.last_direction end,
    unread_count=zapflow_chat_threads.unread_count + case when excluded.last_direction='IN' then 1 else 0 end,
    updated_at=now()
  returning id into v_thread_id;

  insert into public.zapflow_chat_messages(
    organization_id,thread_id,whatsapp_account_id,session_id,
    provider_message_id,remote_jid,direction,message_type,text_content,
    mime_type,media_seconds,status,sent_at
  )
  values(
    p_organization_id,v_thread_id,v_account_id,p_instance_name,
    v_provider_id,coalesce(v_remote_jid,v_phone_jid),v_direction,v_type,v_text,
    v_mime,v_seconds,
    case when v_direction='IN' then 'RECEIVED' else 'SENT' end,
    v_sent_at
  )
  on conflict (organization_id,session_id,provider_message_id) do nothing;

  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ingest_evolution_webhook(p_organization_id uuid, p_secret text, p_instance_name text, p_event text, p_payload jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault'
AS $function$
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
  v_event text := upper(replace(replace(coalesce(p_event,''),'.','_'),'-','_'));
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

  if v_event like 'MESSAGES_%' then
    v_event_payload:=jsonb_strip_nulls(jsonb_build_object(
      'messageId', p_payload#>>'{data,key,id}',
      'fromMe', p_payload#>>'{data,key,fromMe}',
      'remoteJid', coalesce(
        nullif(p_payload#>>'{data,key,remoteJidAlt}',''),
        nullif(p_payload#>>'{data,key,remoteJid}','')
      ),
      'status', p_payload#>>'{data,status}'
    ));
  elsif v_event like '%CONNECTION%' then
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

  if v_event like '%CONNECTION%' then
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

    v_phone := regexp_replace(split_part(split_part(coalesce(
      p_payload#>>'{data,instance,ownerJid}', p_payload#>>'{data,ownerJid}',
      p_payload->>'sender', ''), '@', 1), ':', 1), '[^0-9]', '', 'g');
    update public.whatsapp_accounts
    set phone=case when v_normalized='CONNECTED' and v_phone ~ '^[0-9]{8,15}$' then v_phone else phone end,
        session_status=v_normalized,
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

  if v_event='MESSAGES_UPSERT' then
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
$function$
;
