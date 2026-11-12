-- Memory Task: consentimiento, cuotas administrables y categorías de servicio.
-- Las cuotas son límites lógicos dentro del almacenamiento disponible del proyecto;
-- aumentarlas no amplía por sí solo el plan ni el espacio físico de Supabase.

alter table public.mt_service_accounts
  drop constraint if exists mt_service_accounts_quota_bytes_check;
alter table public.mt_service_accounts
  add constraint mt_service_accounts_quota_bytes_check
  check (quota_bytes >= 52428800 and quota_bytes <= 5368709120);

alter table public.mt_service_objects
  add column if not exists object_category text not null default 'custom';
alter table public.mt_service_objects
  drop constraint if exists mt_service_objects_object_category_check;
alter table public.mt_service_objects
  add constraint mt_service_objects_object_category_check
  check (object_category in ('user','chat','document','image','custom'));

alter table public.mt_service_api_keys
  add column if not exists secret_hash_hex text;
update public.mt_service_api_keys
   set secret_hash_hex = encode(secret_hash, 'hex')
 where secret_hash_hex is null;
alter table public.mt_service_api_keys
  alter column secret_hash_hex set not null;
create unique index if not exists mt_service_api_keys_secret_hash_hex_key
  on public.mt_service_api_keys(secret_hash_hex);

create table if not exists public.mt_user_storage_quotas (
  user_id uuid primary key references auth.users(id) on delete cascade,
  quota_bytes bigint not null default 52428800
    check (quota_bytes >= 52428800 and quota_bytes <= 5368709120),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.mt_user_storage_quotas enable row level security;
revoke all on public.mt_user_storage_quotas from anon, authenticated;
grant all on public.mt_user_storage_quotas to service_role;

create or replace function public.mt_personal_quota_for(p_user_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'No autorizado para consultar la cuota de otro usuario.'
      using errcode = 'insufficient_privilege';
  end if;
  return coalesce(
    (select q.quota_bytes from public.mt_user_storage_quotas q where q.user_id = p_user_id),
    52428800::bigint
  );
end;
$;
revoke all on function public.mt_personal_quota_for(uuid) from public, anon, authenticated;
grant execute on function public.mt_personal_quota_for(uuid) to authenticated, service_role;

create or replace function public.mt_enforce_personal_storage_quota()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  used_bytes bigint;
  quota_bytes bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text, 0));
  quota_bytes := public.mt_personal_quota_for(new.owner_id);
  select coalesce(sum(size_bytes), 0)
    into used_bytes
    from public.mt_files
   where owner_id = new.owner_id and id <> new.id;
  if used_bytes + new.size_bytes > v_quota_bytes then
    raise exception 'Se alcanzó la cuota de almacenamiento personal configurada.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

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
  incoming_size text;
  object_size bigint;
  used_bytes bigint;
  quota_bytes bigint;
begin
  owner_folder := (storage.foldername(p_name))[1];
  if auth.uid() is null or owner_folder is null
     or owner_folder <> auth.uid()::text then
    return false;
  end if;

  incoming_size := coalesce(p_metadata->>'contentLength', p_metadata->>'size', '');
  if incoming_size !~ '^[0-9]+$' then return false; end if;
  object_size := incoming_size::bigint;
  quota_bytes := public.mt_personal_quota_for(auth.uid());

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

create or replace function public.mt_enforce_service_storage_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  used_bytes bigint;
  v_quota_bytes bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.account_id::text, 1));
  select a.quota_bytes into v_quota_bytes
    from public.mt_service_accounts a
   where a.id = new.account_id;
  if v_quota_bytes is null then
    raise exception 'No se encontró la cuenta de servicio.'
      using errcode = 'foreign_key_violation';
  end if;
  select coalesce(sum(size_bytes), 0)
    into used_bytes
    from public.mt_service_objects
   where account_id = new.account_id and id <> new.id;
  if used_bytes + new.size_bytes > quota_bytes then
    raise exception 'Se alcanzó la cuota compartida configurada para la cuenta de servicio.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke all on function public.mt_enforce_service_storage_quota() from public, anon, authenticated;
drop trigger if exists mt_service_objects_enforce_quota on public.mt_service_objects;
create trigger mt_service_objects_enforce_quota
before insert or update of account_id, size_bytes
on public.mt_service_objects
for each row execute function public.mt_enforce_service_storage_quota();

create table if not exists public.mt_service_audit (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.mt_service_accounts(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (char_length(action) between 1 and 80),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.mt_service_audit enable row level security;
revoke all on public.mt_service_audit from anon, authenticated;
grant all on public.mt_service_audit to service_role;
create index if not exists mt_service_audit_account_created_idx
  on public.mt_service_audit(account_id, created_at desc);

create table if not exists public.mt_legal_documents (
  document_type text not null check (document_type in ('terms','privacy')),
  version text not null,
  title text not null,
  content text not null,
  published_at timestamptz not null default now(),
  primary key (document_type, version)
);
create table if not exists public.mt_legal_acceptances (
  user_id uuid primary key references auth.users(id) on delete cascade,
  terms_version text not null,
  privacy_version text not null,
  accepted_at timestamptz not null default now()
);
alter table public.mt_legal_documents enable row level security;
alter table public.mt_legal_acceptances enable row level security;
revoke all on public.mt_legal_documents, public.mt_legal_acceptances from anon, authenticated;
grant all on public.mt_legal_documents, public.mt_legal_acceptances to service_role;

insert into public.mt_legal_documents(document_type,version,title,content)
values
('terms','1.0','Términos de uso',
'Memory Task permite almacenar y organizar información personal y conectar aplicaciones mediante cuentas de servicio. Debés usar el servicio de forma lícita, respetar derechos de terceros y no almacenar contenido que no tengas derecho a conservar. Las cuotas son límites técnicos sujetos al espacio real disponible del proveedor; no se garantiza disponibilidad ininterrumpida ni conservación indefinida. Mantené copias propias de la información importante. Los administradores autorizados de Memory Task pueden acceder a datos almacenados cuando sea necesario para soporte, seguridad, mantenimiento o cumplimiento de una solicitud válida. El acceso administrativo a contenidos se limita por permisos y queda registrado en auditoría. No se solicitarán ni utilizarán contraseñas de usuarios para acceder a sus datos. Las claves API son secretas y deben permanecer exclusivamente en servidores confiables. Los términos pueden cambiar; si cambia la versión, se solicitará una nueva aceptación antes de continuar usando las funciones protegidas.'),
('privacy','1.0','Aviso de privacidad',
'Memory Task procesa datos de cuenta, archivos, recuerdos, metadatos de uso y registros técnicos para prestar el servicio. La autenticación se realiza mediante el proveedor de identidad configurado. El contenido se almacena en infraestructura de Supabase en buckets privados y bases de datos con controles de acceso. El propietario de la plataforma y los administradores que reciban permisos pueden consultar datos personales cuando exista una finalidad operativa legítima, por ejemplo soporte solicitado, seguridad, investigación de incidentes o mantenimiento. Cada consulta administrativa de contenidos debe quedar registrada con actor, usuario afectado, acción y fecha. No se debe acceder a datos por curiosidad ni compartirlos fuera de la finalidad correspondiente. Los usuarios pueden solicitar información, exportación o eliminación de sus datos mediante los canales que publique el servicio. La política puede actualizarse y una nueva versión requerirá aceptación.')
on conflict (document_type,version) do nothing;

comment on table public.mt_legal_acceptances is
  'Aceptación de términos y aviso de privacidad por versión, asociada al usuario autenticado.';
