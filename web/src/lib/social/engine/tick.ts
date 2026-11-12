import "server-only";
import { alternateTypes, duePosts, localDate, metricCheckpoints, metricsDue, slotsBetween, type Rule } from "@shared/social/schedule";
import Anthropic from "@anthropic-ai/sdk";
import { MetaError } from "@shared/social/meta-client";
import { enqueue, enqueueOnce, Fatal, log, RetryLater, sb, setPost, TZ } from "./db";
import type { Job } from "./brand";
import { monthlyCosts } from "./finance";
import { generateCopy } from "./generate";
import { collectMetrics, refreshTokenJob } from "./maintenance";
import { publishPost } from "./publish";
import { renderPost } from "./render";

// Agendador + fila. Chamado pelo Supabase (pg_cron, a cada 2 min) e logo depois de ações no Studio.

const handlers: Record<string, (job: Job) => Promise<unknown>> = {
  publish: publishPost,
  render: renderPost,
  generate_copy: generateCopy,
  refresh_token: refreshTokenJob,
  collect_metrics: collectMetrics,
};
// ordem de prioridade: publicar > desenhar > escrever > manutenção
const ORDER = ["publish", "render", "generate_copy", "refresh_token", "collect_metrics"];

type RuleRow = Rule & { id: string; entity_id: string; mix_types: string[]; require_review: boolean; auto_generate: boolean; lead_days: number };

