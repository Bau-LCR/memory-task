-- Memory Task: almacenamiento personal privado en Supabase
-- Ejecutar una sola vez en Supabase Dashboard > SQL Editor.
-- Todas las tablas pertenecen al usuario autenticado; RLS impide el acceso cruzado.

create extension if not exists pgcrypto;

create table if not exists public.mt_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  parent_id uuid null,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  constraint mt_folders_parent_same_owner
    foreign key (parent_id, user_id) references public.mt_folders(id, user_id) on delete cascade,
  constraint mt_folders_no_self_parent check (parent_id is null or parent_id <> id)
);

create unique index if not exists mt_folders_unique_name_per_parent
  on public.mt_folders (user_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

create table if not exists public.mt_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  body text not null default '',
  category text not null default 'Recuerdo',
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mt_memory_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  memory_id uuid not null,
  title text not null,
  body text not null,
  saved_at timestamptz not null default now(),
  constraint mt_memory_versions_memory_same_owner
    foreign key (memory_id, user_id) references public.mt_memories(id, user_id) on delete cascade
);

alter table public.mt_memories add constraint mt_memories_id_user_unique unique (id, user_id);

create table if not exists public.mt_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  folder_id uuid null,
  object_path text not null unique,
  name text not null check (char_length(name) between 1 and 255),
  size_bytes bigint not null check (size_bytes >= 0),
  mime_type text not null default 'application/octet-stream',
  created_at timestamptz not null default now(),
  constraint mt_files_folder_same_owner
    foreign key (folder_id, user_id) references public.mt_folders(id, user_id) on delete set null
);

create index if not exists mt_memories_user_updated on public.mt_memories(user_id, updated_at desc);
create index if not exists mt_files_user_created on public.mt_files(user_id, created_at desc);
create index if not exists mt_memory_versions_user_memory on public.mt_memory_versions(user_id, memory_id, saved_at desc);

alter table public.mt_folders enable row level security;
alter table public.mt_memories enable row level security;
alter table public.mt_memory_versions enable row level security;
alter table public.mt_files enable row level security;

drop policy if exists "mt_folders_select_own" on public.mt_folders;
create policy "mt_folders_select_own" on public.mt_folders for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "mt_folders_insert_own" on public.mt_folders;
create policy "mt_folders_insert_own" on public.mt_folders for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "mt_folders_update_own" on public.mt_folders;
create policy "mt_folders_update_own" on public.mt_folders for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "mt_folders_delete_own" on public.mt_folders;
create policy "mt_folders_delete_own" on public.mt_folders for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists "mt_memories_select_own" on public.mt_memories;
create policy "mt_memories_select_own" on public.mt_memories for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "mt_memories_insert_own" on public.mt_memories;
create policy "mt_memories_insert_own" on public.mt_memories for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "mt_memories_update_own" on public.mt_memories;
create policy "mt_memories_update_own" on public.mt_memories for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "mt_memories_delete_own" on public.mt_memories;
create policy "mt_memories_delete_own" on public.mt_memories for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists "mt_memory_versions_select_own" on public.mt_memory_versions;
create policy "mt_memory_versions_select_own" on public.mt_memory_versions for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "mt_memory_versions_insert_own" on public.mt_memory_versions;
create policy "mt_memory_versions_insert_own" on public.mt_memory_versions for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "mt_memory_versions_delete_own" on public.mt_memory_versions;
create policy "mt_memory_versions_delete_own" on public.mt_memory_versions for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists "mt_files_select_own" on public.mt_files;
create policy "mt_files_select_own" on public.mt_files for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "mt_files_insert_own" on public.mt_files;
create policy "mt_files_insert_own" on public.mt_files for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "mt_files_update_own" on public.mt_files;
create policy "mt_files_update_own" on public.mt_files for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "mt_files_delete_own" on public.mt_files;
create policy "mt_files_delete_own" on public.mt_files for delete to authenticated using (user_id = (select auth.uid()));

-- Bucket privado. Los objetos se guardan en una carpeta raíz cuyo nombre es el UUID del usuario.
insert into storage.buckets (id, name, public)
values ('memory-task-private', 'memory-task-private', false)
on conflict (id) do update set public = false;

drop policy if exists "mt_storage_select_own" on storage.objects;
create policy "mt_storage_select_own" on storage.objects for select to authenticated
using (bucket_id = 'memory-task-private' and (storage.foldername(name))[1] = (select auth.uid()::text));
drop policy if exists "mt_storage_insert_own" on storage.objects;
create policy "mt_storage_insert_own" on storage.objects for insert to authenticated
with check (bucket_id = 'memory-task-private' and (storage.foldername(name))[1] = (select auth.uid()::text));
drop policy if exists "mt_storage_update_own" on storage.objects;
create policy "mt_storage_update_own" on storage.objects for update to authenticated
using (bucket_id = 'memory-task-private' and (storage.foldername(name))[1] = (select auth.uid()::text))
with check (bucket_id = 'memory-task-private' and (storage.foldername(name))[1] = (select auth.uid()::text));
drop policy if exists "mt_storage_delete_own" on storage.objects;
create policy "mt_storage_delete_own" on storage.objects for delete to authenticated
using (bucket_id = 'memory-task-private' and (storage.foldername(name))[1] = (select auth.uid()::text));

-- No se concede acceso a anon. RLS debe estar activa antes de otorgar permisos a authenticated.
grant select, insert, update, delete on public.mt_folders to authenticated;
grant select, insert, update, delete on public.mt_memories to authenticated;
grant select, insert, delete on public.mt_memory_versions to authenticated;
grant select, insert, update, delete on public.mt_files to authenticated;
