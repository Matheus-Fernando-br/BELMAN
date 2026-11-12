-- Bellman Studio · Fase 3 · Vendas (CRM, funil, contratos, campanhas).

do $$ begin create type public.lead_stage as enum ('new', 'qualification', 'presentation', 'proposal', 'negotiation', 'won', 'lost'); exception when duplicate_object then null; end $$;
do $$ begin create type public.contract_cycle as enum ('monthly', 'yearly', 'one_time'); exception when duplicate_object then null; end $$;
do $$ begin create type public.contract_status as enum ('active', 'canceled', 'ended'); exception when duplicate_object then null; end $$;

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities (id), -- produto de interesse
  company text,
  contact_name text not null check (char_length(contact_name) between 2 and 120),
  email text,
  phone text,
  source text not null default 'outro', -- instagram, indicação, site, anúncio, parceria, evento, outro
  stage public.lead_stage not null default 'new',
  value_cents bigint not null default 0 check (value_cents >= 0), -- valor mensal esperado
  owner_id uuid references public.profiles (id) on delete set null,
  next_step text,
  next_step_date date,
  lost_reason text,
  customer_id uuid references public.customers (id) on delete set null,
  campaign_id uuid,
  stage_changed_at timestamptz not null default now(),
  won_at timestamptz,
  lost_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
create index if not exists leads_stage_idx on public.leads (entity_id, stage);

create table if not exists public.lead_interactions (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities (id),
  lead_id uuid not null references public.leads (id) on delete cascade,
  kind text not null default 'nota', -- ligação, e-mail, whatsapp, reunião, demonstração, nota
  summary text not null check (char_length(summary) between 2 and 2000),
  happened_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities (id),
  customer_id uuid not null references public.customers (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete set null,
  plan text not null,
  value_cents bigint not null check (value_cents > 0),
  cycle public.contract_cycle not null default 'monthly',
  start_date date not null default current_date,
  renewal_date date,
  end_date date,
  status public.contract_status not null default 'active',
  canceled_at date,
  cancel_reason text,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities (id),
  name text not null check (char_length(name) between 2 and 120),
  channel text not null default 'instagram', -- instagram, anúncio pago, indicação, parceria, e-mail, evento, outro
  status text not null default 'active' check (status in ('planned', 'active', 'done')),
  budget_cents bigint not null default 0,
  start_date date,
  end_date date,
  goal text,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
alter table public.leads drop constraint if exists leads_campaign_fk;
alter table public.leads add constraint leads_campaign_fk foreign key (campaign_id) references public.campaigns (id) on delete set null;

create or replace function studio.lead_stage_stamp() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.stage is distinct from old.stage then
    new.stage_changed_at := now();
    if new.stage = 'won' then new.won_at := coalesce(new.won_at, now()); end if;
    if new.stage = 'lost' then new.lost_at := coalesce(new.lost_at, now()); end if;
  end if;
  return new;
end $$;
drop trigger if exists leads_stage on public.leads;
create trigger leads_stage before insert or update on public.leads for each row execute function studio.lead_stage_stamp();

do $$
declare t text;
begin
  foreach t in array array['leads', 'lead_interactions', 'contracts', 'campaigns'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (studio.can_see_entity(entity_id))', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (studio.can_write() and studio.can_see_entity(entity_id))', t || '_write', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update to authenticated using (studio.can_write() and studio.can_see_entity(entity_id)) with check (studio.can_write() and studio.can_see_entity(entity_id))', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for delete to authenticated using (studio.can_write() and studio.can_see_entity(entity_id))', t || '_delete', t);
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function studio.audit()', t || '_audit', t);
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function studio.touch_updated_at()', t || '_touch', t);
  end loop;
end $$;

-- Venda concluída: cliente (Operações) + contrato (Vendas) + contas a receber (Financeiro),
-- tudo numa transação. Roda com privilégio do dono para gerar o financeiro, mas confere
-- antes que quem chama pode escrever e enxerga a Entidade do lead.
create or replace function public.studio_win_lead(
  p_lead_id uuid, p_plan text, p_value_cents bigint, p_cycle public.contract_cycle,
  p_start date default current_date, p_months int default 12
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  l public.leads;
  cust uuid;
  contr uuid;
  cat uuid;
  n int;
  i int;
begin
  select * into l from public.leads where id = p_lead_id for update;
  if l.id is null then raise exception 'Lead não encontrado.' using errcode = 'P0002'; end if;
  if not (studio.can_write() and studio.can_see_entity(l.entity_id)) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if p_value_cents is null or p_value_cents <= 0 then raise exception 'Valor inválido.' using errcode = '22023'; end if;
  if l.stage = 'won' and l.customer_id is not null then return l.customer_id; end if;

  insert into public.customers (entity_id, name, contact_name, email, phone, status, plan, mrr_cents, started_at, notes, created_by)
  values (l.entity_id, coalesce(nullif(l.company, ''), l.contact_name), l.contact_name, l.email, l.phone, 'onboarding', p_plan,
          case p_cycle when 'monthly' then p_value_cents when 'yearly' then round(p_value_cents / 12.0) else 0 end,
          p_start, 'Criado a partir de venda no CRM.', auth.uid())
  returning id into cust;

  insert into public.contracts (entity_id, customer_id, lead_id, plan, value_cents, cycle, start_date, renewal_date, created_by)
  values (l.entity_id, cust, l.id, p_plan, p_value_cents, p_cycle, p_start,
          case p_cycle when 'monthly' then (p_start + interval '1 year')::date when 'yearly' then (p_start + interval '1 year')::date else null end,
          auth.uid())
  returning id into contr;

  select id into cat from public.fin_categories where type = 'income' and name = 'Assinaturas';
  n := case p_cycle when 'monthly' then greatest(1, least(p_months, 24)) else 1 end;
  for i in 0 .. n - 1 loop
    insert into public.fin_transactions (entity_id, type, description, category_id, amount_cents, due_date, source, external_ref, created_by)
    values (l.entity_id, 'income',
            left(format('%s · %s%s', coalesce(nullif(l.company, ''), l.contact_name), p_plan, case when n > 1 then format(' (%s/%s)', i + 1, n) else '' end), 140),
            cat, p_value_cents, (p_start + make_interval(months => i))::date, 'contract',
            format('contract:%s:%s', contr, i), auth.uid());
  end loop;

  update public.leads set stage = 'won', customer_id = cust where id = l.id;

  insert into public.onboarding_runs (entity_id, customer_id, template_id, items, created_by)
  select l.entity_id, cust, t.id, (select coalesce(jsonb_agg(jsonb_build_object('label', x, 'done', false)), '[]') from unnest(t.items) x), auth.uid()
  from public.onboarding_templates t where t.entity_id = l.entity_id order by t.created_at limit 1;

  return cust;
end $$;
revoke all on function public.studio_win_lead(uuid, text, bigint, public.contract_cycle, date, int) from public, anon;
grant execute on function public.studio_win_lead(uuid, text, bigint, public.contract_cycle, date, int) to authenticated;
