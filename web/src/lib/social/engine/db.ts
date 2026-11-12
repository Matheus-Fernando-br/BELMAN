import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";

// Acesso com a chave secreta do Supabase (service role), só no servidor.
export const BUCKET = "social-media";
export const TZ = "America/Sao_Paulo";

let client: SupabaseClient | null = null;
export function sb() {
  if (client) return client;
  const c = createAdminClient();
  if (!c) throw new Error("SUPABASE_SECRET_KEY não configurada no servidor.");
  client = c;
  return c;
}

export function log(level: "info" | "warn" | "error", msg: string, extra: Record<string, unknown> = {}) {
  // nunca registrar tokens: só ids e mensagens
  console[level === "info" ? "log" : level](JSON.stringify({ t: new Date().toISOString(), level, msg, ...extra }));
}

/** Erro para tentar de novo mais tarde (limite, rede, mídia processando). */
export class RetryLater extends Error {
  constructor(
    message: string,
    public delayMs = 60_000,
  ) {
    super(message);
  }
}

/** Erro que não adianta repetir (falta configuração, sem permissão…): falha na hora com mensagem clara. */
export class Fatal extends Error {}

export type JobInput = { entity_id: string | null; post_id?: string | null; kind: string; payload?: Record<string, unknown>; dedupe_key?: string; run_at?: string; created_by?: string | null };

export async function enqueue(job: JobInput) {
  const { error } = await sb().from("social_jobs").insert({ payload: {}, ...job });
  if (error && error.code !== "23505") throw new Error(`Falha ao enfileirar ${job.kind}.`);
}

/** Enfileira só se nunca existiu um job com essa chave (sobrevive a reinícios). */
export async function enqueueOnce(job: JobInput & { dedupe_key: string }) {
  const { data } = await sb().from("social_jobs").select("id").eq("dedupe_key", job.dedupe_key).limit(1);
  if (data?.length) return false;
  const { error } = await sb().from("social_jobs").insert({ payload: {}, ...job });
  return !error;
}

export async function setPost(id: string, patch: Record<string, unknown>) {
  const { error } = await sb().from("social_posts").update(patch).eq("id", id);
  if (error) throw new Error(`Falha ao atualizar o post: ${error.message}`);
}
