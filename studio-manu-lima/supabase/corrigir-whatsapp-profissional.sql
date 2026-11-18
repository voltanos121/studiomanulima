-- Studio Manu Lima | Correção do roteamento do WhatsApp por profissional
-- Execute SOMENTE este arquivo no SQL Editor do projeto Supabase já configurado.
-- Não recrie as tabelas nem execute o schema.sql completo.

-- Mantém a migração compatível caso as colunas ainda não estejam presentes.
alter table public.profissionais
  add column if not exists whatsapp text,
  add column if not exists whatsapp_opt_in boolean not null default false;

-- O público NÃO precisa ter acesso a todos os números das funcionárias.
-- Esta função retorna o contato apenas para uma reserva existente e validada,
-- vinculada à profissional escolhida e ao telefone informado pela cliente.
create or replace function public.get_booking_whatsapp(p_code text, p_phone text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_number text;
  v_opt_in boolean;
  v_type text;
  v_client_phone text;
begin
  if nullif(trim(coalesce(p_code, '')), '') is null
     or nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), '') is null then
    return jsonb_build_object('success', false, 'message', 'Informe o código e o telefone da reserva.');
  end if;

  select p.whatsapp, p.whatsapp_opt_in, p.tipo, c.telefone
    into v_number, v_opt_in, v_type, v_client_phone
  from public.agendamentos a
  join public.clientes c on c.id = a.cliente_id
  join public.profissionais p on p.id = a.profissional_id
  where upper(a.codigo) = upper(trim(p_code))
  limit 1;

  if not found or
     regexp_replace(coalesce(v_client_phone, ''), '[^0-9]', '', 'g') <>
     regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') then
    return jsonb_build_object('success', false, 'message', 'Reserva não encontrada ou telefone não confere.');
  end if;

  if v_type = 'admin' then
    -- Somente quando A ADMINISTRADORA foi a profissional escolhida,
    -- seu contato pode usar o WhatsApp público geral do estúdio.
    if nullif(regexp_replace(coalesce(v_number, ''), '[^0-9]', '', 'g'), '') is null then
      select whatsapp into v_number from public.configuracoes
      order by updated_at desc limit 1;
    end if;
  elsif v_opt_in is not true then
    return jsonb_build_object('success', false, 'message', 'A profissional ainda não autorizou contatos por WhatsApp.');
  end if;

  v_number := regexp_replace(coalesce(v_number, ''), '[^0-9]', '', 'g');
  if v_number !~ '^[0-9]{10,15}$' then
    return jsonb_build_object('success', false, 'message', 'A profissional está sem um WhatsApp válido cadastrado.');
  end if;

  return jsonb_build_object('success', true, 'whatsapp', v_number);
end;
$$;

revoke all on function public.get_booking_whatsapp(text,text) from public, anon, authenticated;
grant execute on function public.get_booking_whatsapp(text,text) to anon, authenticated;

-- Conferência administrativa (opcional):
-- select id, nome, tipo, whatsapp, whatsapp_opt_in from public.profissionais order by nome;
