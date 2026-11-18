-- Studio Manu Lima: confirmar, cancelar e concluir apenas os próprios atendimentos.
-- Migração incremental: executar APENAS este arquivo no SQL Editor do Supabase.
-- NÃO execute novamente schema.sql e NÃO conceda UPDATE direto à equipe.

create or replace function public.staff_update_booking_status(
  p_booking_id uuid,
  p_new_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff_id uuid;
  v_booking public.agendamentos%rowtype;
begin
  -- O Supabase identifica a conta a partir da sessão, não de um ID enviado pelo navegador.
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'message', 'Faça login novamente.');
  end if;

  -- Somente profissionais ATIVOS do tipo funcionário podem usar esta função.
  select p.id into v_staff_id
  from public.profissionais p
  where p.auth_user_id = auth.uid()
    and p.tipo = 'funcionario'
    and p.ativo is true
  limit 1;

  if v_staff_id is null then
    return jsonb_build_object('success', false, 'message', 'Seu perfil de funcionário está inativo ou não foi encontrado.');
  end if;

  if p_new_status is null or p_new_status not in ('confirmado', 'cancelado', 'concluido') then
    return jsonb_build_object('success', false, 'message', 'Status não permitido.');
  end if;

  -- Trava a reserva durante a atualização para impedir ações simultâneas conflitantes.
  -- A associação com v_staff_id impede modificar a agenda de outro profissional.
  select a.* into v_booking
  from public.agendamentos a
  where a.id = p_booking_id and a.profissional_id = v_staff_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'message', 'Agendamento não encontrado na sua agenda.');
  end if;

  -- O atendimento precisa ser confirmado antes de ser concluído.
  -- Agendamentos cancelados ou concluídos não podem ser reabertos pela equipe.
  if not (
    (v_booking.status = 'pendente' and p_new_status in ('confirmado', 'cancelado'))
    or (v_booking.status = 'confirmado' and p_new_status in ('cancelado', 'concluido'))
  ) then
    return jsonb_build_object('success', false, 'message',
      'Esta alteração não é permitida para o status atual. Atualize sua agenda.');
  end if;

  update public.agendamentos
  set status = p_new_status,
      updated_at = now()
  where id = v_booking.id;

  return jsonb_build_object('success', true, 'status', p_new_status);
end;
$$;

-- Funções PostgreSQL têm EXECUTE para PUBLIC por padrão: revoga e libera somente
-- usuários autenticados. A função exige uma conta de funcionário ativo.
revoke all on function public.staff_update_booking_status(uuid, text) from public, anon, authenticated;
grant execute on function public.staff_update_booking_status(uuid, text) to authenticated;

-- O RLS do esquema existente continua protegendo as consultas:
-- staff read own appointments = SELECT apenas dos próprios agendamentos.
-- admins manage bookings = administradora continua com todas as ações.
-- Não criar policy de UPDATE para funcionários: isso poderia permitir editar outros campos.

-- Solicita atualização do cache de funções da API Supabase/PostgREST.
notify pgrst, 'reload schema';
