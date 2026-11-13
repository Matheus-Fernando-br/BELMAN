"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { normalizeHashtags } from "@shared/social/lint";
import { nextFreeSlot, zonedTime, type Rule } from "@shared/social/schedule";
import { putSecret } from "@/lib/social/engine/secrets";
import { tick } from "@/lib/social/engine/tick";
import { admin, BUCKET, connectInstagram, disconnectAccount, enqueue, requireWorkspace, testConnection } from "@/lib/social/server";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error?: string; message?: string } | undefined;

const UUID = /^[0-9a-f-]{36}$/;
const TYPES = ["prova", "ensino", "opiniao", "historia", "oferta"];
const TZ = "America/Sao_Paulo";
const str = (f: FormData, k: string, max = 2000) => String(f.get(k) ?? "").trim().slice(0, max);
const base = (slug: string) => `/studio/social/${slug}`;
const fail = (e: unknown): ActionState => ({ error: (e as Error).message || "Algo deu errado." });
/** Processa a fila logo depois da resposta (sem esperar o agendador de 2 min). */
const kick = () => after(() => tick({ schedule: false, budgetMs: 280_000 }).catch(() => undefined));

async function writable(slug: string) {
  const w = await requireWorkspace(slug);
  if (!w.ctx.canWrite) throw new Error("Seu acesso é somente leitura.");
  return w;
}

async function ownPost(slug: string, id: string) {
  const w = await writable(slug);
  if (!UUID.test(id)) throw new Error("Post inválido.");
  const supabase = await createClient();
  const { data } = await supabase.from("social_posts").select("*").eq("id", id).eq("entity_id", w.entity.id).maybeSingle();
  if (!data) throw new Error("Post não encontrado.");
  return { ...w, post: data, supabase };
}

// ================================================================ Conexão (Sócio/Admin)
export async function connectAction(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { ctx, entity } = await requireWorkspace(slug);
  if (!ctx.isAdmin) return { error: "Somente Sócio/Admin conecta o Instagram." };
  const token = String(form.get("token") ?? "");
  if (token.trim().length < 40) return { error: "Cole o token completo." };
  try {
    const igId = str(form, "ig_id", 30);
    if (igId && !/^\d{5,25}$/.test(igId)) return { error: "O ID da conta do Instagram tem só números." };
    const r = await connectInstagram(entity, token, ctx.profile.id, igId || null);
    revalidatePath(base(slug), "layout");
    const until = r.expiresAt ? `Vale até ${r.expiresAt.toLocaleDateString("pt-BR", { timeZone: TZ })}.` : "Esse token não expira.";
    return { message: `Conectado a @${r.username}. ${until}${r.missingPublish ? " Atenção: falta a permissão de publicar (instagram_content_publish)." : ""}` };
  } catch (e) {
    return fail(e);
  }
}

export async function testConnectionAction(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { ctx } = await requireWorkspace(slug);
  if (!ctx.isAdmin) return { error: "Somente Sócio/Admin." };
  const r = await testConnection(String(form.get("account_id")), ctx.profile.id);
  revalidatePath(base(slug), "layout");
  return r.ok ? { message: r.message } : { error: r.message };
}

export async function disconnectAction(slug: string, form: FormData) {
  const { ctx } = await requireWorkspace(slug);
  if (!ctx.isAdmin) return;
  const id = String(form.get("account_id"));
  if (!UUID.test(id)) return;
  await disconnectAccount(id, ctx.profile.id);
  revalidatePath(base(slug), "layout");
}

export async function saveAiKey(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { ctx } = await requireWorkspace(slug);
  if (!ctx.isAdmin) return { error: "Somente Sócio/Admin." };
  const key = str(form, "key", 300);
  if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key)) return { error: 'A chave da Anthropic começa com "sk-ant-".' };
  try {
    await putSecret("anthropic_api_key", key, ctx.profile.id);
  } catch (e) {
    return fail(e);
  }
  revalidatePath(base(slug), "layout");
  return { message: "Chave da IA salva (cifrada)." };
}

