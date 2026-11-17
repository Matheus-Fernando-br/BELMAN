-- Planejamento: simulador financeiro ligado aos dados do Studio.
-- Planos e preços vêm do produto (sincronização) ou são cadastrados no Studio;
-- despesas vêm do Financeiro; cenários guardam só as hipóteses (nunca mexem no oficial).

create table if not exists public.product_plans (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities (id),
  external_id text,                          -- id do plano no produto (sincronizado)
  name text not null check (char_length(name) between 1 and 80),
  price_cents bigint not null default 0 check (price_cents >= 0),
  billing text not null default 'monthly' check (billing in ('monthly', 'yearly')),
  subscribers int not null default 0 check (subscribers >= 0),   -- assinantes ativos hoje
  source text not null default 'manual' check (source in ('sync', 'manual')),
  active boolean not null default true,
  sort_order int not null default 100,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  unique (entity_id, external_id)
);

alter table public.product_plans enable row level security;
revoke all on public.product_plans from anon;
drop policy if exists product_plans_read on public.product_plans;
create policy product_plans_read on public.product_plans for select to authenticated using (studio.is_member() and studio.can_see_entity(entity_id));
drop policy if exists product_plans_write on public.product_plans;
-- planos sincronizados só mudam pelo produto (o navegador só edita os cadastrados à mão)
create policy product_plans_write on public.product_plans for all to authenticated
  using (studio.is_admin() and source = 'manual') with check (studio.is_admin() and source = 'manual');
drop trigger if exists product_plans_touch on public.product_plans;
create trigger product_plans_touch before update on public.product_plans for each row execute function studio.touch_updated_at();
drop trigger if exists product_plans_audit on public.product_plans;
create trigger product_plans_audit after insert or update or delete on public.product_plans for each row execute function studio.audit();

-- grupo do planejamento para cada categoria de despesa do Financeiro
alter table public.fin_categories add column if not exists plan_group text
  check (plan_group is null or plan_group in ('marketing', 'impostos', 'tecnologia', 'servicos', 'manutencao', 'operacional', 'outras'));
update public.fin_categories set plan_group = case
  when name ilike 'marketing%' then 'marketing'
  when name ilike 'impostos%' then 'impostos'
  when name ilike any (array['infraestrutura%', 'ferramentas%', 'domínio%', 'dominio%', 'inteligência%', 'inteligencia%', 'lojas de aplicativos%']) then 'tecnologia'
  when name ilike any (array['contabilidade%', 'pessoas%', 'prestadores%']) then 'servicos'
  when name ilike 'manuten%' then 'manutencao'
  when name ilike 'taxas de pagamento%' then 'operacional'
  else 'outras' end
where type = 'expense' and plan_group is null;

create table if not exists public.planning_scenarios (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 60),
  kind text not null default 'realista' check (kind in ('conservador', 'realista', 'otimista', 'personalizado')),
  config jsonb not null default '{}',        -- hipóteses (assinantes, crescimento, preços, despesas, sócios…)
  sort_order int not null default 100,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
alter table public.planning_scenarios enable row level security;
revoke all on public.planning_scenarios from anon;
drop policy if exists planning_scenarios_all on public.planning_scenarios;
create policy planning_scenarios_all on public.planning_scenarios for all to authenticated using (studio.can_see_finance()) with check (studio.can_see_finance());
drop trigger if exists planning_scenarios_touch on public.planning_scenarios;
create trigger planning_scenarios_touch before update on public.planning_scenarios for each row execute function studio.touch_updated_at();
drop trigger if exists planning_scenarios_audit on public.planning_scenarios;
create trigger planning_scenarios_audit after insert or update or delete on public.planning_scenarios for each row execute function studio.audit();

-- três cenários prontos (as quantidades partem do número real de assinantes)
insert into public.planning_scenarios (name, kind, sort_order, config)
select v.name, v.kind, v.ord, v.config::jsonb from (values
  ('Conservador', 'conservador', 1, '{"growthPct": 3, "churnPct": 4, "expenseGrowthPct": 1, "taxPct": 6, "reservePct": 30}'),
  ('Realista', 'realista', 2, '{"growthPct": 8, "churnPct": 3, "expenseGrowthPct": 1, "taxPct": 6, "reservePct": 20}'),
  ('Otimista', 'otimista', 3, '{"growthPct": 15, "churnPct": 2, "expenseGrowthPct": 2, "taxPct": 6, "reservePct": 15}')
) as v(name, kind, ord, config)
where not exists (select 1 from public.planning_scenarios);
