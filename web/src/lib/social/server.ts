import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import { open, seal } from "@shared/social/crypto";
import {
  debugToken,
  detectTokenKind,
  exchangeForLongLived,
  MetaClient,
  MetaError,
  PUBLISH_SCOPES,
  tokenHealth,
  type MetaApp,
  type TokenKind,
} from "@shared/social/meta-client";
import { requireStudio, type Entity } from "@/lib/studio/session";
import { createAdminClient, createClient } from "@/lib/supabase/server";

// Servidor do módulo Redes Sociais (web). Tokens e app secrets só são decifrados aqui ou
// no worker; o navegador recebe apenas metadados.

export const BUCKET = "social-media";

export function admin() {
  const a = createAdminClient();
  if (!a) throw new Error("SUPABASE_SECRET_KEY não configurada no servidor.");
  return a;
}

/** Workspace = entidade ativa que o usuário pode ver (por slug). */
export const requireWorkspace = cache(async (slug: string) => {
  const ctx = await requireStudio();
  const entity = ctx.visible.find((e) => e.slug === slug);
  if (!entity) notFound();
  return { ctx, entity };
});

export type Account = {
  id: string;
  entity_id: string;
  platform: string;
  external_id: string | null;
  username: string | null;
  name: string | null;
  profile_picture_url: string | null;
  biography: string | null;
  website: string | null;
  followers_count: number | null;
  media_count: number | null;
  status: "connected" | "expiring" | "expired" | "error" | "disconnected";
  token_kind: TokenKind | null;
  token_expires_at: string | null;
  scopes: string[];
  last_checked_at: string | null;
  last_error: string | null;
  updated_at: string;
};

export async function loadAccount(entityId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("social_accounts").select("*").eq("entity_id", entityId).eq("platform", "instagram").maybeSingle();
  return data as Account | null;
}

// ---------------------------------------------------------------- app da Meta
export async function loadMetaApp(): Promise<(MetaApp & { id: string }) | null> {
  const { data } = await admin().rpc("social_meta_app_get", { p_id: null });
  const row = (data as { id: string; app_id: string | null; app_secret_cipher: string | null; ig_app_id: string | null; ig_app_secret_cipher: string | null }[] | null)?.[0];
  if (!row) return null;
  return {
    id: row.id,
    appId: row.app_id,
    appSecret: row.app_secret_cipher ? open(row.app_secret_cipher) : null,
    igAppId: row.ig_app_id,
    igAppSecret: row.ig_app_secret_cipher ? open(row.ig_app_secret_cipher) : null,
  };
}

export async function saveMetaApp(input: { id?: string | null; label: string; appId: string | null; appSecret: string | null; igAppId: string | null; igAppSecret: string | null }, actor: string) {
  const { error } = await admin().rpc("social_meta_app_put", {
    p_id: input.id || null,
    p_label: input.label,
    p_app_id: input.appId,
    p_app_secret_cipher: input.appSecret ? seal(input.appSecret) : null,
    p_ig_app_id: input.igAppId,
    p_ig_app_secret_cipher: input.igAppSecret ? seal(input.igAppSecret) : null,
    p_actor: actor,
  });
  if (error) throw new Error("Não foi possível salvar o app da Meta.");
}

// ---------------------------------------------------------------- conexão
export type ConnectResult = { username: string; kind: TokenKind; expiresAt: Date | null; missingPublish: boolean };

/**
 * Fluxo "Cole o token" (admin): detecta o tipo → troca por longa duração → debug_token
 * (escopos, validade, IG user id) → perfil → grava conta + credencial cifrada.
 */
