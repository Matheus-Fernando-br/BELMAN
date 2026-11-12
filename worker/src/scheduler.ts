import { duePosts, localDate, localWeekday, metricCheckpoints, metricsDue } from "@shared/social/schedule";
import { db, enqueueOnce, log, TZ } from "./db.js";
import { monthlyCosts } from "./finance.js";

// Roda a cada minuto. Cada tarefa tem chave de deduplicação persistente (sobrevive a reinícios).

function localHM(now: Date) {
  return now.toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
}

export async function tick(now = new Date()) {
  let queued = 0;
  // 1) publicação: aprovados/agendados até agora + 2 min (nunca sem aprovação quando exigida)
  const { data: posts } = await db
    .from("social_posts")
    .select("id,entity_id,status,scheduled_at,require_review,approved_at,account_id")
    .in("status", ["approved", "scheduled"])
    .lte("scheduled_at", new Date(now.getTime() + 2 * 60_000).toISOString())
    .not("format", "in", "(youtube_video,youtube_thumbnail)")
    .limit(50);
  for (const p of duePosts(posts ?? [], now)) {
    if (await enqueueOnce({ entity_id: p.entity_id, post_id: p.id, kind: "publish", dedupe_key: `publish:${p.id}:${p.scheduled_at}` })) queued++;
  }

  const today = localDate(now, TZ);
  const hm = localHM(now);

  // 2) tokens: 1×/dia (03h local)
  if (hm >= "03:00") {
    const { data: accs } = await db.from("social_accounts").select("id,entity_id").neq("status", "disconnected");
    for (const a of accs ?? []) if (await enqueueOnce({ entity_id: a.entity_id, kind: "refresh_token", payload: { account_id: a.id }, dedupe_key: `refresh:${a.id}:${today}` })) queued++;
  }

  // 3) métricas: 24 h, 72 h, 7 dias e semanal até 30 dias
  const { data: published } = await db.from("social_posts").select("id,entity_id,published_at").eq("status", "published").gte("published_at", new Date(now.getTime() - 31 * 864e5).toISOString());
  if (published?.length) {
    const { data: last } = await db.from("social_metrics").select("post_id,collected_at").in("post_id", published.map((p) => p.id)).order("collected_at", { ascending: false });
    const lastOf = new Map<string, string>();
    for (const m of last ?? []) if (!lastOf.has(m.post_id)) lastOf.set(m.post_id, m.collected_at);
    for (const p of published) {
      const pub = new Date(p.published_at);
      if (!metricsDue(pub, lastOf.has(p.id) ? new Date(lastOf.get(p.id)!) : null, now)) continue;
      const idx = metricCheckpoints(pub).filter((c) => c <= now).length;
      if (await enqueueOnce({ entity_id: p.entity_id, post_id: p.id, kind: "collect_metrics", dedupe_key: `metrics:${p.id}:${idx}` })) queued++;
    }
  }

  // 4) plano da semana: domingo 18h, para quem tem regra com geração automática
  if (localWeekday(now, TZ) === 0 && hm >= "18:00") {
    const { data: rules } = await db.from("content_rules").select("entity_id").eq("active", true).eq("auto_generate", true);
    for (const e of new Set((rules ?? []).map((r) => r.entity_id))) if (await enqueueOnce({ entity_id: e, kind: "plan_week", dedupe_key: `plan:${e}:${today}` })) queued++;
  }

  // 5) perfil: a cada 6 h, para alvos pendentes
  const block = Math.floor(now.getTime() / (6 * 3600e3));
  const { data: targets } = await db.from("profile_targets").select("entity_id").eq("status", "pending");
  for (const t of targets ?? []) if (await enqueueOnce({ entity_id: t.entity_id, kind: "profile_check", dedupe_key: `profile:${t.entity_id}:${block}` })) queued++;

  // 6) custo do mês anterior (IA + worker) no Financeiro, a partir do dia 1 às 04h
  if (hm >= "04:00") await monthlyCosts(now).catch((e) => log("error", "custos", { error: (e as Error).message }));

  if (queued) log("info", "agendador", { queued });
  return queued;
}
