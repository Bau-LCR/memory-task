-- Memory Task: roles administrativos y auditoría.
-- El rol principal se asigna exclusivamente al UUID inicial indicado por el propietario.
-- Las tablas no son accesibles directamente desde el navegador: admin-console valida cada acción.

create table if not exists public.mt_user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('super_admin', 'admin', 'user')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  granted_by uuid references auth.users(id) on delete set null
);

create table if not exists public.mt_admin_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete restrict,
  target_user_id uuid references auth.users(id) on delete set null,
  action text not null check (char_length(action) between 1 and 80),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists mt_user_roles_role_idx on public.mt_user_roles(role);
create index if not exists mt_admin_audit_created_idx on public.mt_admin_audit(created_at desc);
create index if not exists mt_admin_audit_target_idx on public.mt_admin_audit(target_user_id, created_at desc);

alter table public.mt_user_roles enable row level security;
alter table public.mt_admin_audit enable row level security;

revoke all on public.mt_user_roles, public.mt_admin_audit from anon, authenticated;
grant all on public.mt_user_roles, public.mt_admin_audit to service_role;

-- Promoción inicial: si el UUID no pertenece a un usuario de este proyecto,
-- no se inserta nada y la Edge Function informará que falta configurar el administrador.
insert into public.mt_user_roles (user_id, role)
select id, 'super_admin'
from auth.users
where id = 'f4b4fc8e-88d2-41d2-9b44-fa9ee19d2836'::uuid
on conflict (user_id) do update
set role = 'super_admin', updated_at = now();

comment on table public.mt_user_roles is
  'Roles de Memory Task. Acceso solo desde funciones de servidor.';
comment on table public.mt_admin_audit is
  'Registro inmutable de acciones administrativas ejecutadas desde el servidor.';
