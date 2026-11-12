-- Bellman Studio · Fases 4 e 5 · Redes sociais (conteúdo com IA, revisão, publicação, resultados).
-- Tokens e chaves ficam CIFRADOS (AES-256-GCM) pela aplicação; a chave de cifra só existe
-- no servidor (STUDIO_ENCRYPTION_KEY). O banco guarda apenas o texto cifrado, e nem ele é
-- legível pelo navegador (coluna sem permissão de leitura).

do $$ begin create type public.social_network as enum ('instagram', 'youtube', 'tiktok', 'linkedin'); exception when duplicate_object then null; end $$;
do $$ begin create type public.social_format as enum ('carousel', 'single', 'reels', 'stories', 'youtube'); exception when duplicate_object then null; end $$;
do $$ begin create type public.social_status as enum ('draft', 'review', 'approved', 'scheduled', 'publishing', 'published', 'failed', 'rejected'); exception when duplicate_object then null; end $$;

-- Segredos de integrações (ex.: chave da API da Anthropic). Só o servidor lê.
create table if not exists public.studio_secrets (
  name text primary key check (name ~ '^[a-z0-9_]{3,60}$'),
  ciphertext text not null,
  hint text,                                  -- últimos 4 caracteres, para conferência
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
alter table public.studio_secrets enable row level security;
revoke all on public.studio_secrets from anon, authenticated;
-- metadados (sem o texto cifrado) para a tela de Conexões
create or replace view public.studio_secrets_status with (security_invoker = false) as
  select name, hint, updated_at from public.studio_secrets where studio.is_admin();
revoke all on public.studio_secrets_status from anon;
grant select on public.studio_secrets_status to authenticated;

create table if not exists public.social_brand_profiles (
  entity_id uuid primary key references public.entities (id),
  display_name text not null,
  handle text,                                -- @ da conta
  audience text,
  tone text,
  words_use text,
  words_avoid text,
  positions text,
  colors jsonb not null default '{}',         -- { primary, accent, background, text }
  font text not null default 'Inter',
  links jsonb not null default '{}',          -- { site, store, bio }
  default_cta text,
  max_emojis int not null default 1,
  max_hashtags int not null default 5,
  link_in_caption boolean not null default false,
  extra_rules text,
  posts_per_week int not null default 2 check (posts_per_week between 0 and 21),
  posting_days int[] not null default '{2,4}', -- 0=dom … 6=sáb
  posting_time time not null default '19:00',
  formats public.social_format[] not null default '{carousel,single,reels}',
  auto_generate boolean not null default false, -- gerar a semana sozinho (segunda 8h)
  auto_publish boolean not null default false,  -- publicar sem revisão (desligado por padrão)
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create table if not exists public.social_connections (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities (id),
  network public.social_network not null,
  account_id text,
  username text,
  token_ciphertext text,                       -- nunca legível pelo navegador
  token_hint text,
  token_expires_at timestamptz,
  status text not null default 'active' check (status in ('active', 'expired', 'error', 'disconnected')),
  last_check_at timestamptz,
  last_refresh_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  unique (entity_id, network)
);

create table if not exists public.social_generations (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities (id),
  kind text not null check (kind in ('weekly', 'manual', 'redo')),
  model text not null,
  ok boolean not null,
  error text,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_usd numeric(10, 4) not null default 0,
  posts_created int not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid()
);

create table if not exists public.social_posts (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities (id),
  network public.social_network not null default 'instagram',
  format public.social_format not null,
  post_type text not null default 'ensino' check (post_type in ('prova', 'ensino', 'opiniao', 'historia', 'oferta')),
  status public.social_status not null default 'review',
  title text not null,
  caption text not null default '',
  hashtags text[] not null default '{}',
  content jsonb not null default '{}',         -- slides, roteiro, stories, youtube…
  media jsonb not null default '[]',           -- [{ path, kind, width, height, alt }]
  scheduled_at timestamptz,
  published_at timestamptz,
  external_id text,
  permalink text,
  error text,
  generation_id uuid references public.social_generations (id) on delete set null,
  approved_by uuid references public.profiles (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
create index if not exists social_posts_status_idx on public.social_posts (entity_id, status, scheduled_at);

create table if not exists public.social_post_versions (
  id bigint generated always as identity primary key,
  post_id uuid not null references public.social_posts (id) on delete cascade,
  entity_id uuid not null references public.entities (id),
  note text,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid()
);

create table if not exists public.social_post_metrics (
  post_id uuid not null references public.social_posts (id) on delete cascade,
  entity_id uuid not null references public.entities (id),
  captured_at timestamptz not null default now(),
  source text not null default 'api' check (source in ('api', 'manual')),
  reach int, views int, likes int, comments int, saves int, shares int,
  primary key (post_id, captured_at)
);

create table if not exists public.social_publish_log (
  id bigint generated always as identity primary key,
  post_id uuid references public.social_posts (id) on delete set null,
  entity_id uuid not null references public.entities (id),
  at timestamptz not null default now(),
  ok boolean not null,
  message text
);

-- Leitura: quem vê a Entidade. Escrita de conteúdo: Sócio/Admin e Colaborador.
do $$
declare t text;
begin
  foreach t in array array['social_brand_profiles', 'social_posts', 'social_post_versions', 'social_post_metrics'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (studio.can_see_entity(entity_id))', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_rw', t);
    execute format('create policy %I on public.%I for all to authenticated using (studio.can_write() and studio.can_see_entity(entity_id)) with check (studio.can_write() and studio.can_see_entity(entity_id))', t || '_rw', t);
  end loop;
  foreach t in array array['social_brand_profiles', 'social_posts'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function studio.audit()', t || '_audit', t);
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function studio.touch_updated_at()', t || '_touch', t);
  end loop;
end $$;

-- Conexões: só Sócio/Admin vê; o token cifrado nunca é selecionável pelo navegador.
alter table public.social_connections enable row level security;
revoke all on public.social_connections from anon, authenticated;
grant select (id, entity_id, network, account_id, username, token_hint, token_expires_at, status, last_check_at, last_refresh_at, last_error, created_at, updated_at)
  on public.social_connections to authenticated;
drop policy if exists social_connections_read on public.social_connections;
create policy social_connections_read on public.social_connections for select to authenticated using (studio.is_admin());
drop trigger if exists social_connections_touch on public.social_connections;
create trigger social_connections_touch before update on public.social_connections for each row execute function studio.touch_updated_at();

-- Custo da IA e log de publicação: leitura para quem vê a Entidade; escrita só pelo servidor.
alter table public.social_generations enable row level security;
alter table public.social_publish_log enable row level security;
revoke all on public.social_generations, public.social_publish_log from anon;
revoke insert, update, delete on public.social_generations, public.social_publish_log from authenticated;
drop policy if exists social_generations_read on public.social_generations;
create policy social_generations_read on public.social_generations for select to authenticated using (studio.can_see_entity(entity_id));
drop policy if exists social_publish_log_read on public.social_publish_log;
create policy social_publish_log_read on public.social_publish_log for select to authenticated using (studio.can_see_entity(entity_id));

-- Mídias geradas (PNG/MP4): bucket privado; o Instagram recebe links assinados temporários.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('social-media', 'social-media', false, 104857600, array['image/png', 'image/jpeg', 'video/mp4'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;
drop policy if exists social_media_rw on storage.objects;
create policy social_media_rw on storage.objects for all to authenticated
  using (bucket_id = 'social-media' and studio.is_member())
  with check (bucket_id = 'social-media' and studio.can_write());

-- Perfis de marca iniciais (editáveis em Redes sociais → Perfis de marca).
insert into public.social_brand_profiles (entity_id, display_name, handle, audience, tone, words_use, words_avoid, positions, colors, font, links, default_cta, max_emojis, max_hashtags, link_in_caption, extra_rules, posts_per_week, posting_days, posting_time)
select id, 'Obra Fácil', '@obra.facil.app',
  'Pedreiros, empreiteiros, mestres de obra, técnicos em edificações e engenheiros que tocam obras e fazem orçamentos.',
  'Direto, prático, "gente da obra falando com gente da obra". Frases curtas. Números reais (R$, %, dias).',
  'orçamento, obra, cliente, prazo, margem, material, mão de obra, PDF, WhatsApp',
  'disruptivo, revolucionário, sinergia, alavancar, jornada, incrível, game changer',
  'Organização é dinheiro no bolso. Orçamento bem feito fecha mais obra. Cliente gosta de profissional que manda tudo certinho.',
  '{"primary":"#C2570C","accent":"#F08A3C","background":"#141110","text":"#FFFFFF"}', 'Inter',
  '{"site":"https://obra-facil-r2ms-projects.vercel.app","bio":"Link na bio"}',
  'Baixe o Obra Fácil — link na bio', 1, 5, false,
  'Nunca prometer ganho financeiro exato. Sem link na legenda (link na bio).', 2, '{2,4}', '19:00'
from public.entities where slug = 'obra-facil'
on conflict (entity_id) do nothing;

insert into public.social_brand_profiles (entity_id, display_name, handle, audience, tone, positions, colors, font, links, default_cta, max_emojis, max_hashtags, posts_per_week, posting_days, posting_time)
select id, 'Bellman', null, 'Empreendedores e pequenas empresas que querem usar tecnologia para crescer.',
  'Minimalista, confiante e preciso. Frases curtas. Sem exageros.',
  'Technology meets business. Tecnologia com propósito.',
  '{"primary":"#000000","accent":"#FFFFFF","background":"#000000","text":"#FFFFFF"}', 'Manrope',
  '{"site":"https://bellman-tech.vercel.app"}', 'Conheça a Bellman — link na bio', 0, 4, 1, '{3}', '12:00'
from public.entities where slug = 'bellman'
on conflict (entity_id) do nothing;

insert into public.social_brand_profiles (entity_id, display_name, handle, audience, tone, colors, font, links, default_cta, max_emojis, max_hashtags, posts_per_week, posting_days, posting_time)
select id, 'FINC', null, 'MEIs e pequenas empresas que emitem notas fiscais e controlam o caixa.',
  'Claro, didático e confiável. Explica termos fiscais sem jargão.',
  '{"primary":"#00914C","accent":"#16A34A","background":"#0B1F14","text":"#FFFFFF"}', 'Inter',
  '{"site":"https://finc-seven.vercel.app"}', 'Teste a FINC — link na bio', 1, 5, 2, '{1,4}', '12:00'
from public.entities where slug = 'finc'
on conflict (entity_id) do nothing;
