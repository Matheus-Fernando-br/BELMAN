import { open, seal } from "@shared/social/crypto";
import { MetaClient, type MetaApp, type TokenKind } from "@shared/social/meta-client";
import { db } from "./db.js";

export type Credential = { token: string; kind: TokenKind; expiresAt: Date | null; issuedAt: Date; refreshedAt: Date | null; metaAppId: string | null };

export async function credential(accountId: string): Promise<Credential | null> {
  const { data } = await db.rpc("social_credential_get", { p_account_id: accountId });
  const c = (data as { token_cipher: string; token_kind: TokenKind; expires_at: string | null; issued_at: string; refreshed_at: string | null; meta_app_id: string | null }[] | null)?.[0];
  if (!c) return null;
  return {
    token: open(c.token_cipher),
    kind: c.token_kind,
    expiresAt: c.expires_at ? new Date(c.expires_at) : null,
    issuedAt: new Date(c.issued_at),
    refreshedAt: c.refreshed_at ? new Date(c.refreshed_at) : null,
    metaAppId: c.meta_app_id,
  };
}

export async function saveRefreshed(accountId: string, cred: Credential, token: string, expiresAt: Date | null) {
  const { error } = await db.rpc("social_credential_put", {
    p_account_id: accountId,
    p_token_cipher: seal(token),
    p_token_kind: cred.kind,
    p_expires_at: expiresAt?.toISOString() ?? null,
    p_data_access_expires_at: null,
    p_meta_app_id: cred.metaAppId,
    p_actor: null,
    p_refreshed: true,
  });
  if (error) throw new Error("Falha ao salvar o token renovado.");
}

export async function metaApp(): Promise<MetaApp | null> {
  const { data } = await db.rpc("social_meta_app_get", { p_id: null });
  const r = (data as { app_id: string | null; app_secret_cipher: string | null; ig_app_id: string | null; ig_app_secret_cipher: string | null }[] | null)?.[0];
  if (!r) return null;
  return { appId: r.app_id, appSecret: r.app_secret_cipher ? open(r.app_secret_cipher) : null, igAppId: r.ig_app_id, igAppSecret: r.ig_app_secret_cipher ? open(r.ig_app_secret_cipher) : null };
}

export async function clientFor(accountId: string) {
  const { data: acc } = await db.from("social_accounts").select("id,entity_id,external_id,status,username").eq("id", accountId).maybeSingle();
  if (!acc?.external_id) throw new Error("Conta sem id do Instagram. Conecte de novo.");
  const cred = await credential(accountId);
  if (!cred) throw new Error("Conta sem token. Conecte em Redes Sociais → Conexão.");
  return { acc, cred, client: new MetaClient(cred.token, cred.kind, acc.external_id) };
}

/** Erro 190: token inválido → conta expirada + alerta. */
export async function markExpired(accountId: string, message: string) {
  await db.from("social_accounts").update({ status: "expired", last_error: message.slice(0, 300), last_checked_at: new Date().toISOString() }).eq("id", accountId);
}
