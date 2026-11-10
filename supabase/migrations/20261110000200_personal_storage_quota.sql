-- Memory Task: cuota real de almacenamiento personal.
-- La cuota se comprueba en PostgreSQL para evitar que el cliente pueda saltársela.
-- Cuenta personal: 50 MiB por usuario. La cuota de servicio será independiente y
-- se aplicará en sus propias tablas/backend cuando se habilite esa modalidad.
--
-- El límite máximo por archivo se configura en el bucket desde Supabase Storage.
-- No modificamos storage.buckets desde aquí porque esa tabla es propiedad interna
-- del servicio de Storage y el rol del SQL Editor no tiene permiso para alterarla.

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
  -- Serializa escrituras simultáneas del mismo usuario para que no excedan
  -- la cuota por dos subidas concurrentes.
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
on public.mt_folders (owner_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));


-- Control adicional sobre los objetos binarios: evita que un cliente autenticado
-- suba objetos directamente al bucket sin crear la fila mt_files correspondiente.
create or replace function public.mt_enforce_personal_storage_object_quota()
returns trigger
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
  if new.bucket_id <> 'memory-task-private' then
    return new;
  end if;

  owner_folder := (storage.foldername(new.name))[1];
  if owner_folder is null then
    raise exception 'Ruta de almacenamiento inválida.'
      using errcode = 'check_violation';
  end if;

  if coalesce(new.metadata->>'size', '') !~ '^[0-9]+$' then
    raise exception 'No se pudo verificar el tamaño del archivo.'
      using errcode = 'check_violation';
  end if;
  object_size := (new.metadata->>'size')::bigint;

  perform pg_advisory_xact_lock(hashtextextended(owner_folder, 0));

  select coalesce(sum((metadata->>'size')::bigint), 0)
    into used_bytes
    from storage.objects
   where bucket_id = 'memory-task-private'
     and (storage.foldername(name))[1] = owner_folder
     and name <> new.name
     and coalesce(metadata->>'size', '') ~ '^[0-9]+$';

  if used_bytes + object_size > quota_bytes then
    raise exception 'Se alcanzó la cuota personal de almacenamiento de 50 MB.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists mt_storage_enforce_personal_quota on storage.objects;
create trigger mt_storage_enforce_personal_quota
before insert or update on storage.objects
for each row
execute function public.mt_enforce_personal_storage_object_quota();