// ================================================================ Posts
export async function createPost(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  let id: string;
  try {
    const { ctx, entity } = await writable(slug);
    const theme = str(form, "theme", 300);
    const fmt = str(form, "format", 20) === "post" ? "post" : "carousel";
    const date = str(form, "date", 10);
    const time = str(form, "time", 5) || "19:00";
    const at = /^\d{4}-\d{2}-\d{2}$/.test(date) ? zonedTime(date, time, TZ) : null;
    const size = Number(form.get("images") ?? 0);
    const a = admin();
    const { data: account } = await a.from("social_accounts").select("id").eq("entity_id", entity.id).eq("platform", "instagram").maybeSingle();
    const { data: post, error } = await a
      .from("social_posts")
      .insert({
        entity_id: entity.id,
        account_id: account?.id ?? null,
        format: fmt,
        theme: theme || null,
        status: "generating",
        scheduled_at: at?.toISOString() ?? null,
        copy: fmt === "carousel" && size >= 4 && size <= 10 ? { _size: size } : {},
        created_by: ctx.profile.id,
      })
      .select("id")
      .single();
    if (error || !post) return { error: "Não foi possível criar o post." };
    await enqueue({ entity_id: entity.id, post_id: post.id, kind: "generate_copy", payload: { purpose: "post" }, dedupe_key: `copy:${post.id}`, created_by: ctx.profile.id });
    id = post.id;
  } catch (e) {
    return fail(e);
  }
  kick();
  redirect(`${base(slug)}/post/${id}`);
}

export async function editPost(slug: string, id: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { ctx, post, supabase, entity } = await ownPost(slug, id);
    if (["publishing", "published"].includes(post.status)) return { error: "Post já publicado não pode ser editado." };
    const { data: brand } = await supabase.from("brand_profiles").select("max_hashtags").eq("entity_id", entity.id).maybeSingle();
    const caption = String(form.get("caption") ?? "").replace(/\r\n/g, "\n").trim();
    const hashtags = normalizeHashtags(String(form.get("hashtags") ?? "").split(/[\s,]+/), brand?.max_hashtags ?? 5);
    if (caption.length + hashtags.join(" ").length > 2200) return { error: "Legenda acima de 2.200 caracteres." };
    let copy = post.copy;
    const rawCopy = form.get("copy");
    if (rawCopy) {
      try {
        copy = JSON.parse(String(rawCopy));
      } catch {
        return { error: "Texto das imagens inválido." };
      }
    }
    const imagesChanged = JSON.stringify(copy) !== JSON.stringify(post.copy);
    const { error } = await supabase.from("social_posts").update({ caption, hashtags, copy, revision: post.revision + 1, error: null }).eq("id", id);
    if (error) return { error: "Não foi possível salvar." };
    if (imagesChanged) {
      // texto das imagens mudou: redesenha (sem IA) e volta para revisão
      await admin().from("social_posts").update({ status: "rendering" }).eq("id", id);
      await enqueue({ entity_id: post.entity_id, post_id: id, kind: "render", payload: { reason: "edit" }, dedupe_key: `render:${id}`, created_by: ctx.profile.id });
      kick();
    }
    revalidatePath(`${base(slug)}/post/${id}`);
    return { message: imagesChanged ? "Salvo. Redesenhando as imagens (leva alguns segundos)." : "Legenda salva." };
  } catch (e) {
    return fail(e);
  }
}

export async function redoPost(slug: string, id: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { ctx, post } = await ownPost(slug, id);
    if (["publishing", "published"].includes(post.status)) return { error: "Post já publicado." };
    const instruction = str(form, "instruction", 500);
    if (instruction.length < 3) return { error: "Diga o que mudar." };
    await admin().from("social_posts").update({ status: "generating", error: null }).eq("id", id);
    await enqueue({ entity_id: post.entity_id, post_id: id, kind: "generate_copy", payload: { purpose: "redo", instruction }, dedupe_key: `copy:${id}`, created_by: ctx.profile.id });
    kick();
    revalidatePath(`${base(slug)}/post/${id}`);
    return { message: "Refazendo com a sua instrução." };
  } catch (e) {
    return fail(e);
  }
}

