-- Bellman Studio · Fase 2 · Operações e Desenvolvimento.
-- Leitura: quem vê a Entidade. Escrita: Sócio/Admin e Colaborador. Leitura (viewer) só visualiza.

do $$ begin create type public.task_status as enum ('todo', 'doing', 'review', 'done'); exception when duplicate_object then null; end $$;
do $$ begin create type public.priority as enum ('low', 'medium', 'high', 'urgent'); exception when duplicate_object then null; end $$;
do $$ begin create type public.customer_status as enum ('lead', 'onboarding', 'active', 'paused', 'churned'); exception when duplicate_object then null; end $$;
do $$ begin create type public.backlog_type as enum ('feature', 'improvement', 'bug', 'chore'); exception when duplicate_object then null; end $$;
do $$ begin create type public.backlog_status as enum ('new', 'triaged', 'in_progress', 'testing', 'done', 'wont_do'); exception when duplicate_object then null; end $$;
do $$ begin create type public.severity as enum ('low', 'medium', 'high', 'critical'); exception when duplicate_object then null; end $$;
do $$ begin create type public.project_status as enum ('planned', 'active', 'paused', 'done'); exception when duplicate_object then null; end $$;
do $$ begin create type public.release_status as enum ('planned', 'in_progress', 'testing', 'approved', 'released'); exception when duplicate_object then null; end $$;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities (id),
  name text not null check (char_length(name) between 2 and 140),
  document text,
  contact_name text,
  email text,
  phone text,
  status public.customer_status not null default 'onboarding',
  plan text,
  mrr_cents bigint not null default 0 check (mrr_cents >= 0),
  started_at date default current_date,
  churned_at date,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities (id),
  name text not null check (char_length(name) between 2 and 120),
  description text,
  status public.project_status not null default 'planned',
  owner_id uuid references public.profiles (id) on delete set null,
  start_date date,
  due_date date,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities (id),
  title text not null check (char_length(title) between 2 and 160),
  description text,
  status public.task_status not null default 'todo',
  priority public.priority not null default 'medium',
  assignee_id uuid references public.profiles (id) on delete set null,
  due_date date,
  project_id uuid references public.projects (id) on delete set null,
  customer_id uuid references public.customers (id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
create index if not exists tasks_status_idx on public.tasks (entity_id, status);

create table if not exists public.onboarding_templates (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities (id),
  name text not null,
  items text[] not null default '{}',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create table if not exists public.onboarding_runs (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities (id),
  customer_id uuid not null references public.customers (id) on delete cascade,
  template_id uuid references public.onboarding_templates (id) on delete set null,
  items jsonb not null default '[]', -- [{label, done, done_at}]
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create table if not exists public.wiki_pages (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities (id),
  title text not null check (char_length(title) between 2 and 140),
  category text not null default 'Processos',
  body text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities (id),
  title text not null check (char_length(title) between 2 and 140),
  held_at date not null default current_date,
  attendees text,
  notes text,
  decisions text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create table if not exists public.releases (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities (id),
  version text not null check (char_length(version) between 1 and 30),
  title text,
  status public.release_status not null default 'planned',
  target_date date,
  released_at date,
  notes text,
  qa_checklist jsonb not null default '[]', -- [{label, done}]
  approved_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  unique (entity_id, version)
);

create table if not exists public.backlog_items (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities (id),
  type public.backlog_type not null default 'feature',
  title text not null check (char_length(title) between 2 and 160),
  description text,
  steps_to_reproduce text,
  priority public.priority not null default 'medium',
  severity public.severity,
  status public.backlog_status not null default 'new',
  release_id uuid references public.releases (id) on delete set null,
  project_id uuid references public.projects (id) on delete set null,
  assignee_id uuid references public.profiles (id) on delete set null,
  source text not null default 'manual',
  reporter_name text,
  reporter_contact text,
  attachments text[] not null default '{}',
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
create index if not exists backlog_status_idx on public.backlog_items (entity_id, status);

create table if not exists public.feedback_forms (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities (id),
  token text not null unique default encode(extensions.gen_random_bytes(12), 'hex'),
  title text not null default 'Envie seu feedback',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create table if not exists public.infra_assets (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities (id),
  name text not null,
  provider text,
  kind text not null default 'hospedagem',
  url text,
  monthly_cost_cents bigint not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

-- Datas de conclusão automáticas.
create or replace function studio.stamp_done() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'tasks' then
    new.completed_at := case when new.status = 'done' then coalesce(new.completed_at, now()) else null end;
  elsif tg_table_name = 'backlog_items' then
    new.resolved_at := case when new.status in ('done', 'wont_do') then coalesce(new.resolved_at, now()) else null end;
  end if;
  return new;
end $$;
drop trigger if exists tasks_done on public.tasks;
create trigger tasks_done before insert or update on public.tasks for each row execute function studio.stamp_done();
drop trigger if exists backlog_done on public.backlog_items;
create trigger backlog_done before insert or update on public.backlog_items for each row execute function studio.stamp_done();

-- RLS, auditoria e updated_at para todas.
do $$
declare t text;
begin
  foreach t in array array['customers', 'projects', 'tasks', 'onboarding_templates', 'onboarding_runs', 'wiki_pages',
    'meetings', 'releases', 'backlog_items', 'feedback_forms', 'infra_assets'] loop
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

-- Anexos de bugs (prints) e feedback: bucket privado.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dev-attachments', 'dev-attachments', false, 4194304, array['image/png', 'image/jpeg', 'image/webp', 'application/pdf', 'video/mp4'])
on conflict (id) do update set public = false;
drop policy if exists dev_attachments_rw on storage.objects;
create policy dev_attachments_rw on storage.objects for all to authenticated
  using (bucket_id = 'dev-attachments' and studio.is_member())
  with check (bucket_id = 'dev-attachments' and studio.can_write());

-- Modelos de onboarding iniciais.
insert into public.onboarding_templates (entity_id, name, items)
select e.id, 'Implantação padrão', case e.slug
  when 'finc' then array['Cadastro da empresa e certificado digital', 'Importar produtos e clientes', 'Configurar emissão de NF-e/NFC-e', 'Primeira nota emitida com acompanhamento', 'Treinamento do PDV', 'Revisão após 7 dias']
  else array['Conta criada e e-mail verificado', 'Cadastro dos primeiros clientes', 'Primeiro orçamento enviado em PDF', 'Primeira obra cadastrada', 'Plano escolhido', 'Contato de acompanhamento em 7 dias'] end
from public.entities e where e.slug in ('finc', 'obra-facil')
and not exists (select 1 from public.onboarding_templates t where t.entity_id = e.id);
