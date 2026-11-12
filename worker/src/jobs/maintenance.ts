import { MetaError, refreshToken, shouldRefresh, tokenHealth, withBackoff } from "@shared/social/meta-client";
import { alternateTypes, nextWeekRange, slotsBetween, type Rule } from "@shared/social/schedule";
import { planThemes } from "../ai.js";
import { db, enqueue, notify, TZ } from "../db.js";
import { clientFor, credential, markExpired, saveRefreshed } from "../meta.js";
import { loadBrand, logUsage, type Job } from "./brand.js";

/** Diário: renova ig_user (> 50 dias), avisa fb_user 10 dias antes, confere system user. */
export async function refreshTokenJob(job: Job) {
  const accountId = String(job.payload.account_id ?? "");
  const { data: acc } = await db.from("social_accounts").select("*").eq("id", accountId).maybeSingle();
  if (!acc || acc.status === "disconnected") return { skipped: "sem conta" };
  const cred = await credential(accountId);
  if (!cred) return { skipped: "sem token" };
  const now = new Date();
  let expiresAt = cred.expiresAt;
  try {
    if (shouldRefresh(cred.kind, cred.refreshedAt ?? cred.issuedAt, cred.expiresAt)) {
      const r = await withBackoff(() => refreshToken(cred.token, cred.kind));
      if (r) {
        await saveRefreshed(accountId, cred, r.token, r.expiresAt);
        expiresAt = r.expiresAt;
      }
    }
    // checagem de validade (1×/dia para todos os tipos)
    const { client } = await clientFor(accountId);
    await client.getProfile();
    const status = tokenHealth(cred.kind, expiresAt, now.getTime());
    await db.from("social_accounts").update({ status, token_expires_at: expiresAt?.toISOString() ?? null, last_checked_at: now.toISOString(), last_error: null }).eq("id", accountId);
    if (status === "expiring" && acc.status !== "expiring") {
      await notify(`O token do Instagram de @${acc.username} vence em breve. Gere um token de System User (não expira) e cole em Conexão.`);
    }
    return { status };
  } catch (e) {
    if (e instanceof MetaError && e.tokenInvalid) {
      await markExpired(accountId, e.message);
      await notify(`Token do Instagram expirado (@${acc.username}). Troque em Redes Sociais → Conexão.`);
      return { status: "expired" };
    }
    await db.from("social_accounts").update({ status: "error", last_error: (e as Error).message.slice(0, 300), last_checked_at: now.toISOString() }).eq("id", accountId);
    throw e;
  }
}

/** Métricas de um post publicado (métrica indisponível vira null). */
export async function collectMetrics(job: Job) {
  const { data: post } = await db.from("social_posts").select("id,entity_id,account_id,external_media_id,format").eq("id", job.post_id!).maybeSingle();
  if (!post?.external_media_id || !post.account_id) return { skipped: "sem mídia" };
  const { client } = await clientFor(post.account_id);
  const ids = String(post.external_media_id).split(",");
  const metrics = post.format === "story" ? ["reach", "views", "shares", "total_interactions"] : ["reach", "views", "likes", "comments", "saved", "shares", "total_interactions"];
  const sum: Record<string, number | null> = {};
  const raw: Record<string, unknown> = {};
  for (const id of ids) {
    const m = await withBackoff(() => client.getMediaInsights(id, metrics));
    raw[id] = m;
    for (const [k, v] of Object.entries(m)) if (v != null) sum[k] = (sum[k] ?? 0) + v;
  }
  await db.from("social_metrics").insert({
    post_id: post.id,
    entity_id: post.entity_id,
    reach: sum.reach ?? null,
    views: sum.views ?? null,
    likes: sum.likes ?? null,
    comments: sum.comments ?? null,
    saves: sum.saved ?? null,
    shares: sum.shares ?? null,
    raw,
  });
  return sum;
}

