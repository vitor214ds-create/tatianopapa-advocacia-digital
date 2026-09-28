-- Optimize ZapFlow Chat foreign keys and RLS auth evaluation.

create index if not exists zapflow_chat_threads_whatsapp_account_id_idx
  on public.zapflow_chat_threads(whatsapp_account_id);

create index if not exists zapflow_chat_messages_whatsapp_account_id_idx
  on public.zapflow_chat_messages(whatsapp_account_id);

drop policy if exists zapflow_chat_threads_members_select on public.zapflow_chat_threads;
drop policy if exists zapflow_chat_threads_members_insert on public.zapflow_chat_threads;
drop policy if exists zapflow_chat_threads_members_update on public.zapflow_chat_threads;

create policy zapflow_chat_threads_members_select
on public.zapflow_chat_threads for select to authenticated
using (
  exists (
    select 1 from public.organization_members om
    where om.organization_id=zapflow_chat_threads.organization_id
      and om.user_id=(select auth.uid())
  )
);

create policy zapflow_chat_threads_members_insert
on public.zapflow_chat_threads for insert to authenticated
with check (
  exists (
    select 1 from public.organization_members om
    where om.organization_id=zapflow_chat_threads.organization_id
      and om.user_id=(select auth.uid())
  )
);

create policy zapflow_chat_threads_members_update
on public.zapflow_chat_threads for update to authenticated
using (
  exists (
    select 1 from public.organization_members om
    where om.organization_id=zapflow_chat_threads.organization_id
      and om.user_id=(select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.organization_members om
    where om.organization_id=zapflow_chat_threads.organization_id
      and om.user_id=(select auth.uid())
  )
);

drop policy if exists zapflow_chat_messages_members_select on public.zapflow_chat_messages;
drop policy if exists zapflow_chat_messages_members_insert on public.zapflow_chat_messages;
drop policy if exists zapflow_chat_messages_members_update on public.zapflow_chat_messages;

create policy zapflow_chat_messages_members_select
on public.zapflow_chat_messages for select to authenticated
using (
  exists (
    select 1 from public.organization_members om
    where om.organization_id=zapflow_chat_messages.organization_id
      and om.user_id=(select auth.uid())
  )
);

create policy zapflow_chat_messages_members_insert
on public.zapflow_chat_messages for insert to authenticated
with check (
  exists (
    select 1 from public.organization_members om
    where om.organization_id=zapflow_chat_messages.organization_id
      and om.user_id=(select auth.uid())
  )
);

create policy zapflow_chat_messages_members_update
on public.zapflow_chat_messages for update to authenticated
using (
  exists (
    select 1 from public.organization_members om
    where om.organization_id=zapflow_chat_messages.organization_id
      and om.user_id=(select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.organization_members om
    where om.organization_id=zapflow_chat_messages.organization_id
      and om.user_id=(select auth.uid())
  )
);
