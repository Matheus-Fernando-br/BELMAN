-- Bellman Studio · Módulo Redes Sociais (Etapa 1 do prompt mestre).
--
-- Substitui o rascunho da 0007 (tabelas social_* v1, todas vazias; só havia 3 perfis de marca
-- de exemplo). Modelo: contas por entidade, perfil de marca, templates, regras semanais,
-- posts + mídias, métricas, custo de IA, alvo de perfil, acervo de mídia e a fila de jobs
-- consumida pelo worker. Credenciais (tokens e app secrets) ficam CIFRADAS no schema
-- privado studio_private, sem nenhum acesso para anon/authenticated.

-- ================================================================ 0. remove o rascunho v1 (0007)
drop view if exists public.studio_secrets_status;
drop table if exists public.social_publish_log, public.social_post_metrics, public.social_post_versions,
  public.social_posts, public.social_generations, public.social_connections, public.social_brand_profiles,
  public.studio_secrets cascade;
drop type if exists public.social_status;
drop type if exists public.social_format;
drop type if exists public.social_network;
drop policy if exists social_media_rw on storage.objects;

-- ================================================================ 1. tipos
do $$ begin create type public.social_platform as enum ('instagram', 'youtube'); exception when duplicate_object then null; end $$;
do $$ begin create type public.social_format as enum ('post', 'carousel', 'reel', 'story', 'youtube_video', 'youtube_thumbnail'); exception when duplicate_object then null; end $$;
do $$ begin create type public.social_post_status as enum ('draft', 'generating', 'rendering', 'review', 'approved', 'scheduled', 'publishing', 'published', 'failed', 'rejected'); exception when duplicate_object then null; end $$;
do $$ begin create type public.social_job_kind as enum ('generate_copy', 'render', 'publish', 'refresh_token', 'collect_metrics', 'plan_week', 'profile_check'); exception when duplicate_object then null; end $$;
do $$ begin create type public.social_job_status as enum ('queued', 'running', 'done', 'failed'); exception when duplicate_object then null; end $$;
do $$ begin create type public.token_kind as enum ('ig_user', 'fb_user', 'fb_system_user'); exception when duplicate_object then null; end $$;

-- ================================================================ 2. auditoria sem segredos
-- Igual a studio.audit(), mas (a) troca qualquer coluna *cipher* por "[redacted]" e
-- (b) quando a escrita vem do servidor (service role, sem auth.uid()), usa updated_by/created_by
-- como autor, para que "conectar", "desconectar" e "trocar app secret" fiquem com o nome de quem fez.
create or replace function studio.audit_redacted() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  rec jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  actor uuid := coalesce(auth.uid(), nullif(rec ->> 'updated_by', '')::uuid, nullif(rec ->> 'created_by', '')::uuid);
  o jsonb;
  n jsonb;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select jsonb_object_agg(key, case when key like '%cipher%' then to_jsonb('[redacted]'::text) else value end) into o from jsonb_each(to_jsonb(old));
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    select jsonb_object_agg(key, case when key like '%cipher%' then to_jsonb('[redacted]'::text) else value end) into n from jsonb_each(to_jsonb(new));
  end if;
  insert into public.audit_log (table_name, record_id, action, actor, actor_email, old_data, new_data)
  values (tg_table_schema || '.' || tg_table_name, coalesce(rec ->> 'id', rec ->> 'account_id', rec ->> 'entity_id'), lower(tg_op), actor,
          (select p.email from public.profiles p where p.id = actor), o, n);
  return null;
end $$;

-- ================================================================ 3. tabelas públicas (RLS por entidade)

-- 3.1 contas conectadas (metadados; o token NÃO fica aqui)
create table if not exists public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities (id),
  platform public.social_platform not null,
  external_id text,                              -- IG user id
  username text,
  name text,
  profile_picture_url text,
  biography text,
  website text,
  followers_count int,
  media_count int,
  status text not null default 'disconnected' check (status in ('connected', 'expiring', 'expired', 'error', 'disconnected')),
  token_kind public.token_kind,
  token_expires_at timestamptz,
  scopes text[] not null default '{}',
  last_checked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  unique (entity_id, platform)
);

