-- Bellman Studio · Fase 0 · núcleo: entidades, perfis, permissões, auditoria e trava de login.
-- Idempotente o bastante para ser reaplicada em um banco vazio. Toda tabela tem RLS.

create schema if not exists studio;
revoke all on schema studio from public, anon;
grant usage on schema studio to authenticated, service_role;

-- ---------------------------------------------------------------- tipos
do $$ begin
  create type public.studio_role as enum ('admin', 'collaborator', 'viewer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.entity_kind as enum ('holding', 'product', 'shared');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- utilitários
create or replace function studio.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if auth.uid() is not null then
    new.updated_by := auth.uid();
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- entidades (donos dos registros)
create table if not exists public.entities (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null check (char_length(name) between 2 and 60),
  kind public.entity_kind not null,
  color text not null default '#000000' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  description text,
  site_url text,
  admin_url text,
  metrics_url text,
  sort_order int not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

-- ---------------------------------------------------------------- perfis e acesso
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text,
  role public.studio_role not null default 'viewer',
  all_entities boolean not null default true,
  active boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create table if not exists public.user_entity_access (
  user_id uuid not null references public.profiles (id) on delete cascade,
  entity_id uuid not null references public.entities (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  primary key (user_id, entity_id)
);

-- Convites: o papel definido no convite é aplicado quando a pessoa aceita.
create table if not exists public.invitations (
  email text primary key check (email = lower(email)),
  role public.studio_role not null default 'viewer',
  all_entities boolean not null default true,
  entity_ids uuid[] not null default '{}',
  invited_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

-- Primeiro(s) administrador(es) do sistema.
create table if not exists studio.bootstrap_admins (
  email text primary key check (email = lower(email))
);

-- ---------------------------------------------------------------- funções de permissão
create or replace function studio.my_role() returns public.studio_role
language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p where p.id = auth.uid() and p.active
$$;

create or replace function studio.is_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.active)
$$;

create or replace function studio.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(studio.my_role() = 'admin', false)
$$;

create or replace function studio.can_write() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(studio.my_role() in ('admin', 'collaborator'), false)
$$;

-- Números sensíveis do financeiro: só Sócio/Admin.
create or replace function studio.can_see_finance() returns boolean
language sql stable security definer set search_path = '' as $$
  select studio.is_admin()
$$;

-- Quem está limitado a produtos vê os seus produtos e o que é Compartilhado.
create or replace function studio.can_see_entity(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active
      and (
        p.role = 'admin'
        or p.all_entities
        or exists (select 1 from public.user_entity_access a where a.user_id = p.id and a.entity_id = target)
        or exists (select 1 from public.entities e where e.id = target and e.kind = 'shared')
      )
  )
$$;

grant execute on function studio.my_role(), studio.is_member(), studio.is_admin(), studio.can_write(),
  studio.can_see_finance(), studio.can_see_entity(uuid) to authenticated;

-- ---------------------------------------------------------------- novo usuário -> perfil
create or replace function studio.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  inv public.invitations;
  is_boot boolean;
  r public.studio_role := 'viewer';
  all_e boolean := true;
  act boolean := false; -- sem convite: entra desativado até um Sócio/Admin liberar
begin
  select * into inv from public.invitations where email = lower(new.email);
  select exists (select 1 from studio.bootstrap_admins b where b.email = lower(new.email)) into is_boot;

  if is_boot then
    r := 'admin';
    act := true;
  elsif inv.email is not null then
    r := inv.role;
    all_e := inv.all_entities;
    act := true;
  end if;

  insert into public.profiles (id, email, full_name, role, all_entities, active)
  values (new.id, lower(new.email), coalesce(new.raw_user_meta_data ->> 'full_name', null), r, all_e, act)
  on conflict (id) do nothing;

  if inv.email is not null then
    insert into public.user_entity_access (user_id, entity_id, created_by)
    select new.id, unnest(inv.entity_ids), inv.invited_by
    on conflict do nothing;
    update public.invitations set accepted_at = now() where email = inv.email;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function studio.handle_new_user();

-- ---------------------------------------------------------------- proteção dos campos de permissão
create or replace function studio.guard_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.role, new.all_entities, new.active, new.email) is distinct from
     (old.role, old.all_entities, old.active, old.email)
     and not studio.is_admin() then
    raise exception 'Apenas Sócio/Admin altera papel, acesso ou status.' using errcode = '42501';
  end if;
  -- Nunca deixar o sistema sem um administrador ativo.
  if old.role = 'admin' and old.active and (new.role <> 'admin' or not new.active)
     and not exists (select 1 from public.profiles p where p.role = 'admin' and p.active and p.id <> old.id) then
    raise exception 'É preciso manter pelo menos um Sócio/Admin ativo.' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function studio.guard_profile();

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function studio.touch_updated_at();

drop trigger if exists entities_touch on public.entities;
create trigger entities_touch before update on public.entities
  for each row execute function studio.touch_updated_at();

-- ---------------------------------------------------------------- auditoria
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id text,
  action text not null check (action in ('insert', 'update', 'delete')),
  actor uuid,
  actor_email text,
  at timestamptz not null default now(),
  old_data jsonb,
  new_data jsonb
);
create index if not exists audit_log_record_idx on public.audit_log (table_name, record_id, at desc);
create index if not exists audit_log_at_idx on public.audit_log (at desc);

create or replace function studio.audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  rec jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into public.audit_log (table_name, record_id, action, actor, actor_email, old_data, new_data)
  values (
    tg_table_name,
    coalesce(rec ->> 'id', rec ->> 'email', rec ->> 'user_id'),
    lower(tg_op),
    auth.uid(),
    (select p.email from public.profiles p where p.id = auth.uid()),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['entities', 'profiles', 'user_entity_access', 'invitations'] loop
    execute format('drop trigger if exists %I_audit on public.%I', t, t);
    execute format('create trigger %I_audit after insert or update or delete on public.%I
                    for each row execute function studio.audit()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------- trava de tentativas de login
create table if not exists studio.login_attempts (
  id bigint generated always as identity primary key,
  email text not null,
  success boolean not null,
  at timestamptz not null default now()
);
create index if not exists login_attempts_email_idx on studio.login_attempts (email, at desc);

-- 5 falhas em 15 minutos bloqueiam a conta por 15 minutos.
create or replace function public.studio_login_locked_until(p_email text) returns timestamptz
language sql stable security definer set search_path = '' as $$
  with recent as (
    select at from studio.login_attempts
    where email = lower(p_email) and not success and at > now() - interval '15 minutes'
      and at > coalesce((select max(at) from studio.login_attempts
                         where email = lower(p_email) and success), '-infinity')
    order by at desc
  )
  select case when count(*) >= 5 then max(at) + interval '15 minutes' end from recent
$$;

create or replace function public.studio_record_login(p_email text, p_success boolean) returns void
language sql volatile security definer set search_path = '' as $$
  insert into studio.login_attempts (email, success) values (lower(left(p_email, 254)), p_success);
  delete from studio.login_attempts where at < now() - interval '30 days';
$$;

revoke all on function public.studio_login_locked_until(text), public.studio_record_login(text, boolean) from public;
-- O login roda no servidor com a chave pública (papel anon) antes de existir sessão.
grant execute on function public.studio_login_locked_until(text), public.studio_record_login(text, boolean) to anon, authenticated;

-- ---------------------------------------------------------------- RLS
alter table public.entities enable row level security;
alter table public.profiles enable row level security;
alter table public.user_entity_access enable row level security;
alter table public.invitations enable row level security;
alter table public.audit_log enable row level security;
alter table studio.bootstrap_admins enable row level security;
alter table studio.login_attempts enable row level security;

revoke all on public.entities, public.profiles, public.user_entity_access, public.invitations, public.audit_log from anon;

drop policy if exists entities_select on public.entities;
create policy entities_select on public.entities for select to authenticated using (studio.is_member());
drop policy if exists entities_admin_write on public.entities;
create policy entities_admin_write on public.entities for insert to authenticated with check (studio.is_admin());
drop policy if exists entities_admin_update on public.entities;
create policy entities_admin_update on public.entities for update to authenticated
  using (studio.is_admin()) with check (studio.is_admin());

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or studio.is_member());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or studio.is_admin()) with check (id = auth.uid() or studio.is_admin());

drop policy if exists access_select on public.user_entity_access;
create policy access_select on public.user_entity_access for select to authenticated
  using (user_id = auth.uid() or studio.is_admin());
drop policy if exists access_admin on public.user_entity_access;
create policy access_admin on public.user_entity_access for all to authenticated
  using (studio.is_admin()) with check (studio.is_admin());

drop policy if exists invitations_admin on public.invitations;
create policy invitations_admin on public.invitations for all to authenticated
  using (studio.is_admin()) with check (studio.is_admin());

drop policy if exists audit_admin_read on public.audit_log;
create policy audit_admin_read on public.audit_log for select to authenticated using (studio.is_admin());
revoke insert, update, delete on public.audit_log from authenticated;

-- ---------------------------------------------------------------- dados iniciais
insert into public.entities (slug, name, kind, color, description, site_url, admin_url, sort_order) values
  ('bellman', 'Bellman', 'holding', '#000000', 'Holding', 'https://bellman-tech.vercel.app', null, 10),
  ('finc', 'FINC', 'product', '#00914C', 'Gestão financeira e fiscal', 'https://finc-seven.vercel.app', 'https://finc-seven.vercel.app/admin', 20),
  ('obra-facil', 'Obra Fácil', 'product', '#C2570C', 'Gestão para a construção civil', 'https://obra-facil-r2ms-projects.vercel.app', 'https://obra-facil-api.onrender.com/admin', 30),
  ('compartilhado', 'Compartilhado', 'shared', '#777777', 'Custos e itens divididos entre a Bellman e os produtos', null, null, 90)
on conflict (slug) do nothing;

insert into studio.bootstrap_admins (email) values ('bellman.adm@gmail.com') on conflict do nothing;

-- Função automática do Supabase (habilita RLS em tabelas novas): não precisa ser chamável pela API.
do $$ begin
  revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
exception when undefined_function then null; end $$;
