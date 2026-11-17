-- Vendas como central de relacionamento: contatos (PF/PJ), contratos e documentos,
-- materiais de divulgação. Tudo por entidade (Bellman, FINC, Obra Fácil, Compartilhado)
-- e, quando faz sentido, ligado a um contato.

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities (id),
  person_type text not null default 'pj' check (person_type in ('pf', 'pj')),
  category text not null default 'empresa' check (category in ('empresa', 'loja', 'parceiro', 'profissional', 'prestador', 'cliente', 'outro')),
  name text not null check (char_length(name) between 2 and 160),       -- razão social ou nome
  trade_name text,                                                        -- nome fantasia
  document text,                                                          -- CPF ou CNPJ
  contact_person text,
  role text,                                                              -- profissão ou cargo
  email text,
  phone text,
  city text,
  state text check (state is null or char_length(state) = 2),
  website text,
  instagram text,
  status text not null default 'ativo' check (status in ('ativo', 'inativo')),
  tags text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
create index if not exists contacts_entity_idx on public.contacts (entity_id, category);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities (id),
  contact_id uuid references public.contacts (id) on delete set null,
  kind text not null default 'contrato' check (kind in ('contrato', 'aditivo', 'proposta', 'nda', 'procuracao', 'nota', 'outro')),
  title text not null check (char_length(title) between 2 and 160),
  status text not null default 'vigente' check (status in ('rascunho', 'em_assinatura', 'vigente', 'encerrado')),
  signed_at date,
  valid_until date,
  value_cents bigint check (value_cents is null or value_cents >= 0),
  storage_path text,
  file_name text,
  mime text,
  bytes bigint,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
create index if not exists documents_entity_idx on public.documents (entity_id, kind);
create index if not exists documents_contact_idx on public.documents (contact_id);

create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities (id),
  contact_id uuid references public.contacts (id) on delete set null,
  campaign_id uuid references public.campaigns (id) on delete set null,
  purpose text not null default 'institucional' check (purpose in ('institucional', 'redes_sociais', 'panfleto', 'cartaz', 'apresentacao', 'anuncio', 'evento', 'outro')),
  title text not null check (char_length(title) between 2 and 160),
  storage_path text not null,
  file_name text,
  mime text,
  bytes bigint,
  tags text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
create index if not exists materials_entity_idx on public.materials (entity_id, purpose);

-- campanhas podem ser ligadas a um parceiro
alter table public.campaigns add column if not exists contact_id uuid references public.contacts (id) on delete set null;

do $$
declare t text;
begin
  foreach t in array array['contacts', 'documents', 'materials'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (studio.is_member() and studio.can_see_entity(entity_id))', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for all to authenticated using (studio.can_write() and studio.can_see_entity(entity_id)) with check (studio.can_write() and studio.can_see_entity(entity_id))', t || '_write', t);
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function studio.touch_updated_at()', t || '_touch', t);
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function studio.audit()', t || '_audit', t);
  end loop;
end $$;

-- arquivos (contratos e materiais): bucket privado; o navegador envia por link assinado do servidor
insert into storage.buckets (id, name, public, file_size_limit)
values ('sales-files', 'sales-files', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;
