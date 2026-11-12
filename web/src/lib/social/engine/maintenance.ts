import "server-only";
import { MetaError, refreshToken, shouldRefresh, tokenHealth, withBackoff } from "@shared/social/meta-client";
import { sb } from "./db";
import { clientFor, credential, markExpired, saveRefreshed } from "./meta";
import type { Job } from "./brand";

/** Diário: confere o token; renova sozinho os do login do Instagram; marca "vencendo" 10 dias antes. */
export async function refreshTokenJob(job: Job) {
  const accountId = String(job.payload.account_id ?? "");
  const { data: acc } = await sb().from("social_accounts").select("*").eq("id", accountId).maybeSingle();
  if (!acc || acc.status === "disconnected") return { skipped: "sem conta" };
  const cred = await credential(accountId);
  if (!cred) return { skipped: "sem token" };
  let expiresAt = cred.expiresAt;
  try {
    if (shouldRefresh(cred.kind, cred.refreshedAt ?? cred.issuedAt, cred.expiresAt)) {
      const r = await withBackoff(() => refreshToken(cred.token, cred.kind));
      if (r) {
        await saveRefreshed(accountId, cred, r.token, r.expiresAt);
        expiresAt = r.expiresAt;
      }
    }
    const { client } = await clientFor(accountId);
    const p = await client.getProfile();
    const status = tokenHealth(cred.kind, expiresAt);
    await sb()
      .from("social_accounts")
      .update({ status, token_expires_at: expiresAt?.toISOString() ?? null, followers_count: p.followers_count, media_count: p.media_count, profile_picture_url: p.profile_picture_url, last_checked_at: new Date().toISOString(), last_error: null })
      .eq("id", accountId);
    return { status };
  } catch (e) {
    if (e instanceof MetaError && e.tokenInvalid) {
      await markExpired(accountId, e.message);
      return { status: "expired" };
    }
    await sb().from("social_accounts").update({ status: "error", last_error: (e as Error).message.slice(0, 300), last_checked_at: new Date().toISOString() }).eq("id", accountId);
    throw e;
  }
}

/** Métricas de um post publicado (o que não existir para o formato vira null). */
export async function collectMetrics(job: Job) {
  const { data: post } = await sb().from("social_posts").select("id,entity_id,account_id,external_media_id,format").eq("id", job.post_id!).maybeSingle();
  if (!post?.external_media_id || !post.account_id) return { skipped: "sem mídia" };
  const { client } = await clientFor(post.account_id);
  const metrics = post.format === "story" ? ["reach", "views", "shares", "total_interactions"] : ["reach", "views", "likes", "comments", "saved", "shares", "total_interactions"];
  const sum: Record<string, number> = {};
  const raw: Record<string, unknown> = {};
  for (const id of String(post.external_media_id).split(",")) {
    const m = await withBackoff(() => client.getMediaInsights(id, metrics));
    raw[id] = m;
    for (const [k, v] of Object.entries(m)) if (v != null) sum[k] = (sum[k] ?? 0) + v;
  }
  await sb().from("social_metrics").insert({ post_id: post.id, entity_id: post.entity_id, reach: sum.reach ?? null, views: sum.views ?? null, likes: sum.likes ?? null, comments: sum.comments ?? null, saves: sum.saved ?? null, shares: sum.shares ?? null, raw });
  return sum;
}
