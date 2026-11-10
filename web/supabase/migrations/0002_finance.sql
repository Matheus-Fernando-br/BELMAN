-- Bellman Studio · Fase 1 · Financeiro.
-- Valores em centavos (bigint). Todo registro tem Entidade. Acesso: somente Sócio/Admin (studio.can_see_finance()).

do $$ begin create type public.fin_type as enum ('income', 'expense'); exception when duplicate_object then null; end $$;
do $$ begin create type public.fin_account_kind as enum ('bank', 'cash', 'wallet', 'card'); exception when duplicate_object then null; end $$;
do $$ begin create type public.fin_party_kind as enum ('customer', 'supplier', 'partner', 'other'); exception when duplicate_object then null; end $$;
do $$ begin create type public.fin_frequency as enum ('monthly', 'yearly'); exception when duplicate_object then null; end $$;
do $$ begin create type public.fin_contribution_kind as enum ('contribution', 'withdrawal'); exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- cadastros
create table if not exists public.fin_accounts (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities (id),
  name text not null check (char_length(name) between 2 and 60),
  kind public.fin_account_kind not null default 'bank',
  opening_balance_cents bigint not null default 0,
  opening_date date not null default current_date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create table if not exists public.fin_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 60),
  type public.fin_type not null,
  group_name text,
  is_fixed boolean not null default false, -- custo fixo (entra no ponto de equilíbrio)
  active boolean not null default true,
  sort_order int not null default 100,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  unique (type, name)
);

create table if not exists public.fin_counterparties (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  kind public.fin_party_kind not null default 'other',
  document text,
  email text,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

-- Rateio: um custo lançado em "Compartilhado" (ou em qualquer entidade) dividido por percentual.
create table if not exists public.fin_allocation_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 2 and 60),
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create table if not exists public.fin_allocation_shares (
  rule_id uuid not null references public.fin_allocation_rules (id) on delete cascade,
  entity_id uuid not null references public.entities (id),
  percent numeric(5, 2) not null check (percent > 0 and percent <= 100),
  primary key (rule_id, entity_id)
);

