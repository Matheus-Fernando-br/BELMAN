-- Chamados (Desenvolvimento): qualquer pessoa do Studio abre uma sugestão de melhoria,
-- problema ou dúvida sobre um sistema, com até 2 imagens. Quem abriu vê os próprios
-- chamados; Sócio/Admin vê e trata todos. Ao fechar, as imagens são apagadas.
create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity,
  entity_id uuid not null references public.entities (id) on delete cascade,
  kind text not null default 'melhoria' check (kind in ('melhoria', 'problema', 'duvida', 'outro')),
  title text not null check (char_length(title) between 3 and 140),
  description text not null default '' check (char_length(description) <= 5000),
  status text not null default 'aberto' check (status in ('aberto', 'em_analise', 'concluido', 'recusado')),
  priority text check (priority is null or priority in ('baixa', 'media', 'alta')),
  attachments jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 2),
  attachments_purged_at timestamptz,
  answer text check (answer is null or char_length(answer) <= 3000),
  backlog_item_id uuid references public.backlog_items (id) on delete set null,
  closed_at timestamptz,
  closed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
create index if not exists tickets_status_idx on public.tickets (status, created_at desc);
create index if not exists tickets_author_idx on public.tickets (created_by, created_at desc);

alter table public.tickets enable row level security;
revoke all on public.tickets from anon;

drop policy if exists tickets_read on public.tickets;
create policy tickets_read on public.tickets for select to authenticated
  using (studio.is_member() and (created_by = auth.uid() or studio.is_admin()));

-- abrir: qualquer membro, em nome próprio, sobre uma empresa que enxerga, sempre como "aberto"
drop policy if exists tickets_insert on public.tickets;
create policy tickets_insert on public.tickets for insert to authenticated
  with check (studio.is_member() and created_by = auth.uid() and status = 'aberto' and studio.can_see_entity(entity_id)
    and closed_at is null and answer is null and backlog_item_id is null);

-- tratar (situação, resposta, prioridade) e excluir: só Sócio/Admin
drop policy if exists tickets_admin on public.tickets;
create policy tickets_admin on public.tickets for update to authenticated
  using (studio.is_admin()) with check (studio.is_admin());
drop policy if exists tickets_delete on public.tickets;
create policy tickets_delete on public.tickets for delete to authenticated using (studio.is_admin());

drop trigger if exists tickets_touch on public.tickets;
create trigger tickets_touch before update on public.tickets for each row execute function studio.touch_updated_at();
drop trigger if exists tickets_audit on public.tickets;
create trigger tickets_audit after insert or update or delete on public.tickets for each row execute function studio.audit();

-- imagens dos chamados: bucket privado, só imagens até 5 MB (envio por link assinado do servidor)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ticket-files', 'ticket-files', false, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