-- 3.2 perfil de marca (1 por entidade)
create table if not exists public.brand_profiles (
  entity_id uuid primary key references public.entities (id),
  handle text,
  voice text,
  audience text,
  positions text[] not null default '{}',
  banned_words text[] not null default '{}',
  emoji_policy text,
  hashtag_bank text[] not null default '{}',
  max_hashtags int not null default 5 check (max_hashtags between 0 and 30),
  cta_default text,
  link_in_bio text,
  palette jsonb not null default '{"primary":"#000000","accent":"#FFFFFF","bg":"#000000","text":"#FFFFFF"}',
  fonts jsonb not null default '{"heading":"Inter","body":"Inter"}',
  logo_path text,                                -- caminho no bucket social-media
  extra_rules text,
  ai_model text not null default 'claude-opus-5-5', -- decisão de custo do admin (Configurações)
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

-- 3.3 templates de arte
create table if not exists public.social_templates (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities (id),
  format public.social_format not null,
  key text not null check (key ~ '^[a-z]+\.[a-zA-Z0-9_]+$'),   -- ex.: carousel.classic
  name text not null,
  params jsonb not null default '{}',
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  unique (entity_id, key)
);
create unique index if not exists social_templates_default_idx on public.social_templates (entity_id, format) where is_default;

-- 3.4 regras semanais de conteúdo
create table if not exists public.content_rules (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities (id),
  format public.social_format not null,
  weekday int not null check (weekday between 0 and 6),          -- 0 = domingo
  local_time time not null,
  timezone text not null default 'America/Sao_Paulo',
  count int not null default 1 check (count between 1 and 10),
  mix_types text[] not null default '{prova,ensino,opiniao,historia,oferta}'
    check (mix_types <@ array['prova', 'ensino', 'opiniao', 'historia', 'oferta']),
  auto_generate boolean not null default false,
  require_review boolean not null default true,                  -- publicar sem revisão só se desligar aqui, por regra
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

-- 3.5 posts
create table if not exists public.social_posts (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities (id),
  account_id uuid references public.social_accounts (id) on delete set null,
  rule_id uuid references public.content_rules (id) on delete set null,
  format public.social_format not null,
  theme text,
  post_type text check (post_type in ('prova', 'ensino', 'opiniao', 'historia', 'oferta')),
  status public.social_post_status not null default 'draft',
  copy jsonb not null default '{}',              -- saída estruturada da IA
  caption text not null default '' check (char_length(caption) <= 2200),
  alt_texts text[] not null default '{}',
  hashtags text[] not null default '{}',
  template_key text,
  require_review boolean not null default true,
  scheduled_at timestamptz,
  published_at timestamptz,
  container_id text,
  external_media_id text,
  permalink text,
  error text,
  revision int not null default 0,
  approved_by uuid references public.profiles (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
create index if not exists social_posts_queue_idx on public.social_posts (status, scheduled_at);
create index if not exists social_posts_entity_idx on public.social_posts (entity_id, created_at desc);

-- O navegador nunca marca um post como publicado nem grava ids da Meta: isso é só do worker.
-- E aprovar exige um humano (approved_by = quem aprovou).
create or replace function studio.guard_social_post() returns trigger
language plpgsql set search_path = '' as $$
begin
  if auth.uid() is null then return new; end if;          -- service role (worker/server)
  if new.status in ('generating', 'rendering', 'publishing', 'published')
     and (tg_op = 'INSERT' or new.status is distinct from old.status) then
    raise exception 'status % é controlado pelo servidor', new.status using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and (new.external_media_id is distinct from old.external_media_id
     or new.permalink is distinct from old.permalink or new.container_id is distinct from old.container_id
     or new.published_at is distinct from old.published_at) then
    raise exception 'campos de publicação são controlados pelo servidor' using errcode = '42501';
  end if;
  if new.status in ('approved', 'scheduled') and (tg_op = 'INSERT' or old.status not in ('approved', 'scheduled')) then
    new.approved_by := auth.uid();
    new.approved_at := now();
  end if;
  return new;
end $$;

-- 3.6 mídias do post
create table if not exists public.social_assets (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.social_posts (id) on delete cascade,
  entity_id uuid not null references public.entities (id),
  idx int not null default 0,
  kind text not null check (kind in ('image', 'video', 'cover', 'audio', 'subtitle', 'preview')),
  storage_path text not null,
  mime text not null,
  width int,
  height int,
  duration_ms int,
  bytes bigint,
  created_at timestamptz not null default now(),
  unique (post_id, kind, idx)
);

-- 3.7 métricas
create table if not exists public.social_metrics (
  id bigint generated always as identity primary key,
  post_id uuid not null references public.social_posts (id) on delete cascade,
  entity_id uuid not null references public.entities (id),
  collected_at timestamptz not null default now(),
  reach int, views int, likes int, comments int, saves int, shares int,
  profile_visits int, follows int,
  raw jsonb
);
create index if not exists social_metrics_post_idx on public.social_metrics (post_id, collected_at desc);

-- 3.8 uso e custo de IA
create table if not exists public.ai_usage (
  id bigint generated always as identity primary key,
  entity_id uuid not null references public.entities (id),
  post_id uuid references public.social_posts (id) on delete set null,
  purpose text not null,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cache_read_tokens int not null default 0,
  cache_write_tokens int not null default 0,
  cost_usd numeric(10, 5) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_entity_idx on public.ai_usage (entity_id, created_at desc);

-- 3.9 alvo do perfil (a API não altera nome/bio/site/foto: o Studio guia a troca manual e confere)
create table if not exists public.profile_targets (
  entity_id uuid primary key references public.entities (id),
  desired_name text check (char_length(desired_name) <= 64),
  desired_biography text check (char_length(desired_biography) <= 150),
  desired_website text,
  desired_photo_path text,
  status text not null default 'pending' check (status in ('pending', 'applied')),
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

-- 3.10 acervo (trilhas licenciadas, gravações de tela, logos, fotos)
create table if not exists public.media_library (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities (id),
  kind text not null check (kind in ('music', 'screen_recording', 'logo', 'photo')),
  title text,
  storage_path text not null,
  license_note text,
  duration_ms int,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
-- música só entra com licença registrada
alter table public.media_library drop constraint if exists media_library_music_license;
alter table public.media_library add constraint media_library_music_license check (kind <> 'music' or coalesce(trim(license_note), '') <> '');

-- 3.11 fila de jobs do worker
create table if not exists public.social_jobs (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid references public.entities (id),
  post_id uuid references public.social_posts (id) on delete cascade,
  kind public.social_job_kind not null,
  payload jsonb not null default '{}',
  status public.social_job_status not null default 'queued',
  run_at timestamptz not null default now(),
  attempts int not null default 0,
  max_attempts int not null default 5,
  locked_at timestamptz,
  locked_by text,
  last_error text,
  dedupe_key text,                               -- evita o mesmo job duas vezes na fila
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
create index if not exists social_jobs_status_run_idx on public.social_jobs (status, run_at);
create unique index if not exists social_jobs_dedupe_idx on public.social_jobs (dedupe_key) where dedupe_key is not null and status in ('queued', 'running');

-- ================================================================ 4. RLS, gatilhos e grants
do $$
declare t text;
begin
  -- leitura: membro que vê a entidade; escrita: quem pode escrever e vê a entidade
  foreach t in array array['brand_profiles', 'social_templates', 'content_rules', 'social_posts', 'social_assets', 'profile_targets', 'media_library'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (studio.is_member() and studio.can_see_entity(entity_id))', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for all to authenticated using (studio.can_write() and studio.can_see_entity(entity_id)) with check (studio.can_write() and studio.can_see_entity(entity_id))', t || '_write', t);
  end loop;

  -- somente leitura no navegador (escrita só pelo servidor/worker com a service role)
  foreach t in array array['social_accounts', 'social_metrics', 'social_jobs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke insert, update, delete on public.%I from authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (studio.is_member() and studio.can_see_entity(entity_id))', t || '_read', t);
  end loop;

  -- updated_at
  foreach t in array array['social_accounts', 'brand_profiles', 'social_templates', 'content_rules', 'social_posts', 'profile_targets', 'media_library', 'social_jobs'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function studio.touch_updated_at()', t || '_touch', t);
  end loop;

  -- auditoria
  foreach t in array array['brand_profiles', 'social_templates', 'content_rules', 'social_posts', 'profile_targets', 'media_library'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function studio.audit()', t || '_audit', t);
  end loop;
end $$;

-- custo de IA: só admin vê; ninguém do navegador escreve
alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon;
revoke insert, update, delete on public.ai_usage from authenticated;
drop policy if exists ai_usage_read on public.ai_usage;
create policy ai_usage_read on public.ai_usage for select to authenticated using (studio.is_admin() and studio.can_see_entity(entity_id));

-- conectar/desconectar: auditoria com autor e sem segredos
drop trigger if exists social_accounts_audit on public.social_accounts;
create trigger social_accounts_audit after insert or update or delete on public.social_accounts for each row execute function studio.audit_redacted();

drop trigger if exists social_posts_guard on public.social_posts;
create trigger social_posts_guard before insert or update on public.social_posts for each row execute function studio.guard_social_post();

-- trocar o modelo de IA é decisão de custo: só admin
create or replace function studio.guard_brand_model() returns trigger
language plpgsql set search_path = '' as $$
begin
  if auth.uid() is not null and new.ai_model is distinct from (case when tg_op = 'INSERT' then 'claude-opus-5-5' else old.ai_model end)
     and not studio.is_admin() then
    raise exception 'só Sócio/Admin altera o modelo de IA' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists brand_profiles_model_guard on public.brand_profiles;
create trigger brand_profiles_model_guard before insert or update on public.brand_profiles for each row execute function studio.guard_brand_model();

-- ================================================================ 5. schema privado (credenciais)
create schema if not exists studio_private;
revoke all on schema studio_private from public, anon, authenticated;
grant usage on schema studio_private to service_role;

create table if not exists studio_private.meta_apps (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  app_id text,
  app_secret_cipher text,
  ig_app_id text,
  ig_app_secret_cipher text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create table if not exists studio_private.social_credentials (
  account_id uuid primary key references public.social_accounts (id) on delete cascade,
  meta_app_id uuid references studio_private.meta_apps (id) on delete set null,
  token_cipher text not null,
  token_kind public.token_kind not null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz,                        -- null = não expira (system user)
  refreshed_at timestamptz,
  data_access_expires_at timestamptz,
  updated_by uuid references auth.users (id) on delete set null
);

alter table studio_private.meta_apps enable row level security;
alter table studio_private.social_credentials enable row level security;
revoke all on all tables in schema studio_private from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema studio_private to service_role;

drop trigger if exists meta_apps_audit on studio_private.meta_apps;
create trigger meta_apps_audit after insert or update or delete on studio_private.meta_apps for each row execute function studio.audit_redacted();
drop trigger if exists social_credentials_audit on studio_private.social_credentials;
create trigger social_credentials_audit after insert or update or delete on studio_private.social_credentials for each row execute function studio.audit_redacted();

-- O schema privado não é exposto pela API REST. O servidor e o worker o acessam por estas
-- funções, executáveis SOMENTE pela service role.
create or replace function public.social_credential_get(p_account_id uuid)
returns table (account_id uuid, token_cipher text, token_kind public.token_kind, expires_at timestamptz, refreshed_at timestamptz,
               issued_at timestamptz, data_access_expires_at timestamptz, meta_app_id uuid)
language sql stable security definer set search_path = '' as $$
  select c.account_id, c.token_cipher, c.token_kind, c.expires_at, c.refreshed_at, c.issued_at, c.data_access_expires_at, c.meta_app_id
  from studio_private.social_credentials c where c.account_id = p_account_id
$$;

create or replace function public.social_credential_put(p_account_id uuid, p_token_cipher text, p_token_kind public.token_kind,
  p_expires_at timestamptz, p_data_access_expires_at timestamptz, p_meta_app_id uuid, p_actor uuid, p_refreshed boolean default false)
returns void language sql security definer set search_path = '' as $$
  insert into studio_private.social_credentials as c (account_id, token_cipher, token_kind, expires_at, data_access_expires_at, meta_app_id, updated_by, issued_at, refreshed_at)
  values (p_account_id, p_token_cipher, p_token_kind, p_expires_at, p_data_access_expires_at, p_meta_app_id, p_actor, now(), case when p_refreshed then now() end)
  on conflict (account_id) do update set
    token_cipher = excluded.token_cipher, token_kind = excluded.token_kind, expires_at = excluded.expires_at,
    data_access_expires_at = excluded.data_access_expires_at, meta_app_id = excluded.meta_app_id, updated_by = excluded.updated_by,
    issued_at = case when p_refreshed then c.issued_at else now() end,
    refreshed_at = case when p_refreshed then now() else c.refreshed_at end
$$;

create or replace function public.social_credential_delete(p_account_id uuid, p_actor uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update studio_private.social_credentials set updated_by = p_actor where account_id = p_account_id;
  delete from studio_private.social_credentials where account_id = p_account_id;
end $$;

create or replace function public.social_meta_app_get(p_id uuid default null)
returns table (id uuid, label text, app_id text, app_secret_cipher text, ig_app_id text, ig_app_secret_cipher text)
language sql stable security definer set search_path = '' as $$
  select m.id, m.label, m.app_id, m.app_secret_cipher, m.ig_app_id, m.ig_app_secret_cipher
  from studio_private.meta_apps m where p_id is null or m.id = p_id order by m.created_at limit 1
$$;

create or replace function public.social_meta_app_put(p_id uuid, p_label text, p_app_id text, p_app_secret_cipher text,
  p_ig_app_id text, p_ig_app_secret_cipher text, p_actor uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v uuid := coalesce(p_id, gen_random_uuid());
begin
  -- segredo nulo = manter o que já está salvo (campos write-only na tela)
  insert into studio_private.meta_apps as m (id, label, app_id, app_secret_cipher, ig_app_id, ig_app_secret_cipher, updated_by)
  values (v, p_label, p_app_id, p_app_secret_cipher, p_ig_app_id, p_ig_app_secret_cipher, p_actor)
  on conflict (id) do update set
    label = excluded.label, app_id = excluded.app_id, ig_app_id = excluded.ig_app_id, updated_by = excluded.updated_by, updated_at = now(),
    app_secret_cipher = coalesce(p_app_secret_cipher, m.app_secret_cipher),
    ig_app_secret_cipher = coalesce(p_ig_app_secret_cipher, m.ig_app_secret_cipher);
  return v;
end $$;

-- Metadados do app da Meta para a tela de Configurações (sem nenhum segredo). Só admin.
create or replace function public.social_meta_app_status()
returns table (id uuid, label text, app_id text, ig_app_id text, has_app_secret boolean, has_ig_app_secret boolean, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.id, m.label, m.app_id, m.ig_app_id, m.app_secret_cipher is not null, m.ig_app_secret_cipher is not null, m.updated_at
  from studio_private.meta_apps m where studio.is_admin() order by m.created_at
$$;

-- Fila: o worker pega jobs com FOR UPDATE SKIP LOCKED (e retoma travas abandonadas há 15 min).
create or replace function public.social_claim_jobs(p_worker text, p_kinds public.social_job_kind[], p_limit int default 1)
returns setof public.social_jobs
language plpgsql security definer set search_path = '' as $$
begin
  return query
  with picked as (
    select j.id from public.social_jobs j
    where j.kind = any (p_kinds) and j.run_at <= now()
      and (j.status = 'queued' or (j.status = 'running' and j.locked_at < now() - interval '15 minutes'))
      and j.attempts < j.max_attempts
    order by j.run_at
    for update skip locked
    limit greatest(1, least(p_limit, 20))
  )
  update public.social_jobs j set status = 'running', locked_at = now(), locked_by = p_worker, attempts = j.attempts + 1
  from picked where j.id = picked.id
  returning j.*;
end $$;

revoke all on function public.social_credential_get(uuid), public.social_credential_put(uuid, text, public.token_kind, timestamptz, timestamptz, uuid, uuid, boolean),
  public.social_credential_delete(uuid, uuid), public.social_meta_app_get(uuid), public.social_meta_app_put(uuid, text, text, text, text, text, uuid),
  public.social_claim_jobs(text, public.social_job_kind[], int)
  from public, anon, authenticated;
grant execute on function public.social_credential_get(uuid), public.social_credential_put(uuid, text, public.token_kind, timestamptz, timestamptz, uuid, uuid, boolean),
  public.social_credential_delete(uuid, uuid), public.social_meta_app_get(uuid), public.social_meta_app_put(uuid, text, text, text, text, text, uuid),
  public.social_claim_jobs(text, public.social_job_kind[], int)
  to service_role;
revoke all on function public.social_meta_app_status() from public, anon;
grant execute on function public.social_meta_app_status() to authenticated;

-- ================================================================ 6. storage
-- Bucket privado; caminho {entity_slug}/{post_id}/{idx}.{ext}. Leitura só de quem vê a entidade
-- (prévias por URL assinada). Escrita só pelo servidor/worker (uploads do navegador usam
-- URL de upload assinada gerada pelo servidor após checar a permissão).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('social-media', 'social-media', false, 209715200,
        array['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'audio/mpeg', 'audio/wav', 'text/vtt', 'application/x-subrip'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists social_media_read on storage.objects;
create policy social_media_read on storage.objects for select to authenticated
  using (bucket_id = 'social-media' and studio.is_member()
         and studio.can_see_entity((select e.id from public.entities e where e.slug = (storage.foldername(name))[1])));

-- ================================================================ 7. seed · Obra Fácil
-- Voz: marketing/instagram/voice.md e perfil.md do repositório OBRA-FACIL.
insert into public.brand_profiles (entity_id, handle, voice, audience, positions, banned_words, emoji_policy, hashtag_bank,
  max_hashtags, cta_default, link_in_bio, palette, fonts, extra_rules)
select e.id, '@obra.facil.app',
  'Gente da obra falando com gente da obra. Direto, prático, sem jargão de startup. Números de verdade sempre que possível (R$, %, dias). '
  || 'Exemplos de obra real: reforma de cozinha, garagem, fachada, banheiro. Palavras que usamos: orçamento, obra, cliente, prazo, diária, '
  || 'empreita, m², BDI, lucro, cronograma, PDF, WhatsApp. Sem palavrão. Rosto na câmera, quando houver, é o Matheus (fundador, técnico); '
  || 'sem rosto: telas do app + texto grande.',
  'Pedreiros, empreiteiros, mestres de obra, técnicos em edificações, engenheiros e arquitetos autônomos ou de escritório pequeno, '
  || 'que hoje fazem orçamento no caderno, no Excel ou no WhatsApp. O app monta o orçamento com BDI, gera o PDF para o cliente e '
  || 'acompanha a obra pelo cronograma. Plano Gratuito para começar; Básico e Profissional por assinatura no site.',
  array['Material + mão de obra não é preço, é custo. Preço tem BDI.',
        'Orçamento bonito fecha mais obra do que orçamento barato.',
        'Prazo combinado sem cronograma é promessa, não prazo.',
        'O profissional pequeno merece ferramenta de empresa grande, sem pagar por ela como empresa grande.'],
  array['solução inovadora', 'revolucionar', 'alavancar', 'jornada', 'game changer', 'disruptivo'],
  'No máximo um emoji por legenda, como pontuação. Nunca no começo da legenda.',
  array['orcamentodeobra', 'construcaocivil', 'reforma', 'pedreiro', 'empreiteiro', 'mestredeobras', 'bdi', 'cronogramadeobra', 'engenhariacivil', 'obrafacil'],
  5, 'Comece grátis: link na bio.', 'https://obra-facil-r2ms-projects.vercel.app',
  '{"primary":"#C2570C","accent":"#F08A3C","bg":"#141110","text":"#FFFFFF"}', '{"heading":"Inter","body":"Inter"}',
  'Sem link na legenda (link fica na bio). Uma chamada para ação por post. Até 5 hashtags, específicas. '
  || 'Nunca prometer resultado financeiro exato ("ganhe R$ X"); exemplos numéricos são sempre "exemplo". '
  || 'Valores técnicos (BDI, normas) com fonte quando citados (ex.: Acórdão 2622/2013 do TCU). '
  || 'Não vender planos pagos como "compre no app": a assinatura é feita pelo site.'
from public.entities e where e.slug = 'obra-facil'
on conflict (entity_id) do nothing;

insert into public.social_templates (entity_id, format, key, name, is_default)
select e.id, t.format::public.social_format, t.key, t.name, true
from public.entities e,
  (values ('carousel', 'carousel.classic', 'Carrossel clássico'), ('post', 'post.single', 'Post único'),
          ('story', 'story.frames', 'Stories em telas'), ('youtube_thumbnail', 'youtube.thumbnail', 'Miniatura do YouTube')) as t(format, key, name)
where e.slug = 'obra-facil'
on conflict (entity_id, key) do nothing;

-- carrossel terça e quinta às 19h, sempre com revisão
insert into public.content_rules (entity_id, format, weekday, local_time, count)
select e.id, 'carousel', d, '19:00', 1
from public.entities e, unnest(array[2, 4]) as d
where e.slug = 'obra-facil'
  and not exists (select 1 from public.content_rules r where r.entity_id = e.id and r.format = 'carousel' and r.weekday = d);

insert into public.profile_targets (entity_id, desired_name, desired_biography, desired_website)
select e.id, 'Obra Fácil | Orçamento de Obras',
  E'Orçamento com BDI, PDF pro cliente e cronograma da obra no celular.\nFeito pra pedreiro, empreiteiro e técnico.\nComece grátis 👇',
  'https://obra-facil-r2ms-projects.vercel.app'
from public.entities e where e.slug = 'obra-facil'
on conflict (entity_id) do nothing;
