-- Memory Task: ampliar la cuota personal estándar a 500 MiB.
-- Supabase Free mantiene el límite técnico de 50 MiB por archivo.
-- La cuota es lógica: no amplía el almacenamiento físico del proyecto.

alter table public.mt_user_storage_quotas
  alter column quota_bytes set default 524288000;

-- Migrar cuotas estándar anteriores (50 MiB) a 500 MiB.
-- Se respetan cuotas personalizadas distintas del valor estándar anterior.
update public.mt_user_storage_quotas
   set quota_bytes = 524288000,
       updated_at = now()
 where quota_bytes = 52428800;

-- Los usuarios sin una fila personalizada reciben 500 MiB por defecto.
create or replace function public.mt_personal_quota_for(p_user_id uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $mt$
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'No autorizado para consultar la cuota de otro usuario.'
      using errcode = 'insufficient_privilege';
  end if;
  return coalesce(
    (select q.quota_bytes from public.mt_user_storage_quotas q where q.user_id = p_user_id),
    524288000::bigint
  );
end;
$mt$;
revoke all on function public.mt_personal_quota_for(uuid) from public, anon, authenticated;
grant execute on function public.mt_personal_quota_for(uuid) to authenticated, service_role;

-- Dejar explícito el máximo por archivo compatible con Supabase Free.
update storage.buckets
   set file_size_limit = 52428800
 where id = 'memory-task-private';
