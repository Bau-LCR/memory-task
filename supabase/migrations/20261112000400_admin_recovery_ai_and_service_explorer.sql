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
