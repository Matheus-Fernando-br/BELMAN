import os from "node:os";
import { createServer } from "node:http";
import { db, log, RetryLater, setPost } from "./db.js";
import type { Job } from "./jobs/brand.js";
import { generateCopy } from "./jobs/generate.js";
import { collectMetrics, planWeek, profileCheck, refreshTokenJob } from "./jobs/maintenance.js";
import { publishPost } from "./jobs/publish.js";
import { renderPost } from "./jobs/render.js";
import { tick } from "./scheduler.js";

// Worker do módulo Redes Sociais: fila (FOR UPDATE SKIP LOCKED via RPC) + agendador (1/min).
// Concorrência: 1 job pesado (render) + N leves.

const WORKER = `${os.hostname()}-${process.pid}`;
const LIGHT = Math.max(1, Number(process.env.WORKER_CONCURRENCY ?? 3));
const HEAVY = 1;
const LIGHT_KINDS = ["generate_copy", "publish", "refresh_token", "collect_metrics", "plan_week", "profile_check"];
const HEAVY_KINDS = ["render"];

const handlers: Record<string, (job: Job) => Promise<unknown>> = {
  generate_copy: generateCopy,
  render: renderPost,
  publish: publishPost,
  refresh_token: refreshTokenJob,
  collect_metrics: collectMetrics,
  plan_week: planWeek,
  profile_check: profileCheck,
};

let stopping = false;
const running = { light: 0, heavy: 0 };

async function finish(job: Job, ok: boolean, result: unknown, error?: Error) {
  if (ok) {
    await db
      .from("social_jobs")
      .update({ status: "done", last_error: null, locked_at: null, payload: { ...job.payload, result: result ?? null } })
      .eq("id", job.id);
    return;
  }
  const retry = error instanceof RetryLater;
  const exhausted = job.attempts >= job.max_attempts;
  if (retry || !exhausted) {
    // backoff exponencial com jitter (ou o atraso pedido)
    const delay = retry ? error.delayMs : Math.min(3600e3, 30_000 * 2 ** (job.attempts - 1)) * (0.5 + Math.random() / 2);
    await db
      .from("social_jobs")
      .update({ status: "queued", run_at: new Date(Date.now() + delay).toISOString(), last_error: error?.message.slice(0, 500), locked_at: null, ...(retry ? { attempts: job.attempts - 1 } : {}) })
      .eq("id", job.id);
    return;
  }
  await db.from("social_jobs").update({ status: "failed", last_error: error?.message.slice(0, 500), locked_at: null }).eq("id", job.id);
  // post vai para "falhou" com o erro legível
  if (job.post_id && ["generate_copy", "render", "publish"].includes(job.kind)) {
    await setPost(job.post_id, { status: "failed", error: error?.message.slice(0, 400) ?? "Falha no worker." }).catch(() => undefined);
  }
}

async function runJob(job: Job, lane: "light" | "heavy") {
  running[lane]++;
  const started = Date.now();
  try {
    const result = await handlers[job.kind](job);
    await finish(job, true, result);
    log("info", "job ok", { id: job.id, kind: job.kind, ms: Date.now() - started });
  } catch (e) {
    const err = e as Error;
    log(err instanceof RetryLater ? "warn" : "error", "job falhou", { id: job.id, kind: job.kind, attempt: job.attempts, error: err.message });
    await finish(job, false, null, err).catch((x) => log("error", "finish falhou", { error: String(x) }));
  } finally {
    running[lane]--;
  }
}

async function claim(kinds: string[], limit: number) {
  if (limit <= 0) return [];
  const { data, error } = await db.rpc("social_claim_jobs", { p_worker: WORKER, p_kinds: kinds, p_limit: limit });
  if (error) {
    log("error", "claim falhou", { error: error.message });
    return [];
  }
  return (data ?? []) as Job[];
}

async function poll() {
  for (const job of await claim(HEAVY_KINDS, HEAVY - running.heavy)) void runJob(job, "heavy");
  for (const job of await claim(LIGHT_KINDS, LIGHT - running.light)) void runJob(job, "light");
}

async function main() {
  const once = process.argv.includes("--once");
  log("info", "worker iniciado", { worker: WORKER, light: LIGHT, heavy: HEAVY, video: process.env.SOCIAL_VIDEO === "1" });
  if (once) {
    await tick();
    await poll();
    while (running.light + running.heavy > 0) await new Promise((r) => setTimeout(r, 500));
    return;
  }
  // saúde (Render pode checar /health se rodar como web service)
  if (process.env.PORT) createServer((_, res) => res.writeHead(200, { "content-type": "text/plain" }).end("ok")).listen(Number(process.env.PORT));
  let lastTick = 0;
  while (!stopping) {
    try {
      if (Date.now() - lastTick >= 60_000) {
        lastTick = Date.now();
        await tick();
      }
      await poll();
    } catch (e) {
      log("error", "loop", { error: (e as Error).message });
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  while (running.light + running.heavy > 0) await new Promise((r) => setTimeout(r, 500));
  log("info", "worker parado");
}

for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => (stopping = true));
main().catch((e) => {
  log("error", "fatal", { error: (e as Error).message });
  process.exit(1);
});
