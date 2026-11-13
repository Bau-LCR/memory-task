-- Memory Task: recuperación del administrador principal, asistente IA y datos de servicio.
-- Esta migración vuelve a sembrar el rol principal por UUID exacto (idempotente).
-- Las tablas IA son privadas por usuario; el backend aplica los límites diarios.

insert into public.mt_user_roles (user_id, role, updated_at)
select id, 'super_admin', now()
from auth.users
where id = 'f4b4fc8e-88d2-41d2-9b44-fa9ee19d2836'::uuid
on conflict (user_id) do update
set role = 'super_admin', updated_at = now();

create table if not exists public.mt_ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_day date not null default (timezone('utc', now()))::date,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_day)
);
alter table public.mt_ai_usage enable row level security;
revoke all on public.mt_ai_usage from anon, authenticated;
grant all on public.mt_ai_usage to service_role;

create table if not exists public.mt_ai_conversations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Nueva conversación' check (char_length(title) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mt_ai_conversations_owner_id_id_key unique (owner_id, id)
);
create table if not exists public.mt_ai_messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  conversation_id uuid not null,
  role text not null check (role in ('user','assistant')),
  content text not null check (char_length(content) between 1 and 20000),
  created_at timestamptz not null default now(),
  constraint mt_ai_messages_conversation_owner_fk
    foreign key (owner_id, conversation_id)
    references public.mt_ai_conversations(owner_id, id) on delete cascade
);
create index if not exists mt_ai_conversations_owner_updated_idx
  on public.mt_ai_conversations(owner_id, updated_at desc);
create index if not exists mt_ai_messages_conversation_created_idx
  on public.mt_ai_messages(conversation_id, created_at);
alter table public.mt_ai_conversations enable row level security;
alter table public.mt_ai_messages enable row level security;
drop policy if exists mt_ai_conversations_select_own on public.mt_ai_conversations;
create policy mt_ai_conversations_select_own on public.mt_ai_conversations
  for select to authenticated using (owner_id = (select auth.uid()));
drop policy if exists mt_ai_conversations_insert_own on public.mt_ai_conversations;
create policy mt_ai_conversations_insert_own on public.mt_ai_conversations
  for insert to authenticated with check (owner_id = (select auth.uid()));
drop policy if exists mt_ai_conversations_update_own on public.mt_ai_conversations;
create policy mt_ai_conversations_update_own on public.mt_ai_conversations
  for update to authenticated using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
drop policy if exists mt_ai_conversations_delete_own on public.mt_ai_conversations;
create policy mt_ai_conversations_delete_own on public.mt_ai_conversations
  for delete to authenticated using (owner_id = (select auth.uid()));
drop policy if exists mt_ai_messages_select_own on public.mt_ai_messages;
create policy mt_ai_messages_select_own on public.mt_ai_messages
  for select to authenticated using (owner_id = (select auth.uid()));
drop policy if exists mt_ai_messages_insert_own on public.mt_ai_messages;
create policy mt_ai_messages_insert_own on public.mt_ai_messages
  for insert to authenticated with check (owner_id = (select auth.uid()));
drop policy if exists mt_ai_messages_delete_own on public.mt_ai_messages;
create policy mt_ai_messages_delete_own on public.mt_ai_messages
  for delete to authenticated using (owner_id = (select auth.uid()));
revoke all on public.mt_ai_conversations, public.mt_ai_messages from anon;
grant select, insert, update, delete on public.mt_ai_conversations to authenticated;
grant select, insert, delete on public.mt_ai_messages to authenticated;

-- Permite al usuario autenticado administrar su propia cuota personal.
create or replace function public.mt_set_my_personal_quota(p_quota_bytes bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_used bigint;
begin
  if v_user_id is null then
    raise exception 'Se requiere una sesión autenticada.' using errcode = '28000';
  end if;
  if p_quota_bytes < 52428800 or p_quota_bytes > 5368709120 then
    raise exception 'La cuota debe estar entre 50 MiB y 5 GiB.' using errcode = '22023';
  end if;
  select coalesce(sum(size_bytes), 0) into v_used
    from public.mt_files where owner_id = v_user_id;
  if p_quota_bytes < v_used then
    raise exception 'La cuota no puede ser menor que el espacio utilizado.' using errcode = '22023';
  end if;
  insert into public.mt_user_storage_quotas(user_id, quota_bytes, updated_at)
    values (v_user_id, p_quota_bytes, now())
  on conflict (user_id) do update
    set quota_bytes = excluded.quota_bytes, updated_at = now(), updated_by = null;
  return p_quota_bytes;
end;
$$;
revoke all on function public.mt_set_my_personal_quota(bigint) from public, anon;
grant execute on function public.mt_set_my_personal_quota(bigint) to authenticated, service_role;

create or replace function public.mt_consume_ai_request(p_user_id uuid, p_daily_limit integer default 20)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  insert into public.mt_ai_usage(user_id, usage_day, request_count, updated_at)
    values (p_user_id, (timezone('utc', now()))::date, 1, now())
  on conflict (user_id, usage_day) do update
    set request_count = public.mt_ai_usage.request_count + 1,
        updated_at = now()
    where public.mt_ai_usage.request_count < p_daily_limit
  returning request_count into v_count;
  if v_count is null then
    raise exception 'Se alcanzó el límite diario del asistente (% solicitudes).', p_daily_limit
      using errcode = 'P0001';
  end if;
  return v_count;
end;
$$;
revoke all on function public.mt_consume_ai_request(uuid, integer) from public, anon, authenticated;
grant execute on function public.mt_consume_ai_request(uuid, integer) to service_role;

-- Aplicar la cuota personal también al propio bucket, no solo al registro mt_files.
-- Reemplaza la política permisiva anterior para impedir cargas directas que la omitan.
drop policy if exists "mt_storage_insert_own" on storage.objects;
create policy "mt_storage_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'memory-task-private'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and public.mt_storage_object_within_personal_quota(name, metadata)
  );
