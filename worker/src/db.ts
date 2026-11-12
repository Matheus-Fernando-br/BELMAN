import { createClient } from "@supabase/supabase-js";

// Cliente com a chave secreta do Supabase (service role): só existe no worker e no servidor web.
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("Configure SUPABASE_URL e SUPABASE_SECRET_KEY.");

export const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
export const BUCKET = "social-media";
export const TZ = process.env.TZ || "America/Sao_Paulo";

export function log(level: "info" | "warn" | "error", msg: string, extra: Record<string, unknown> = {}) {
  // nunca registrar tokens: só ids e mensagens
  console[level === "info" ? "log" : level](JSON.stringify({ t: new Date().toISOString(), level, msg, ...extra }));
}

/** Erro que deve ser tentado de novo mais tarde (limite, rede, mídia ainda processando). */
export class RetryLater extends Error {
  constructor(
    message: string,
    public delayMs = 60_000,
  ) {
    super(message);
  }
}

export async function enqueueOnce(job: { entity_id: string | null; post_id?: string | null; kind: string; payload?: Record<string, unknown>; dedupe_key: string; run_at?: string }) {
  const { data } = await db.from("social_jobs").select("id").eq("dedupe_key", job.dedupe_key).limit(1);
  if (data?.length) return false;
  const { error } = await db.from("social_jobs").insert({ payload: {}, ...job });
  return !error;
}

export async function enqueue(job: { entity_id: string | null; post_id?: string | null; kind: string; payload?: Record<string, unknown>; dedupe_key?: string; run_at?: string }) {
  const { error } = await db.from("social_jobs").insert({ payload: {}, ...job });
  if (error && error.code !== "23505") throw new Error(`Falha ao enfileirar ${job.kind}: ${error.message}`);
}

export async function setPost(id: string, patch: Record<string, unknown>) {
  const { error } = await db.from("social_posts").update(patch).eq("id", id);
  if (error) throw new Error(`Falha ao atualizar o post: ${error.message}`);
}

/** Avisos opcionais no Telegram (mesmo bot do contato), se configurado. */
export async function notify(text: string) {
  const token = process.env.TELEGRAM_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text: `Bellman Studio · ${text}`, disable_web_page_preview: true }),
  }).catch(() => {});
}
