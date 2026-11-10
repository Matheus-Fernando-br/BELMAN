-- Bellman Studio · métricas dos produtos (somente leitura, via API assinada e cifrada).
-- Uso (usuários) é visível a quem tem acesso ao produto; receita/MRR só a Sócio/Admin.

create table if not exists public.product_usage_snapshots (
  entity_id uuid not null references public.entities (id),
  day date not null,
  captured_at timestamptz not null default now(),
  users jsonb not null,          -- { total, verified, active7d, active30d, newInPeriod }
  monthly jsonb not null,        -- [{ month, newUsers }]
  primary key (entity_id, day)
);

create table if not exists public.product_revenue_snapshots (
  entity_id uuid not null references public.entities (id),
  day date not null,
  captured_at timestamptz not null default now(),
  subscriptions jsonb not null,  -- { active, trialing, pastDue, newInPeriod, canceledInPeriod, byPlan[] }
  mrr_cents bigint not null,
  revenue_month_cents bigint not null,
  monthly jsonb not null,        -- [{ month, newSubscriptions, canceledSubscriptions, activeSubscriptionsAtEnd, revenueCents }]
  primary key (entity_id, day)
);

create table if not exists public.product_sync_state (
  entity_id uuid primary key references public.entities (id),
  payments_since timestamptz,
  last_run_at timestamptz,
  last_ok_at timestamptz,
  last_error text,
  last_imported int not null default 0
);

create table if not exists public.product_sync_runs (
  id bigint generated always as identity primary key,
  entity_id uuid not null references public.entities (id),
  at timestamptz not null default now(),
  trigger text not null check (trigger in ('cron', 'manual')),
  ok boolean not null,
  message text,
  imported int not null default 0,
  updated int not null default 0
);
create index if not exists product_sync_runs_idx on public.product_sync_runs (entity_id, at desc);

alter table public.product_usage_snapshots enable row level security;
alter table public.product_revenue_snapshots enable row level security;
alter table public.product_sync_state enable row level security;
alter table public.product_sync_runs enable row level security;
revoke all on public.product_usage_snapshots, public.product_revenue_snapshots, public.product_sync_state, public.product_sync_runs from anon;

drop policy if exists usage_read on public.product_usage_snapshots;
create policy usage_read on public.product_usage_snapshots for select to authenticated using (studio.can_see_entity(entity_id));
drop policy if exists revenue_read on public.product_revenue_snapshots;
create policy revenue_read on public.product_revenue_snapshots for select to authenticated using (studio.can_see_finance());
drop policy if exists sync_state_read on public.product_sync_state;
create policy sync_state_read on public.product_sync_state for select to authenticated using (studio.can_see_entity(entity_id));
drop policy if exists sync_runs_read on public.product_sync_runs;
create policy sync_runs_read on public.product_sync_runs for select to authenticated using (studio.is_admin());
-- Escrita: somente o servidor do Studio (chave secreta), nunca o navegador.
revoke insert, update, delete on public.product_usage_snapshots, public.product_revenue_snapshots, public.product_sync_state, public.product_sync_runs from authenticated;

update public.entities set metrics_url = 'https://obra-facil-api.onrender.com/internal' where slug = 'obra-facil' and metrics_url is null;
