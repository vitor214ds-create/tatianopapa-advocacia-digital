create or replace function public.set_evolution_gateway_config(p_organization_id uuid, p_base_url text, p_api_key text)
returns void
language plpgsql
security definer
set search_path = public, vault, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_url_name text := 'zapflow:evolution:url:' || p_organization_id::text;
  v_key_name text := 'zapflow:evolution:key:' || p_organization_id::text;
  v_secret_id uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not exists (
    select 1 from public.organization_members
    where organization_id = p_organization_id
      and user_id = v_uid
      and role in ('OWNER','ADMIN')
  ) then raise exception 'forbidden'; end if;

  if p_base_url is null or p_base_url !~ '^https://[^[:space:]]+$' then
    raise exception 'Evolution URL must use HTTPS';
  end if;
  if p_api_key is null or length(trim(p_api_key)) < 20 then
    raise exception 'Evolution API key is too short';
  end if;

  select id into v_secret_id from vault.secrets where name = v_url_name limit 1;
  if v_secret_id is null then
    perform vault.create_secret(rtrim(p_base_url,'/'), v_url_name, 'ZapFlow Evolution API URL', null);
  else
    perform vault.update_secret(v_secret_id, rtrim(p_base_url,'/'), v_url_name, 'ZapFlow Evolution API URL', null);
  end if;

  v_secret_id := null;
  select id into v_secret_id from vault.secrets where name = v_key_name limit 1;
  if v_secret_id is null then
    perform vault.create_secret(trim(p_api_key), v_key_name, 'ZapFlow Evolution API key', null);
  else
    perform vault.update_secret(v_secret_id, trim(p_api_key), v_key_name, 'ZapFlow Evolution API key', null);
  end if;
end;
$$;

create or replace function public.get_evolution_gateway_config(p_organization_id uuid)
returns table(base_url text, api_key text)
language plpgsql
security definer
set search_path = public, vault, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_url_name text := 'zapflow:evolution:url:' || p_organization_id::text;
  v_key_name text := 'zapflow:evolution:key:' || p_organization_id::text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not exists (
    select 1 from public.organization_members
    where organization_id = p_organization_id
      and user_id = v_uid
      and role in ('OWNER','ADMIN')
  ) then raise exception 'forbidden'; end if;

  return query
  select
    (select decrypted_secret from vault.decrypted_secrets where name = v_url_name limit 1),
    (select decrypted_secret from vault.decrypted_secrets where name = v_key_name limit 1);
end;
$$;

revoke all on function public.set_evolution_gateway_config(uuid,text,text) from public;
revoke all on function public.get_evolution_gateway_config(uuid) from public;
grant execute on function public.set_evolution_gateway_config(uuid,text,text) to authenticated;
grant execute on function public.get_evolution_gateway_config(uuid) to authenticated;
