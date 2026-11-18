-- STUDIO MANU LIMA | Correção opcional da função de rendimentos
-- Execute SOMENTE se a função get_staff_performance não existir no Supabase
-- do seu site ou se você ainda não tiver publicado essa parte do schema.sql.
-- Este script não apaga atendimentos, serviços, funcionários ou avaliações.
-- Requer as tabelas já existentes e a função public.is_admin() do projeto.

create or replace function public.get_staff_performance() returns table(profissional_id uuid,nome text,tipo text,atendimentos_concluidos bigint,rendimento_bruto numeric,media_avaliacoes numeric,total_avaliacoes bigint) language plpgsql stable security definer set search_path=public as $$
begin
 if not public.is_admin() then raise exception 'Acesso restrito à administradora.'; end if;
 return query select p.id,p.nome,p.tipo,count(a.id) filter(where a.status='concluido'),coalesce(sum(s.preco) filter(where a.status='concluido'),0)::numeric(12,2),coalesce((select round(avg(r.nota)::numeric,1) from public.avaliacoes_funcionarios r where r.profissional_id=p.id),0),(select count(*) from public.avaliacoes_funcionarios r where r.profissional_id=p.id) from public.profissionais p left join public.agendamentos a on a.profissional_id=p.id left join public.servicos s on s.id=a.servico_id where p.tipo in ('admin','funcionario') group by p.id,p.nome,p.tipo,p.ordem order by count(a.id) filter(where a.status='concluido') desc,coalesce(sum(s.preco) filter(where a.status='concluido'),0) desc,p.nome;
end $$;
revoke all on function public.get_staff_performance() from public,anon;
grant execute on function public.get_staff_performance() to authenticated;
