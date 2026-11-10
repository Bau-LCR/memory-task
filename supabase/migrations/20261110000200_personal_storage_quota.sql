-- Memory Task: cuota real de almacenamiento personal.
-- La cuota se comprueba en PostgreSQL para evitar que el cliente pueda saltársela.
-- Cuenta personal: 50 MiB por usuario. La cuota de servicio será independiente y
-- se aplicará en sus propias tablas/backend cuando se habilite esa modalidad.

alter table storage.buckets
  alter column file_size_limit set default 52428800;

update storage.buckets
set file_size_limit = 52428800
where id = 'memory-task-private';

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