/** A cada 6 h: relê o perfil e marca o alvo como aplicado quando bater. */
export async function profileCheck(job: Job) {
  if (!job.entity_id) return { skipped: "sem entidade" };
  const { data: acc } = await db.from("social_accounts").select("*").eq("entity_id", job.entity_id).eq("platform", "instagram").maybeSingle();
  if (!acc || acc.status === "disconnected") return { skipped: "sem conta" };
  const { client } = await clientFor(acc.id);
  const p = await withBackoff(() => client.getProfile());
  const photoChanged = Boolean(acc.profile_picture_url && p.profile_picture_url && acc.profile_picture_url.split("?")[0] !== p.profile_picture_url.split("?")[0]);
  await db
    .from("social_accounts")
    .update({ username: p.username, name: p.name, biography: p.biography, website: p.website, profile_picture_url: p.profile_picture_url, followers_count: p.followers_count, media_count: p.media_count, last_checked_at: new Date().toISOString() })
    .eq("id", acc.id);
  const { data: t } = await db.from("profile_targets").select("*").eq("entity_id", job.entity_id).maybeSingle();
  if (!t) return { checked: true };
  const same = (a?: string | null, b?: string | null) => !a || (b ?? "").trim().replace(/\/$/, "") === a.trim().replace(/\/$/, "");
  const textOk = same(t.desired_name, p.name) && same(t.desired_biography, p.biography) && same(t.desired_website, p.website);
  const photoOk = !t.desired_photo_path || photoChanged || t.status === "applied";
  const status = textOk && photoOk ? "applied" : "pending";
  await db.from("profile_targets").update({ status, checked_at: new Date().toISOString() }).eq("entity_id", job.entity_id);
  return { status };
}

/** Domingo 18h: 1 chamada de IA gera os temas da semana para todos os slots das regras com geração automática. */
export async function planWeek(job: Job) {
  if (!job.entity_id) return { skipped: "sem entidade" };
  const manual = Boolean(job.payload.manual);
  const { data: rules } = await db.from("content_rules").select("*").eq("entity_id", job.entity_id).eq("active", true);
  const auto = ((rules ?? []) as (Rule & { id: string; mix_types: string[]; require_review: boolean; auto_generate: boolean })[]).filter((r) => manual || r.auto_generate);
  if (!auto.length) return { skipped: "nenhuma regra com geração automática" };
  const { from, to } = nextWeekRange(new Date(), TZ);
  const slots = slotsBetween(auto, from, to);
  // pula horários que já têm post
  const { data: taken } = await db.from("social_posts").select("scheduled_at").eq("entity_id", job.entity_id).gte("scheduled_at", from.toISOString()).lt("scheduled_at", to.toISOString()).neq("status", "rejected");
  const takenSet = new Set((taken ?? []).map((t) => new Date(t.scheduled_at as string).getTime()));
  const free = slots.filter((s) => !takenSet.has(s.at.getTime()));
  if (!free.length) return { skipped: "semana já planejada" };
  const { data: lastPost } = await db.from("social_posts").select("post_type").eq("entity_id", job.entity_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  let prev = lastPost?.post_type ?? null;
  const typed = free.map((s) => {
    const t = alternateTypes(1, (s.rule as unknown as { mix_types: string[] }).mix_types, prev)[0];
    prev = t;
    return { ...s, post_type: t };
  });
  const { profile } = await loadBrand(job.entity_id);
  const { data: recent } = await db.from("social_posts").select("theme").eq("entity_id", job.entity_id).not("theme", "is", null).order("created_at", { ascending: false }).limit(20);
  const plan = await planThemes(
    profile,
    typed.map((s) => ({ format: s.rule.format, post_type: s.post_type, when: s.at.toLocaleString("pt-BR", { timeZone: TZ, weekday: "long", hour: "2-digit", minute: "2-digit" }) })),
    (recent ?? []).map((r) => r.theme as string),
  );
  await logUsage(job.entity_id, null, "plan_week", plan.usage);
  const { data: account } = await db.from("social_accounts").select("id").eq("entity_id", job.entity_id).eq("platform", "instagram").maybeSingle();
  let created = 0;
  for (const [i, s] of typed.entries()) {
    const th = plan.themes[i];
    if (!th) break;
    const rule = s.rule as unknown as { id: string; require_review: boolean };
    const { data: post } = await db
      .from("social_posts")
      .insert({
        entity_id: job.entity_id,
        account_id: account?.id ?? null,
        rule_id: rule.id,
        format: s.rule.format,
        theme: th.theme,
        post_type: th.post_type,
        status: "generating",
        scheduled_at: s.at.toISOString(),
        require_review: rule.require_review,
      })
      .select("id")
      .single();
    if (!post) continue;
    await enqueue({ entity_id: job.entity_id, post_id: post.id, kind: "generate_copy", payload: { purpose: "post" }, dedupe_key: `copy:${post.id}` });
    created++;
  }
  if (created) await notify(`${created} post(s) da próxima semana em produção. Eles aparecem na Revisão quando ficarem prontos.`);
  return { created };
}
