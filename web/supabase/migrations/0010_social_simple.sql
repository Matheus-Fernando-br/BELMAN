-- Redes Sociais simplificado: tudo roda na Vercel (sem worker pago).
-- 1) Chaves de integração (ex.: chave da IA) cifradas no schema privado, coladas pelo Studio.
-- 2) Agendador: Supabase pg_cron + pg_net chamam a Vercel a cada 2 min com um token que
--    só existe no Vault do Supabase (ninguém precisa copiá-lo).

create table if not exists studio_private.integration_secrets (
  name text primary key check (name ~ '^[a-z0-9_]{3,40}$'),
  cipher text not null,
  hint text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
alter table studio_private.integration_secrets enable row level security;
revoke all on studio_private.integration_secrets from public, anon, authenticated;
grant select, insert, update, delete on studio_private.integration_secrets to service_role;
drop trigger if exists integration_secrets_audit on studio_private.integration_secrets;
create trigger integration_secrets_audit after insert or update or delete on studio_private.integration_secrets
  for each row execute function studio.audit_redacted();

create or replace function public.social_secret_get(p_name text) returns text
language sql stable security definer set search_path = '' as $$
  select cipher from studio_private.integration_secrets where name = p_name
$$;

create or replace function public.social_secret_put(p_name text, p_cipher text, p_hint text, p_actor uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_cipher is null then
    update studio_private.integration_secrets set updated_by = p_actor where name = p_name;
    delete from studio_private.integration_secrets where name = p_name;
  else
    insert into studio_private.integration_secrets as s (name, cipher, hint, updated_by) values (p_name, p_cipher, p_hint, p_actor)
    on conflict (name) do update set cipher = excluded.cipher, hint = excluded.hint, updated_by = excluded.updated_by, updated_at = now();
  end if;
end $$;

-- metadados para a tela (sem o valor): só admin
create or replace function public.social_secret_status() returns table (name text, hint text, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.name, s.hint, s.updated_at from studio_private.integration_secrets s where studio.is_admin()
$$;

-- token do agendador: gerado e guardado só no Vault
create or replace function public.social_cron_check(p_token text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'social_cron_token' and decrypted_secret = p_token and length(p_token) >= 32)
$$;

revoke all on function public.social_secret_get(text), public.social_secret_put(text, text, text, uuid), public.social_cron_check(text) from public, anon, authenticated;
grant execute on function public.social_secret_get(text), public.social_secret_put(text, text, text, uuid), public.social_cron_check(text) to service_role;
revoke all on function public.social_secret_status() from public, anon;
grant execute on function public.social_secret_status() to authenticated;

-- regra automática: posts são criados 2 dias antes do horário (sem "plano da semana")
alter table public.content_rules add column if not exists lead_days int not null default 2 check (lead_days between 1 and 7);

do $$ begin
  if not exists (select 1 from vault.secrets where name = 'social_cron_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'social_cron_token', 'Token do agendador de Redes Sociais (Vercel)');
  end if;
end $$;

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- agenda (idempotente): a cada 2 min chama a Vercel; a Vercel responde na hora e trabalha em segundo plano
select cron.unschedule(jobid) from cron.job where jobname = 'social-tick';
select cron.schedule(
  'social-tick',
  '*/2 * * * *',
  $$select net.http_post(
      url := 'https://bellman-tech.vercel.app/api/studio/social/tick',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'social_cron_token')),
      body := '{}'::jsonb,
      timeout_milliseconds := 15000
  )$$
);