-- ---------------------------------------------------------------- recorrências
create table if not exists public.fin_recurrences (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities (id),
  type public.fin_type not null,
  description text not null check (char_length(description) between 2 and 140),
  category_id uuid references public.fin_categories (id),
  counterparty_id uuid references public.fin_counterparties (id),
  account_id uuid references public.fin_accounts (id),
  allocation_rule_id uuid references public.fin_allocation_rules (id),
  amount_cents bigint not null check (amount_cents > 0),
  frequency public.fin_frequency not null default 'monthly',
  day_of_month int not null default 5 check (day_of_month between 1 and 28),
  start_date date not null default current_date,
  end_date date,
  active boolean not null default true,
  is_infrastructure boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

-- ---------------------------------------------------------------- lançamentos
create table if not exists public.fin_transactions (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities (id),
  type public.fin_type not null,
  description text not null check (char_length(description) between 2 and 140),
  category_id uuid references public.fin_categories (id),
  counterparty_id uuid references public.fin_counterparties (id),
  account_id uuid references public.fin_accounts (id),
  allocation_rule_id uuid references public.fin_allocation_rules (id),
  recurrence_id uuid references public.fin_recurrences (id) on delete set null,
  amount_cents bigint not null check (amount_cents > 0),          -- previsto
  due_date date not null,                                          -- data prevista
  paid_amount_cents bigint check (paid_amount_cents is null or paid_amount_cents >= 0), -- realizado
  paid_date date,                                                  -- data realizada
  cancelled boolean not null default false,
  attachment_path text,
  notes text,
  source text not null default 'manual',
  external_ref text unique,                                        -- importações idempotentes
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  check ((paid_date is null) = (paid_amount_cents is null)),
  unique (recurrence_id, due_date)
);
create index if not exists fin_tx_due_idx on public.fin_transactions (due_date);
create index if not exists fin_tx_paid_idx on public.fin_transactions (paid_date);
create index if not exists fin_tx_entity_idx on public.fin_transactions (entity_id);

-- ---------------------------------------------------------------- orçamento e aportes
create table if not exists public.fin_budgets (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities (id),
  category_id uuid not null references public.fin_categories (id),
  month date not null check (extract(day from month) = 1),
  amount_cents bigint not null check (amount_cents >= 0),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  unique (entity_id, category_id, month)
);

create table if not exists public.fin_partner_contributions (
  id uuid primary key default gen_random_uuid(),
  partner_name text not null check (char_length(partner_name) between 2 and 80),
  entity_id uuid not null references public.entities (id),
  kind public.fin_contribution_kind not null default 'contribution',
  amount_cents bigint not null check (amount_cents > 0),
  date date not null default current_date,
  account_id uuid references public.fin_accounts (id),
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

-- Metas e premissas do planejamento (uma linha por entidade).
create table if not exists public.fin_targets (
  entity_id uuid primary key references public.entities (id),
  monthly_revenue_goal_cents bigint,
  margin_goal_percent numeric(5, 2),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

-- ---------------------------------------------------------------- regras de rateio somam 100%
create or replace function studio.check_allocation_total() returns trigger
language plpgsql set search_path = '' as $$
declare total numeric; rid uuid := coalesce(new.rule_id, old.rule_id);
begin
  select coalesce(sum(percent), 0) into total from public.fin_allocation_shares where rule_id = rid;
  if total > 100.001 then
    raise exception 'A soma do rateio passou de 100%% (%).', total using errcode = '23514';
  end if;
  return null;
end $$;
drop trigger if exists fin_allocation_total on public.fin_allocation_shares;
create constraint trigger fin_allocation_total after insert or update on public.fin_allocation_shares
  deferrable initially deferred for each row execute function studio.check_allocation_total();

-- ---------------------------------------------------------------- recorrência -> lançamentos previstos
create or replace function public.fin_generate_recurrences(p_until date default (date_trunc('month', current_date) + interval '6 months' - interval '1 day')::date)
returns int language plpgsql security invoker set search_path = '' as $$
declare r public.fin_recurrences; d date; n int := 0; step interval;
begin
  if not studio.can_see_finance() then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  for r in select * from public.fin_recurrences where active loop
    step := case r.frequency when 'monthly' then interval '1 month' else interval '1 year' end;
    d := make_date(extract(year from r.start_date)::int, extract(month from r.start_date)::int, r.day_of_month);
    if d < r.start_date then d := (d + step)::date; end if;
    while d <= p_until and (r.end_date is null or d <= r.end_date) loop
      insert into public.fin_transactions (entity_id, type, description, category_id, counterparty_id, account_id,
        allocation_rule_id, recurrence_id, amount_cents, due_date, source)
      values (r.entity_id, r.type, r.description, r.category_id, r.counterparty_id, r.account_id,
        r.allocation_rule_id, r.id, r.amount_cents, d, 'recurrence')
      on conflict (recurrence_id, due_date) do nothing;
      if found then n := n + 1; end if;
      d := (d + step)::date;
    end loop;
  end loop;
  return n;
end $$;
revoke all on function public.fin_generate_recurrences(date) from public, anon;
grant execute on function public.fin_generate_recurrences(date) to authenticated;

-- ---------------------------------------------------------------- views (respeitam RLS de quem consulta)
create or replace view public.fin_transactions_view with (security_invoker = true) as
select t.*,
  case
    when t.cancelled then 'cancelled'
    when t.paid_date is not null then 'paid'
    when t.due_date < (now() at time zone 'America/Sao_Paulo')::date then 'overdue'
    else 'planned'
  end as status,
  e.slug as entity_slug, e.name as entity_name, e.color as entity_color,
  c.name as category_name, cp.name as counterparty_name, a.name as account_name, ar.name as allocation_rule_name
from public.fin_transactions t
join public.entities e on e.id = t.entity_id
left join public.fin_categories c on c.id = t.category_id
left join public.fin_counterparties cp on cp.id = t.counterparty_id
left join public.fin_accounts a on a.id = t.account_id
left join public.fin_allocation_rules ar on ar.id = t.allocation_rule_id;

-- Cada lançamento distribuído para as entidades que o assumem (rateio aplicado).
create or replace view public.fin_allocated with (security_invoker = true) as
select t.id as transaction_id, t.type, t.category_id, t.cancelled, t.due_date, t.paid_date,
  coalesce(s.entity_id, t.entity_id) as entity_id,
  t.entity_id as origin_entity_id,
  (t.allocation_rule_id is not null and s.entity_id is not null) as allocated,
  round(t.amount_cents * coalesce(s.percent, 100) / 100.0)::bigint as amount_cents,
  case when t.paid_amount_cents is null then null
       else round(t.paid_amount_cents * coalesce(s.percent, 100) / 100.0)::bigint end as paid_amount_cents
from public.fin_transactions t
left join public.fin_allocation_shares s on s.rule_id = t.allocation_rule_id;

grant select on public.fin_transactions_view, public.fin_allocated to authenticated;
revoke all on public.fin_transactions_view, public.fin_allocated from anon;

-- ---------------------------------------------------------------- RLS, auditoria, updated_at
do $$
declare t text;
begin
  foreach t in array array['fin_accounts', 'fin_categories', 'fin_counterparties', 'fin_allocation_rules',
    'fin_allocation_shares', 'fin_recurrences', 'fin_transactions', 'fin_budgets', 'fin_partner_contributions', 'fin_targets'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('drop policy if exists %I on public.%I', t || '_finance', t);
    execute format('create policy %I on public.%I for all to authenticated using (studio.can_see_finance()) with check (studio.can_see_finance())', t || '_finance', t);
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function studio.audit()', t || '_audit', t);
    if t not in ('fin_allocation_shares') then
      execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
      execute format('create trigger %I before update on public.%I for each row execute function studio.touch_updated_at()', t || '_touch', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------- comprovantes (Storage privado)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fin-attachments', 'fin-attachments', false, 10485760,
  array['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists fin_attachments_admin on storage.objects;
create policy fin_attachments_admin on storage.objects for all to authenticated
  using (bucket_id = 'fin-attachments' and studio.can_see_finance())
  with check (bucket_id = 'fin-attachments' and studio.can_see_finance());

-- ---------------------------------------------------------------- dados iniciais
insert into public.fin_categories (name, type, group_name, is_fixed, sort_order) values
  ('Assinaturas', 'income', 'Receita operacional', false, 10),
  ('Serviços e implantação', 'income', 'Receita operacional', false, 20),
  ('Parcerias e comissões', 'income', 'Receita operacional', false, 30),
  ('Outras receitas', 'income', 'Outras', false, 90),
  ('Infraestrutura e hospedagem', 'expense', 'Tecnologia', true, 10),
  ('Ferramentas e softwares', 'expense', 'Tecnologia', true, 20),
  ('Inteligência artificial (APIs)', 'expense', 'Tecnologia', false, 25),
  ('Domínio e e-mail', 'expense', 'Tecnologia', true, 30),
  ('Lojas de aplicativos', 'expense', 'Tecnologia', true, 35),
  ('Contabilidade', 'expense', 'Administrativo', true, 40),
  ('Impostos e taxas', 'expense', 'Administrativo', false, 50),
  ('Taxas de pagamento', 'expense', 'Administrativo', false, 55),
  ('Marketing e anúncios', 'expense', 'Comercial', false, 60),
  ('Pessoas e prestadores', 'expense', 'Pessoas', true, 70),
  ('Outras despesas', 'expense', 'Outras', false, 90)
on conflict (type, name) do nothing;

insert into public.fin_allocation_rules (name, description)
values ('Igual entre FINC e Obra Fácil', 'Custos compartilhados divididos 50/50 entre os produtos')
on conflict (name) do nothing;
insert into public.fin_allocation_shares (rule_id, entity_id, percent)
select r.id, e.id, 50 from public.fin_allocation_rules r, public.entities e
where r.name = 'Igual entre FINC e Obra Fácil' and e.slug in ('finc', 'obra-facil')
on conflict do nothing;