/** Cria os posts automáticos que vencem nos próximos dias (cada um N dias antes do horário). */
async function autoCreate(now: Date) {
  const { data: rules } = await sb().from("content_rules").select("*").eq("active", true).eq("auto_generate", true);
  let created = 0;
  for (const rule of (rules ?? []) as RuleRow[]) {
    const slots = slotsBetween([rule], new Date(now.getTime() + 30 * 60_000), new Date(now.getTime() + rule.lead_days * 864e5));
    for (const s of slots) {
      const key = `auto:${rule.id}:${s.at.toISOString()}`;
      const { data: exists } = await sb().from("social_jobs").select("id").eq("dedupe_key", key).limit(1);
      if (exists?.length) continue;
      const { data: last } = await sb().from("social_posts").select("post_type").eq("entity_id", rule.entity_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      const { data: account } = await sb().from("social_accounts").select("id").eq("entity_id", rule.entity_id).eq("platform", "instagram").maybeSingle();
      const { data: post } = await sb()
        .from("social_posts")
        .insert({
          entity_id: rule.entity_id,
          account_id: account?.id ?? null,
          rule_id: rule.id,
          format: rule.format,
          post_type: alternateTypes(1, rule.mix_types, last?.post_type)[0],
          status: "generating",
          scheduled_at: s.at.toISOString(),
          require_review: rule.require_review,
        })
        .select("id")
        .single();
      if (!post) continue;
      await enqueue({ entity_id: rule.entity_id, post_id: post.id, kind: "generate_copy", payload: { purpose: "post", auto: true }, dedupe_key: key });
      created++;
    }
  }
  return created;
}

export async function schedule(now = new Date()) {
  const db = sb();
  // publicar: aprovados/agendados até agora + 2 min (nunca sem aprovação quando exigida)
  const { data: posts } = await db
    .from("social_posts")
    .select("id,entity_id,status,scheduled_at,require_review,approved_at,account_id")
    .in("status", ["approved", "scheduled"])
    .lte("scheduled_at", new Date(now.getTime() + 2 * 60_000).toISOString())
    .limit(50);
  for (const p of duePosts(posts ?? [], now)) await enqueueOnce({ entity_id: p.entity_id, post_id: p.id, kind: "publish", dedupe_key: `publish:${p.id}:${p.scheduled_at}` });

  await autoCreate(now);

  const today = localDate(now, TZ);
  await monthlyCosts(now).catch((e) => log("error", "custos do mês", { error: (e as Error).message }));
  // tokens: 1×/dia
  const { data: accs } = await db.from("social_accounts").select("id,entity_id").neq("status", "disconnected");
  for (const a of accs ?? []) await enqueueOnce({ entity_id: a.entity_id, kind: "refresh_token", payload: { account_id: a.id }, dedupe_key: `refresh:${a.id}:${today}` });

  // métricas: 24 h, 72 h, 7 dias e semanal até 30 dias
  const { data: published } = await db.from("social_posts").select("id,entity_id,published_at").eq("status", "published").gte("published_at", new Date(now.getTime() - 31 * 864e5).toISOString());
  if (published?.length) {
    const { data: last } = await db.from("social_metrics").select("post_id,collected_at").in("post_id", published.map((p) => p.id)).order("collected_at", { ascending: false });
    const lastOf = new Map<string, string>();
    for (const m of last ?? []) if (!lastOf.has(m.post_id)) lastOf.set(m.post_id, m.collected_at);
    for (const p of published) {
      const pub = new Date(p.published_at);
      if (!metricsDue(pub, lastOf.has(p.id) ? new Date(lastOf.get(p.id)!) : null, now)) continue;
      await enqueueOnce({ entity_id: p.entity_id, post_id: p.id, kind: "collect_metrics", dedupe_key: `metrics:${p.id}:${metricCheckpoints(pub).filter((c) => c <= now).length}` });
    }
  }
}

async function finish(job: Job, ok: boolean, result: unknown, error?: Error) {
  const db = sb();
  if (ok) {
    await db.from("social_jobs").update({ status: "done", last_error: null, locked_at: null, payload: { ...job.payload, result: result ?? null } }).eq("id", job.id);
    return;
  }
  const retry = error instanceof RetryLater;
  // não adianta repetir: falta configuração, chave inválida, token vencido, recusa…
  const fatal = error instanceof Fatal || error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError || error instanceof Anthropic.BadRequestError || (error instanceof MetaError && !error.retryable);
  if (!fatal && (retry || job.attempts < job.max_attempts)) {
    const delay = retry ? error.delayMs : Math.min(3600e3, 30_000 * 2 ** (job.attempts - 1)) * (0.5 + Math.random() / 2);
    await db
      .from("social_jobs")
      .update({ status: "queued", run_at: new Date(Date.now() + delay).toISOString(), last_error: error?.message.slice(0, 500), locked_at: null, ...(retry ? { attempts: job.attempts - 1 } : {}) })
      .eq("id", job.id);
    return;
  }
  await db.from("social_jobs").update({ status: "failed", last_error: error?.message.slice(0, 500), locked_at: null }).eq("id", job.id);
  if (job.post_id && ["generate_copy", "render", "publish"].includes(job.kind)) await setPost(job.post_id, { status: "failed", error: error?.message.slice(0, 400) ?? "Falhou." }).catch(() => undefined);
}

/** Processa a fila até acabar o tempo. Um job por vez, na ordem de prioridade. */
export async function processQueue(budgetMs = 240_000, worker = "vercel") {
  const start = Date.now();
  let done = 0;
  while (Date.now() - start < budgetMs - 90_000) {
    let job: Job | null = null;
    for (const kind of ORDER) {
      const { data } = await sb().rpc("social_claim_jobs", { p_worker: worker, p_kinds: [kind], p_limit: 1 });
      job = ((data ?? []) as Job[])[0] ?? null;
      if (job) break;
    }
    if (!job) break;
    try {
      const result = await handlers[job.kind](job);
      await finish(job, true, result);
      log("info", "job ok", { kind: job.kind, id: job.id });
    } catch (e) {
      log("warn", "job falhou", { kind: job.kind, id: job.id, error: (e as Error).message });
      await finish(job, false, null, e as Error).catch(() => undefined);
    }
    done++;
  }
  return done;
}

export async function tick(opts: { schedule?: boolean; budgetMs?: number } = {}) {
  if (opts.schedule !== false) await schedule().catch((e) => log("error", "agendador", { error: (e as Error).message }));
  return processQueue(opts.budgetMs);
}
