-- Cancelar contrato: contrato cancelado, cliente cancelado (churn) e recebíveis futuros
-- em aberto cancelados no Financeiro, numa transação.
create or replace function public.studio_cancel_contract(p_contract_id uuid, p_reason text default null, p_date date default current_date)
returns int language plpgsql security definer set search_path = '' as $$
declare k public.contracts; n int;
begin
  select * into k from public.contracts where id = p_contract_id for update;
  if k.id is null then raise exception 'Contrato não encontrado.' using errcode = 'P0002'; end if;
  if not (studio.can_write() and studio.can_see_entity(k.entity_id)) then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  update public.contracts set status = 'canceled', canceled_at = p_date, cancel_reason = left(p_reason, 300), end_date = p_date where id = k.id;
  update public.fin_transactions set cancelled = true, notes = 'Contrato cancelado em ' || to_char(p_date, 'DD/MM/YYYY')
    where external_ref like 'contract:' || k.id || ':%' and paid_date is null and due_date > p_date and not cancelled;
  get diagnostics n = row_count;
  if not exists (select 1 from public.contracts where customer_id = k.customer_id and status = 'active') then
    update public.customers set status = 'churned', churned_at = p_date, mrr_cents = 0 where id = k.customer_id;
  end if;
  return n;
end $$;
revoke all on function public.studio_cancel_contract(uuid, text, date) from public, anon;
grant execute on function public.studio_cancel_contract(uuid, text, date) to authenticated;
