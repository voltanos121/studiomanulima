-- MIGRAÇÃO INCREMENTAL PARA PROJETO COM O SCHEMA ANTERIOR
-- ==========================================================
-- EXTENSÃO: WhatsApp da equipe, avaliações e desempenho
-- Execute este bloco também como migração se o schema já existe.
-- ==========================================================
alter table public.profissionais add column if not exists whatsapp text, add column if not exists whatsapp_opt_in boolean not null default false;
alter table public.profissionais drop constraint if exists profissionais_whatsapp_digits_check;
alter table public.profissionais add constraint profissionais_whatsapp_digits_check check (whatsapp is null or whatsapp ~ '^[0-9]{10,15}$');
create table if not exists public.avaliacoes_funcionarios(id uuid primary key default gen_random_uuid(),agendamento_id uuid not null unique references public.agendamentos(id) on delete cascade,profissional_id uuid not null references public.profissionais(id) on delete cascade,nota integer not null check(nota between 1 and 5),comentario text check(comentario is null or length(comentario)<=500),created_at timestamptz not null default now());
create table if not exists public.whatsapp_notificacoes(id uuid primary key default gen_random_uuid(),agendamento_id uuid not null unique references public.agendamentos(id) on delete cascade,status text not null default 'pendente' check(status in ('pendente','enviado','ignorado','falhou')),mensagem_erro text,enviado_em timestamptz,created_at timestamptz not null default now());
alter table public.avaliacoes_funcionarios enable row level security; alter table public.whatsapp_notificacoes enable row level security;
drop policy if exists "admins read staff reviews" on public.avaliacoes_funcionarios;
create policy "admins read staff reviews" on public.avaliacoes_funcionarios for select to authenticated using(public.is_admin());
drop policy if exists "admins read whatsapp notification log" on public.whatsapp_notificacoes;
create policy "admins read whatsapp notification log" on public.whatsapp_notificacoes for select to authenticated using(public.is_admin());
grant select on public.avaliacoes_funcionarios,public.whatsapp_notificacoes to authenticated;
create or replace function public.get_public_staff() returns table(id uuid,nome text,tipo text,media_avaliacoes numeric,total_avaliacoes bigint) language sql stable security definer set search_path=public as $$ select p.id,p.nome,p.tipo,coalesce(round(avg(r.nota)::numeric,1),0),count(r.id) from public.profissionais p left join public.avaliacoes_funcionarios r on r.profissional_id=p.id where p.ativo=true group by p.id,p.nome,p.tipo,p.ordem order by p.ordem,p.nome $$;
revoke all on function public.get_public_staff() from public;
grant execute on function public.get_public_staff() to anon,authenticated;
create or replace function public.submit_staff_review(p_code text,p_phone text,p_rating integer,p_comment text default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_booking public.agendamentos%rowtype; v_staff_name text; v_phone text;
begin
 if p_rating is null or p_rating<1 or p_rating>5 then return jsonb_build_object('success',false,'message','A nota precisa ser de 1 a 5.'); end if;
 v_phone:=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
 select a.* into v_booking from public.agendamentos a join public.clientes c on c.id=a.cliente_id where upper(a.codigo)=upper(trim(coalesce(p_code,''))) and regexp_replace(c.telefone,'[^0-9]','','g')=v_phone;
 if not found then return jsonb_build_object('success',false,'message','Não encontramos uma reserva com esse código e WhatsApp.'); end if;
 if v_booking.status<>'concluido' then return jsonb_build_object('success',false,'message','A avaliação ficará disponível depois que o atendimento for marcado como concluído.'); end if;
 select nome into v_staff_name from public.profissionais where id=v_booking.profissional_id;
 insert into public.avaliacoes_funcionarios(agendamento_id,profissional_id,nota,comentario) values(v_booking.id,v_booking.profissional_id,p_rating,nullif(trim(coalesce(p_comment,'')),''));
 return jsonb_build_object('success',true,'profissional',v_staff_name);
exception when unique_violation then return jsonb_build_object('success',false,'message','Esta reserva já recebeu uma avaliação.'); end $$;
revoke all on function public.submit_staff_review(text,text,integer,text) from public;
grant execute on function public.submit_staff_review(text,text,integer,text) to anon,authenticated;
create or replace function public.get_staff_performance() returns table(profissional_id uuid,nome text,tipo text,atendimentos_concluidos bigint,rendimento_bruto numeric,media_avaliacoes numeric,total_avaliacoes bigint) language plpgsql stable security definer set search_path=public as $$
begin
 if not public.is_admin() then raise exception 'Acesso restrito à administradora.'; end if;
 return query select p.id,p.nome,p.tipo,count(a.id) filter(where a.status='concluido'),coalesce(sum(s.preco) filter(where a.status='concluido'),0)::numeric(12,2),coalesce((select round(avg(r.nota)::numeric,1) from public.avaliacoes_funcionarios r where r.profissional_id=p.id),0),(select count(*) from public.avaliacoes_funcionarios r where r.profissional_id=p.id) from public.profissionais p left join public.agendamentos a on a.profissional_id=p.id left join public.servicos s on s.id=a.servico_id where p.tipo in ('admin','funcionario') group by p.id,p.nome,p.tipo,p.ordem order by count(a.id) filter(where a.status='concluido') desc,coalesce(sum(s.preco) filter(where a.status='concluido'),0) desc,p.nome;
end $$;
revoke all on function public.get_staff_performance() from public,anon;
grant execute on function public.get_staff_performance() to authenticated;
revoke select on public.profissionais from anon;
grant select(id,nome,tipo,ativo,ordem,created_at) on public.profissionais to anon;
grant select on public.profissionais to authenticated;

drop policy if exists "staff read booked services" on public.servicos;
create policy "staff read booked services" on public.servicos for select to authenticated using(exists(select 1 from public.agendamentos a join public.profissionais p on p.id=a.profissional_id where a.servico_id=servicos.id and p.auth_user_id=auth.uid()));
