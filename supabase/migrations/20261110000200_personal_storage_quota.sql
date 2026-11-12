-- Memory Task: cuota real de almacenamiento personal.
-- Cuenta personal: 50 MiB por usuario. La cuota de servicio será independiente
-- y se implementará en las tablas/backend propios de esa modalidad.
--
-- No modificamos storage.buckets ni creamos triggers sobre tablas internas
-- de Storage: Supabase reserva la propiedad de esas tablas para su servicio.
-- La cuota de objetos se valida mediante una función usada por las políticas RLS.

create or replace function public.mt_enforce_personal_storage_quota()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  used_bytes bigint;
  quota_bytes constant bigint := 52428800;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text, 0));

  select coalesce(sum(size_bytes), 0)
    into used_bytes
    from public.mt_files
   where owner_id = new.owner_id
     and id <> new.id;

  if used_bytes + new.size_bytes > quota_bytes then
    raise exception 'Se alcanzó la cuota de almacenamiento personal de 50 MB.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists mt_files_enforce_personal_quota on public.mt_files;
create trigger mt_files_enforce_personal_quota
before insert or update of owner_id, size_bytes
on public.mt_files
for each row
execute function public.mt_enforce_personal_storage_quota();

-- Evita carpetas duplicadas con el mismo nombre dentro del mismo nivel.
create unique index if not exists mt_folders_unique_sibling_name
on public.mt_folders (
  owner_id,
  coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
  lower(name)
);

-- Comprueba la cuota total antes de permitir subir o reemplazar un objeto.
-- La función solo devuelve un booleano y solo acepta rutas del usuario actual.
create or replace function public.mt_storage_object_within_personal_quota(
  p_name text,
  p_metadata jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_folder text;
  object_size bigint;
  used_bytes bigint;
  quota_bytes constant bigint := 52428800;
begin
  owner_folder := (storage.foldername(p_name))[1];

  if auth.uid() is null or owner_folder is null
     or owner_folder <> auth.uid()::text then
    return false;
  end if;

  if coalesce(p_metadata->>'size', '') !~ '^[0-9]+$' then
    return false;
  end if;

  object_size := (p_metadata->>'size')::bigint;

  -- Serializa subidas simultáneas del mismo usuario.
  perform pg_advisory_xact_lock(hashtextextended(owner_folder, 0));

  select coalesce(sum((metadata->>'size')::bigint), 0)
    into used_bytes
    from storage.objects
   where bucket_id = 'memory-task-private'
     and (storage.foldername(name))[1] = owner_folder
     and name <> p_name
     and coalesce(metadata->>'size', '') ~ '^[0-9]+$';

  return used_bytes + object_size <= quota_bytes;
end;
$$;

revoke all on function public.mt_storage_object_within_personal_quota(text, jsonb) from public, anon;
grant execute on function public.mt_storage_object_within_personal_quota(text, jsonb) to authenticated;

-- Las políticas verifican propietario y cuota, tanto al subir como al reemplazar.
drop policy if exists "mt_storage_insert_own" on storage.objects;
create policy "mt_storage_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'memory-task-private'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and public.mt_storage_object_within_personal_quota(name, metadata)
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
    and public.mt_storage_object_within_personal_quota(name, metadata)
  );