export async function connectInstagram(entity: Entity, rawToken: string, actor: string): Promise<ConnectResult> {
  const token = rawToken.trim().replace(/^Bearer\s+/i, "");
  const detected = detectTokenKind(token);
  if (!detected) throw new Error('Token não reconhecido. Ele começa com "EAA" (login do Facebook) ou "IG" (login do Instagram).');
  const app = await loadMetaApp();

  let kind: TokenKind = detected;
  let longToken = token;
  let expiresAt: Date | null = null;
  let dataAccessExpiresAt: Date | null = null;
  let scopes: string[] = [];
  let igUserId: string | null = null;

  if (detected === "fb_user") {
    if (!app?.appId || !app.appSecret) throw new Error("Cadastre o App ID e o App Secret da Meta em Configurações → Meta antes de conectar.");
    const first = await debugToken(token, app);
    if (!first.isValid) throw new Error("A Meta diz que este token não é válido (vencido ou revogado). Gere outro.");
    if (first.type === "SYSTEM_USER" || !first.expiresAt) {
      kind = "fb_system_user"; // não expira: não troca
    } else {
      const ll = await exchangeForLongLived(token, "fb_user", app).catch(() => null);
      if (ll) longToken = ll.token;
    }
    const info = await debugToken(longToken, app);
    expiresAt = info.expiresAt;
    dataAccessExpiresAt = info.dataAccessExpiresAt;
    scopes = info.scopes;
    igUserId = info.igUserIds[0] ?? null;
    if (!igUserId) throw new Error("O token não tem acesso a nenhuma conta do Instagram. Gere o token marcando a conta e as permissões do Instagram.");
  } else {
    // login do Instagram: sem debug_token; troca (se houver secret) e lê /me
    if (app?.igAppSecret) {
      const ll = await exchangeForLongLived(token, "ig_user", app).catch(() => null);
      if (ll) {
        longToken = ll.token;
        expiresAt = ll.expiresAt;
      }
    }
    const me = await new MetaClient(longToken, "ig_user", "me").me();
    igUserId = me.id;
    expiresAt ??= new Date(Date.now() + 59 * 864e5);
    scopes = ["instagram_business_basic", "instagram_business_content_publish"];
  }

  const profile = await new MetaClient(longToken, kind, igUserId).getProfile();
  const a = admin();
  const now = new Date().toISOString();
  const { data: acc, error } = await a
    .from("social_accounts")
    .upsert(
      {
        entity_id: entity.id,
        platform: "instagram",
        external_id: profile.id || igUserId,
        username: profile.username,
        name: profile.name,
        profile_picture_url: profile.profile_picture_url,
        biography: profile.biography,
        website: profile.website,
        followers_count: profile.followers_count,
        media_count: profile.media_count,
        status: tokenHealth(kind, expiresAt),
        token_kind: kind,
        token_expires_at: expiresAt?.toISOString() ?? null,
        scopes,
        last_checked_at: now,
        last_error: null,
        updated_by: actor,
        created_by: actor,
      },
      { onConflict: "entity_id,platform" },
    )
    .select("id")
    .single();
  if (error || !acc) throw new Error("Não foi possível salvar a conta.");
  const { error: credErr } = await a.rpc("social_credential_put", {
    p_account_id: acc.id,
    p_token_cipher: seal(longToken),
    p_token_kind: kind,
    p_expires_at: expiresAt?.toISOString() ?? null,
    p_data_access_expires_at: dataAccessExpiresAt?.toISOString() ?? null,
    p_meta_app_id: app?.id ?? null,
    p_actor: actor,
    p_refreshed: false,
  });
  if (credErr) throw new Error("Não foi possível guardar o token cifrado.");
  // posts desta entidade passam a usar a conta
  await a.from("social_posts").update({ account_id: acc.id }).eq("entity_id", entity.id).is("account_id", null);
  return { username: profile.username, kind, expiresAt, missingPublish: !scopes.some((s) => PUBLISH_SCOPES.includes(s)) };
}

export async function clientFor(accountId: string) {
  const a = admin();
  const [{ data: acc }, { data: cred }] = await Promise.all([
    a.from("social_accounts").select("id,external_id,token_kind").eq("id", accountId).single(),
    a.rpc("social_credential_get", { p_account_id: accountId }),
  ]);
  const c = (cred as { token_cipher: string; token_kind: TokenKind }[] | null)?.[0];
  if (!acc?.external_id || !c) throw new Error("Conta sem token. Conecte de novo.");
  return new MetaClient(open(c.token_cipher), c.token_kind, acc.external_id);
}

/** "Testar conexão": relê o perfil e atualiza status. */
export async function testConnection(accountId: string, actor: string) {
  const a = admin();
  const { data: acc } = await a.from("social_accounts").select("token_kind,token_expires_at").eq("id", accountId).single();
  try {
    const client = await clientFor(accountId);
    const p = await client.getProfile();
    await a
      .from("social_accounts")
      .update({
        username: p.username,
        name: p.name,
        biography: p.biography,
        website: p.website,
        profile_picture_url: p.profile_picture_url,
        followers_count: p.followers_count,
        media_count: p.media_count,
        status: tokenHealth(acc?.token_kind ?? "fb_user", acc?.token_expires_at ? new Date(acc.token_expires_at) : null),
        last_checked_at: new Date().toISOString(),
        last_error: null,
        updated_by: actor,
      })
      .eq("id", accountId);
    return { ok: true, message: `Conexão ok com @${p.username}.` };
  } catch (e) {
    const msg = e instanceof MetaError ? e.message : (e as Error).message;
    await a
      .from("social_accounts")
      .update({ status: e instanceof MetaError && e.tokenInvalid ? "expired" : "error", last_error: msg.slice(0, 300), last_checked_at: new Date().toISOString(), updated_by: actor })
      .eq("id", accountId);
    return { ok: false, message: msg };
  }
}

export async function disconnectAccount(accountId: string, actor: string) {
  const a = admin();
  await a.rpc("social_credential_delete", { p_account_id: accountId, p_actor: actor });
  await a.from("social_accounts").update({ status: "disconnected", token_expires_at: null, last_error: null, updated_by: actor }).eq("id", accountId);
}

// ---------------------------------------------------------------- fila e mídia
export type JobKind = "generate_copy" | "render" | "publish" | "refresh_token" | "collect_metrics" | "plan_week" | "profile_check";

export async function enqueue(job: { entity_id: string; post_id?: string | null; kind: JobKind; payload?: Record<string, unknown>; dedupe_key?: string; run_at?: string; created_by?: string | null }) {
  const { error } = await admin()
    .from("social_jobs")
    .insert({ payload: {}, ...job });
  // 23505 = já existe um job igual na fila: tudo certo
  if (error && error.code !== "23505") throw new Error("Não foi possível enfileirar o trabalho.");
}

export async function signedUrls(paths: string[], seconds = 600) {
  if (!paths.length) return new Map<string, string>();
  const { data } = await admin().storage.from(BUCKET).createSignedUrls(paths, seconds);
  return new Map((data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path as string, d.signedUrl as string]));
}

export async function signedUpload(path: string) {
  const { data, error } = await admin().storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true });
  if (error || !data) throw new Error("Não foi possível preparar o envio.");
  return data.signedUrl;
}