export async function approvePost(slug: string, id: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { post, supabase, entity } = await ownPost(slug, id);
    if (!["review", "failed", "approved", "scheduled"].includes(post.status)) return { error: "O post ainda está sendo preparado." };
    const { data: assets } = await supabase.from("social_assets").select("kind").eq("post_id", id).eq("kind", "image");
    if (!assets?.length) return { error: "O post ainda não tem imagens." };
    const when = str(form, "when", 10);
    let at: Date | null;
    if (when === "now") at = new Date();
    else if (when === "next") {
      const [{ data: rules }, { data: taken }] = await Promise.all([
        supabase.from("content_rules").select("*").eq("entity_id", entity.id).eq("active", true),
        supabase.from("social_posts").select("scheduled_at").eq("entity_id", entity.id).in("status", ["approved", "scheduled"]).not("scheduled_at", "is", null),
      ]);
      at = nextFreeSlot((rules ?? []) as Rule[], (taken ?? []).map((t) => new Date(t.scheduled_at as string)), new Date());
      if (!at) return { error: "Não há horário no Automático. Escolha data e hora." };
    } else {
      const date = str(form, "date", 10);
      const time = str(form, "time", 5);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return { error: "Escolha data e hora." };
      at = zonedTime(date, time, TZ);
      if (at.getTime() < Date.now() - 60_000) return { error: "Esse horário já passou." };
    }
    const { error } = await supabase.from("social_posts").update({ status: "scheduled", scheduled_at: at.toISOString(), error: null }).eq("id", id);
    if (error) return { error: "Não foi possível aprovar." };
    if (when === "now") after(() => tick({ budgetMs: 280_000 }).catch(() => undefined));
    revalidatePath(base(slug), "layout");
    return { message: when === "now" ? "Aprovado. Publicando em instantes." : `Aprovado para ${at.toLocaleString("pt-BR", { timeZone: TZ, dateStyle: "short", timeStyle: "short" })}.` };
  } catch (e) {
    return fail(e);
  }
}

export async function setStatus(slug: string, id: string, form: FormData) {
  const { post, supabase } = await ownPost(slug, id);
  const to = String(form.get("to"));
  if (to === "rejected" && ["review", "failed", "approved", "scheduled", "draft"].includes(post.status)) {
    await supabase.from("social_posts").update({ status: "rejected" }).eq("id", id);
  } else if (to === "review" && ["approved", "scheduled", "rejected", "failed"].includes(post.status)) {
    await supabase.from("social_posts").update({ status: "review", approved_by: null, approved_at: null }).eq("id", id);
  }
  revalidatePath(base(slug), "layout");
}

export async function deletePost(slug: string, id: string) {
  const { post, supabase } = await ownPost(slug, id);
  if (["publishing", "published"].includes(post.status)) return;
  const { data: assets } = await supabase.from("social_assets").select("storage_path").eq("post_id", id);
  await supabase.from("social_posts").delete().eq("id", id);
  const paths = (assets ?? []).map((a) => a.storage_path);
  if (paths.length) await admin().storage.from(BUCKET).remove(paths);
  revalidatePath(base(slug), "layout");
  redirect(base(slug));
}

export async function reschedule(slug: string, id: string, isoAt: string): Promise<ActionState> {
  try {
    const { post, supabase } = await ownPost(slug, id);
    if (!["approved", "scheduled", "review"].includes(post.status)) return { error: "Este post não pode mudar de data." };
    const at = new Date(isoAt);
    if (Number.isNaN(at.getTime()) || at.getTime() < Date.now() - 60_000) return { error: "Escolha um horário futuro." };
    await supabase.from("social_posts").update({ scheduled_at: at.toISOString() }).eq("id", id);
    revalidatePath(`${base(slug)}/calendario`);
    return { message: "Data alterada." };
  } catch (e) {
    return fail(e);
  }
}

