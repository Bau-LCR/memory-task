-- Actualiza el límite diario del Asistente IA a 15 consultas por usuario.
create or replace function public.mt_consume_ai_request(
  p_user_id uuid,
  p_daily_limit integer default 15
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_daily_limit < 1 or p_daily_limit > 15 then
    raise exception 'El límite diario permitido es de hasta 15 consultas.'
      using errcode = '22023';
  end if;

  insert into public.mt_ai_usage(user_id, usage_day, request_count, updated_at)
    values (p_user_id, (timezone('utc', now()))::date, 1, now())
  on conflict (user_id, usage_day) do update
    set request_count = public.mt_ai_usage.request_count + 1,
        updated_at = now()
    where public.mt_ai_usage.request_count < p_daily_limit
  returning request_count into v_count;

  if v_count is null then
    raise exception 'Se alcanzó el límite diario del asistente (% solicitudes).', p_daily_limit
      using errcode = 'P0001';
  end if;

  return v_count;
end;
$$;

revoke all on function public.mt_consume_ai_request(uuid, integer) from public, anon, authenticated;
grant execute on function public.mt_consume_ai_request(uuid, integer) to service_role;
