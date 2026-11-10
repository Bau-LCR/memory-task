-- Memory Task: almacenamiento privado inicial.
-- Ejecutar en Supabase SQL Editor sobre el proyecto correcto.
-- Cada fila pertenece a un usuario autenticado; RLS impide acceder a filas ajenas.
-- Los archivos binarios van en un bucket privado y su ruta empieza por el UUID del usuario.

create table if not exists public.mt_folders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  parent_id uuid,
  created_at timestamptz not null default now(),
  constraint mt_folders_owner_id_id_key unique (owner_id, id),
  constraint mt_folders_parent_same_owner_fk
    foreign key (owner_id, parent_id)
    references public.mt_folders (owner_id, id)
    on delete restrict
);

create table if not exists public.mt_memories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  body text not null default '',
  category text not null default 'Recuerdo',
  tags text[] not null default '{}',
  versions jsonb not null default '[]'::jsonb check (jsonb_typeof(versions) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mt_files (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  folder_id uuid,
  storage_path text not null unique,
  name text not null check (char_length(btrim(name)) between 1 and 255),
  size_bytes bigint not null check (size_bytes >= 0),
  content_type text not null default 'application/octet-stream',
  created_at timestamptz not null default now(),
  constraint mt_files_folder_same_owner_fk
    foreign key (owner_id, folder_id)
    references public.mt_folders (owner_id, id)
    on delete restrict,
  constraint mt_files_path_belongs_to_owner
    check (storage_path like owner_id::text || '/%')
);

create table if not exists public.mt_activity (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  description text not null check (char_length(description) <= 300),
  created_at timestamptz not null default now()
);

create index if not exists mt_folders_owner_parent_idx on public.mt_folders (owner_id, parent_id);
create index if not exists mt_memories_owner_updated_idx on public.mt_memories (owner_id, updated_at desc);
create index if not exists mt_files_owner_created_idx on public.mt_files (owner_id, created_at desc);
create index if not exists mt_activity_owner_created_idx on public.mt_activity (owner_id, created_at desc);

alter table public.mt_folders enable row level security;
alter table public.mt_memories enable row level security;
alter table public.mt_files enable row level security;
alter table public.mt_activity enable row level security;

drop policy if exists "mt_folders_select_own" on public.mt_folders;
create policy "mt_folders_select_own" on public.mt_folders
  for select to authenticated using (owner_id = (select auth.uid()));
drop policy if exists "mt_folders_insert_own" on public.mt_folders;
create policy "mt_folders_insert_own" on public.mt_folders
  for insert to authenticated with check (owner_id = (select auth.uid()));
drop policy if exists "mt_folders_update_own" on public.mt_folders;
create policy "mt_folders_update_own" on public.mt_folders
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
drop policy if exists "mt_folders_delete_own" on public.mt_folders;
create policy "mt_folders_delete_own" on public.mt_folders
  for delete to authenticated using (owner_id = (select auth.uid()));

drop policy if exists "mt_memories_select_own" on public.mt_memories;
create policy "mt_memories_select_own" on public.mt_memories
  for select to authenticated using (owner_id = (select auth.uid()));
drop policy if exists "mt_memories_insert_own" on public.mt_memories;
create policy "mt_memories_insert_own" on public.mt_memories
  for insert to authenticated with check (owner_id = (select auth.uid()));
drop policy if exists "mt_memories_update_own" on public.mt_memories;
create policy "mt_memories_update_own" on public.mt_memories
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
drop policy if exists "mt_memories_delete_own" on public.mt_memories;
create policy "mt_memories_delete_own" on public.mt_memories
  for delete to authenticated using (owner_id = (select auth.uid()));

drop policy if exists "mt_files_select_own" on public.mt_files;
create policy "mt_files_select_own" on public.mt_files
  for select to authenticated using (owner_id = (select auth.uid()));
drop policy if exists "mt_files_insert_own" on public.mt_files;
create policy "mt_files_insert_own" on public.mt_files
  for insert to authenticated with check (owner_id = (select auth.uid()));
drop policy if exists "mt_files_update_own" on public.mt_files;
create policy "mt_files_update_own" on public.mt_files
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
drop policy if exists "mt_files_delete_own" on public.mt_files;
create policy "mt_files_delete_own" on public.mt_files
  for delete to authenticated using (owner_id = (select auth.uid()));

drop policy if exists "mt_activity_select_own" on public.mt_activity;
create policy "mt_activity_select_own" on public.mt_activity
  for select to authenticated using (owner_id = (select auth.uid()));
drop policy if exists "mt_activity_insert_own" on public.mt_activity;
create policy "mt_activity_insert_own" on public.mt_activity
  for insert to authenticated with check (owner_id = (select auth.uid()));
drop policy if exists "mt_activity_delete_own" on public.mt_activity;
create policy "mt_activity_delete_own" on public.mt_activity
  for delete to authenticated using (owner_id = (select auth.uid()));

revoke all on public.mt_folders, public.mt_memories, public.mt_files, public.mt_activity from anon;
grant select, insert, update, delete on public.mt_folders, public.mt_memories, public.mt_files to authenticated;
grant select, insert, delete on public.mt_activity to authenticated;

-- Bucket privado: los objetos no se pueden leer solo con conocer su URL.
insert into storage.buckets (id, name, public)
values ('memory-task-private', 'memory-task-private', false)
on conflict (id) do update set public = false;

drop policy if exists "mt_storage_select_own" on storage.objects;
create policy "mt_storage_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'memory-task-private'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "mt_storage_insert_own" on storage.objects;
create policy "mt_storage_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'memory-task-private'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "mt_storage_update_own" on storage.objects;
create policy "mt_storage_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'memory-task-private'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'memory-task-private'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "mt_storage_delete_own" on storage.objects;
create policy "mt_storage_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'memory-task-private'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
