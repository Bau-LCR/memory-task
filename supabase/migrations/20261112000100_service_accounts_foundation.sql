-- Memory Task: base segura para cuentas de servicio.
-- Las tablas quedan cerradas al cliente: solo Edge Functions de confianza
-- (usando SUPABASE_SERVICE_ROLE_KEY en el servidor) deben operar sobre ellas.
-- Cuota compartida: 50 MiB por cuenta de servicio, independiente de mt_files.

create table if not exists public.mt_service_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  quota_bytes bigint not null default 52428800 check (quota_bytes = 52428800),
  created_at timestamptz not null default now()
);

create table if not exists public.mt_service_apps (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.mt_service_accounts(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 300),
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mt_service_apps_account_id_id_key unique (account_id, id)
);

create table if not exists public.mt_service_api_keys (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  app_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  key_prefix text not null,
  secret_hash bytea not null unique,
  scopes text[] not null default array['records:read','records:write']::text[],
  status text not null default 'active' check (status in ('active', 'revoked')),
  last_used_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint mt_service_api_keys_app_owner_fk
    foreign key (account_id, app_id)
    references public.mt_service_apps(account_id, id) on delete cascade
);

create table if not exists public.mt_service_objects (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  app_id uuid not null,
  external_user_id text not null check (char_length(external_user_id) between 1 and 200),
  object_type text not null default 'record' check (object_type in ('record', 'file')),
  object_key text not null check (char_length(object_key) between 1 and 200),
  storage_path text,
  payload jsonb,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  content_type text not null default 'application/json',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mt_service_objects_app_owner_fk
    foreign key (account_id, app_id)
    references public.mt_service_apps(account_id, id) on delete cascade,
  constraint mt_service_objects_storage_path_check
    check (
      (object_type = 'record' and storage_path is null and payload is not null)
      or
      (object_type = 'file' and storage_path is not null and payload is null)
    ),
  constraint mt_service_objects_unique_key
    unique (app_id, external_user_id, object_key)
);

create index if not exists mt_service_apps_account_created_idx
  on public.mt_service_apps(account_id, created_at desc);
create index if not exists mt_service_api_keys_app_status_idx
  on public.mt_service_api_keys(app_id, status);
create index if not exists mt_service_objects_account_idx
  on public.mt_service_objects(account_id);
create index if not exists mt_service_objects_app_user_idx
  on public.mt_service_objects(app_id, external_user_id, updated_at desc);

alter table public.mt_service_accounts enable row level security;
alter table public.mt_service_apps enable row level security;
alter table public.mt_service_api_keys enable row level security;
alter table public.mt_service_objects enable row level security;

-- Sin políticas para anon/authenticated deliberadamente: el acceso pasa
-- exclusivamente por Edge Functions que validan la sesión o la API key.
revoke all on public.mt_service_accounts,
  public.mt_service_apps,
  public.mt_service_api_keys,
  public.mt_service_objects
from anon, authenticated;

-- Trigger transaccional: la cuota de 50 MiB se comparte entre todas las apps
-- de una cuenta de servicio. Serializa escrituras simultáneas por cuenta.
create or replace function public.mt_enforce_service_storage_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  used_bytes bigint;
  quota_bytes constant bigint := 52428800;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.account_id::text, 1));

  select coalesce(sum(size_bytes), 0)
    into used_bytes
    from public.mt_service_objects
   where account_id = new.account_id
     and id <> new.id;

  if used_bytes + new.size_bytes > quota_bytes then
    raise exception 'Se alcanzó la cuota compartida de servicio de 50 MiB.'
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

-- Bucket independiente y privado para archivos de aplicaciones externas.
insert into storage.buckets (id, name, public)
values ('memory-task-service-private', 'memory-task-service-private', false)
on conflict (id) do update set public = false;