// ================================================================ Automático
export async function saveAutomation(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { entity } = await writable(slug);
    const on = form.get("on") === "on";
    const days = form.getAll("weekday").map(Number).filter((d) => d >= 0 && d <= 6);
    const time = str(form, "time", 5);
    const fmt = str(form, "format", 20) === "post" ? "post" : "carousel";
    const review = form.get("review") !== "off";
    const lead = Math.min(7, Math.max(1, Number(form.get("lead_days") ?? 2) || 2));
    const imagesN = Number(form.get("images") ?? 0);
    const images = fmt === "carousel" && imagesN >= 4 && imagesN <= 10 ? imagesN : null;
    if (on && !days.length) return { error: "Escolha pelo menos um dia." };
    if (on && !/^\d{2}:\d{2}$/.test(time)) return { error: "Escolha o horário." };
    const supabase = await createClient();
    // a configuração simples substitui as regras da marca
    await supabase.from("content_rules").delete().eq("entity_id", entity.id);
    if (days.length) {
      const { error } = await supabase.from("content_rules").insert(
        days.map((weekday) => ({ entity_id: entity.id, format: fmt, weekday, local_time: time, count: 1, mix_types: TYPES, auto_generate: on, require_review: review, lead_days: lead, images, active: true })),
      );
      if (error) return { error: "Não foi possível salvar." };
    }
    revalidatePath(base(slug), "layout");
    return {
      message: on
        ? `Automático ligado. Cada post é criado ${lead} dia(s) antes${review ? " e espera a sua aprovação" : " e publica sozinho no horário"}.`
        : "Automático desligado. Os horários continuam valendo para “próximo horário livre”.",
    };
  } catch (e) {
    return fail(e);
  }
}

export async function saveBrand(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { entity } = await writable(slug);
    const list = (k: string) =>
      String(form.get(k) ?? "")
        .split(/\n|;/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 40);
    const color = (k: string, d: string) => {
      const v = str(form, k, 7);
      return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : d;
    };
    const supabase = await createClient();
    const { error } = await supabase.from("brand_profiles").upsert(
      {
        entity_id: entity.id,
        handle: str(form, "handle", 40) || null,
        voice: str(form, "voice", 3000) || null,
        audience: str(form, "audience", 2000) || null,
        banned_words: list("banned_words").map((w) => w.toLowerCase()),
        hashtag_bank: normalizeHashtags(list("hashtag_bank"), 40).map((h) => h.slice(1)),
        cta_default: str(form, "cta_default", 200) || null,
        extra_rules: str(form, "extra_rules", 3000) || null,
        palette: { primary: color("primary", "#000000"), accent: color("accent", "#FFFFFF"), bg: color("bg", "#000000"), text: "#FFFFFF" },
      },
      { onConflict: "entity_id" },
    );
    if (error) return { error: "Não foi possível salvar." };
    revalidatePath(base(slug), "layout");
    return { message: "Estilo da marca salvo." };
  } catch (e) {
    return fail(e);
  }
}

export async function retryPost(slug: string, id: string) {
  const { ctx, post } = await ownPost(slug, id);
  if (post.status !== "failed") return;
  const hasCopy = post.copy && Object.keys(post.copy).length > 1;
  await admin().from("social_posts").update({ status: hasCopy ? "rendering" : "generating", error: null }).eq("id", id);
  await enqueue({ entity_id: post.entity_id, post_id: id, kind: hasCopy ? "render" : "generate_copy", payload: { purpose: "post" }, dedupe_key: `${hasCopy ? "render" : "copy"}:${id}`, created_by: ctx.profile.id });
  kick();
  revalidatePath(`${base(slug)}/post/${id}`);
}
