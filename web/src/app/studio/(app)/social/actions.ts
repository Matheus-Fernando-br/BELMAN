"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { lintCaption, normalizeHashtags } from "@shared/social/lint";
import { nextFreeSlot, zonedTime, type Rule } from "@shared/social/schedule";
import {
  admin,
  BUCKET,
  connectInstagram,
  disconnectAccount,
  enqueue,
  requireWorkspace,
  saveMetaApp,
  signedUpload,
  testConnection,
} from "@/lib/social/server";
import { requireAdmin } from "@/lib/studio/session";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error?: string; message?: string } | undefined;

const UUID = /^[0-9a-f-]{36}$/;
const FORMATS = ["post", "carousel", "reel", "story", "youtube_video", "youtube_thumbnail"];
const TYPES = ["prova", "ensino", "opiniao", "historia", "oferta"];
const str = (f: FormData, k: string, max = 2000) => String(f.get(k) ?? "").trim().slice(0, max);
const base = (slug: string) => `/studio/social/${slug}`;

async function writable(slug: string) {
  const w = await requireWorkspace(slug);
  if (!w.ctx.canWrite) throw new Error("Seu acesso é somente leitura.");
  return w;
}

/** Carrega o post pelo cliente do usuário (RLS garante que ele vê a entidade). */
async function ownPost(slug: string, id: string) {
  const w = await writable(slug);
  if (!UUID.test(id)) throw new Error("Post inválido.");
  const supabase = await createClient();
  const { data } = await supabase.from("social_posts").select("*").eq("id", id).eq("entity_id", w.entity.id).maybeSingle();
  if (!data) throw new Error("Post não encontrado.");
  return { ...w, post: data, supabase };
}

const fail = (e: unknown): ActionState => ({ error: (e as Error).message || "Algo deu errado." });

// ================================================================ Configurações → Meta (admin)
export async function saveMetaAppAction(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireAdmin();
  const appId = str(form, "app_id", 40);
  const igAppId = str(form, "ig_app_id", 40);
  if (appId && !/^\d{5,25}$/.test(appId)) return { error: "App ID deve ter só números." };
  if (igAppId && !/^\d{5,25}$/.test(igAppId)) return { error: "Instagram App ID deve ter só números." };
  const appSecret = str(form, "app_secret", 100) || null;
  const igAppSecret = str(form, "ig_app_secret", 100) || null;
  if (appSecret && !/^[a-f0-9]{32}$/i.test(appSecret)) return { error: "App Secret tem 32 caracteres (0-9, a-f)." };
  if (igAppSecret && !/^[a-f0-9]{32}$/i.test(igAppSecret)) return { error: "Instagram App Secret tem 32 caracteres (0-9, a-f)." };
  try {
    await saveMetaApp({ id: str(form, "id", 40) || null, label: str(form, "label", 60) || "Bellman Studio", appId: appId || null, appSecret, igAppId: igAppId || null, igAppSecret }, ctx.profile.id);
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/studio/configuracoes/meta");
  return { message: "App da Meta salvo. Os segredos ficam cifrados e não voltam para a tela." };
}

// ================================================================ Conexão (admin)
export async function connectAction(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { ctx, entity } = await requireWorkspace(slug);
  if (!ctx.isAdmin) return { error: "Somente Sócio/Admin conecta contas." };
  const token = String(form.get("token") ?? "");
  if (token.length < 40) return { error: "Cole o token de acesso completo." };
  try {
    const r = await connectInstagram(entity, token, ctx.profile.id);
    revalidatePath(base(slug), "layout");
    return {
      message: `Conectado a @${r.username}.${r.missingPublish ? " Atenção: falta a permissão de publicação (instagram_content_publish)." : ""}`,
    };
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

// ================================================================ Perfil
export async function saveProfileTarget(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { entity } = await writable(slug);
    const name = str(form, "desired_name", 64);
    const bio = String(form.get("desired_biography") ?? "").replace(/\r\n/g, "\n").trim();
    const site = str(form, "desired_website", 300);
    if ([...bio].length > 150) return { error: `A bio tem ${[...bio].length} caracteres (máximo 150).` };
    if (site && !/^https:\/\/[^\s]+$/.test(site)) return { error: "O site precisa começar com https://" };
    const supabase = await createClient();
    const { error } = await supabase
      .from("profile_targets")
      .upsert({ entity_id: entity.id, desired_name: name || null, desired_biography: bio || null, desired_website: site || null, status: "pending" }, { onConflict: "entity_id" });
    if (error) return { error: "Não foi possível salvar." };
    revalidatePath(`${base(slug)}/perfil`);
    return { message: "Alvo do perfil salvo. Aplique no Instagram e o Studio confere sozinho a cada 6 h." };
  } catch (e) {
    return fail(e);
  }
}

export async function profileUploadUrl(slug: string, kind: "photo" | "logo" | "library", ext: string) {
  const { entity } = await writable(slug);
  const e = ext.toLowerCase().replace(/[^a-z0-9]/g, "");
  const allowed = kind === "library" ? ["mp4", "mp3", "wav", "png", "jpg", "jpeg"] : ["png", "jpg", "jpeg"];
  if (!allowed.includes(e)) throw new Error("Tipo de arquivo não permitido.");
  const folder = kind === "photo" ? "profile" : kind === "logo" ? "brand" : "library";
  const path = `${entity.slug}/${folder}/${randomUUID()}.${e}`;
  return { path, url: await signedUpload(path) };
}

function checkPath(slug: string, path: string, folder: string) {
  if (!new RegExp(`^${slug}/${folder}/[0-9a-f-]{36}\\.[a-z0-9]{2,4}$`).test(path)) throw new Error("Arquivo inválido.");
}

export async function setProfilePhoto(slug: string, path: string): Promise<ActionState> {
  try {
    const { entity } = await writable(slug);
    checkPath(entity.slug, path, "profile");
    const supabase = await createClient();
    await supabase.from("profile_targets").upsert({ entity_id: entity.id, desired_photo_path: path, status: "pending" }, { onConflict: "entity_id" });
    revalidatePath(`${base(slug)}/perfil`);
    return { message: "Foto desejada salva." };
  } catch (e) {
    return fail(e);
  }
}

export async function suggestBio(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { ctx, entity } = await writable(slug);
    await enqueue({ entity_id: entity.id, kind: "generate_copy", payload: { purpose: "bio", hint: str(form, "hint", 300) }, created_by: ctx.profile.id, dedupe_key: `bio:${entity.id}` });
    revalidatePath(`${base(slug)}/perfil`);
    return { message: "Pedimos 3 sugestões de bio à IA. Elas aparecem aqui em instantes." };
  } catch (e) {
    return fail(e);
  }
}

export async function profileCheckNow(slug: string) {
  const { ctx, entity } = await writable(slug);
  await enqueue({ entity_id: entity.id, kind: "profile_check", created_by: ctx.profile.id, dedupe_key: `profile:${entity.id}` });
  revalidatePath(`${base(slug)}/perfil`);
}

// ================================================================ Marca e acervo
export async function saveBrand(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { ctx, entity } = await writable(slug);
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
    const maxTags = Math.min(5, Math.max(0, Number(form.get("max_hashtags") ?? 5) || 0));
    const row: Record<string, unknown> = {
      entity_id: entity.id,
      handle: str(form, "handle", 40) || null,
      voice: str(form, "voice", 3000) || null,
      audience: str(form, "audience", 2000) || null,
      positions: list("positions"),
      banned_words: list("banned_words").map((w) => w.toLowerCase()),
      emoji_policy: str(form, "emoji_policy", 300) || null,
      hashtag_bank: normalizeHashtags(list("hashtag_bank"), 40).map((h) => h.slice(1)),
      max_hashtags: maxTags,
      cta_default: str(form, "cta_default", 200) || null,
      link_in_bio: str(form, "link_in_bio", 300) || null,
      palette: { primary: color("primary", "#000000"), accent: color("accent", "#FFFFFF"), bg: color("bg", "#000000"), text: color("text", "#FFFFFF") },
      fonts: { heading: form.get("font_heading") === "Manrope" ? "Manrope" : "Inter", body: form.get("font_body") === "Manrope" ? "Manrope" : "Inter" },
      extra_rules: str(form, "extra_rules", 3000) || null,
    };
    const model = str(form, "ai_model", 60);
    if (ctx.isAdmin && /^claude-[a-z0-9.-]+$/.test(model)) row.ai_model = model;
    const supabase = await createClient();
    const { error } = await supabase.from("brand_profiles").upsert(row, { onConflict: "entity_id" });
    if (error) return { error: error.code === "42501" ? "Só Sócio/Admin altera o modelo de IA." : "Não foi possível salvar." };
    revalidatePath(base(slug), "layout");
    return { message: "Perfil de marca salvo. Os próximos posts já usam estas regras." };
  } catch (e) {
    return fail(e);
  }
}

export async function setLogo(slug: string, path: string): Promise<ActionState> {
  try {
    const { entity } = await writable(slug);
    checkPath(entity.slug, path, "brand");
    const supabase = await createClient();
    const { error } = await supabase.from("brand_profiles").update({ logo_path: path }).eq("entity_id", entity.id);
    if (error) return { error: "Salve o perfil de marca antes do logo." };
    revalidatePath(base(slug), "layout");
    return { message: "Logo salvo." };
  } catch (e) {
    return fail(e);
  }
}

export async function addLibraryItem(slug: string, input: { path: string; kind: string; title: string; license: string }): Promise<ActionState> {
  try {
    const { entity } = await writable(slug);
    checkPath(entity.slug, input.path, "library");
    if (!["music", "screen_recording", "logo", "photo"].includes(input.kind)) return { error: "Tipo inválido." };
    if (input.kind === "music" && input.license.trim().length < 3) return { error: "Música só entra com a licença registrada (de onde veio e se permite uso comercial)." };
    const supabase = await createClient();
    const { error } = await supabase
      .from("media_library")
      .insert({ entity_id: entity.id, kind: input.kind, title: input.title.slice(0, 120) || null, storage_path: input.path, license_note: input.license.slice(0, 500) || null });
    if (error) return { error: "Não foi possível registrar o arquivo." };
    revalidatePath(`${base(slug)}/acervo`);
    return { message: "Arquivo adicionado ao acervo." };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteLibraryItem(slug: string, form: FormData) {
  const { entity } = await writable(slug);
  const id = String(form.get("id"));
  if (!UUID.test(id)) return;
  const supabase = await createClient();
  const { data } = await supabase.from("media_library").delete().eq("id", id).eq("entity_id", entity.id).select("storage_path").maybeSingle();
  if (data?.storage_path) await admin().storage.from(BUCKET).remove([data.storage_path]);
  revalidatePath(`${base(slug)}/acervo`);
}

// ================================================================ Criar (Tema → post)
export async function createPost(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  let id: string;
  try {
    const { ctx, entity } = await writable(slug);
    const theme = str(form, "theme", 300);
    if (theme.length < 3) return { error: "Escreva o tema do post." };
    const fmt = str(form, "format", 30);
    const type = str(form, "post_type", 20);
    const template = str(form, "template_key", 60);
    if (fmt !== "auto" && !FORMATS.includes(fmt)) return { error: "Formato inválido." };
    if (type && !TYPES.includes(type)) return { error: "Tipo inválido." };
    const a = admin();
    const { data: account } = await a.from("social_accounts").select("id").eq("entity_id", entity.id).eq("platform", "instagram").maybeSingle();
    const { data: post, error } = await a
      .from("social_posts")
      .insert({
        entity_id: entity.id,
        account_id: account?.id ?? null,
        format: fmt === "auto" ? "carousel" : fmt,
        theme,
        post_type: type || null,
        template_key: template || null,
        status: "generating",
        created_by: ctx.profile.id,
      })
      .select("id")
      .single();
    if (error || !post) return { error: "Não foi possível criar o post." };
    await enqueue({
      entity_id: entity.id,
      post_id: post.id,
      kind: "generate_copy",
      payload: { purpose: "post", auto_format: fmt === "auto" },
      dedupe_key: `copy:${post.id}`,
      created_by: ctx.profile.id,
    });
    id = post.id;
  } catch (e) {
    return fail(e);
  }
  redirect(`${base(slug)}/post/${id}`);
}

// ================================================================ Revisão
export async function editPost(slug: string, id: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { ctx, post, supabase, entity } = await ownPost(slug, id);
    if (["publishing", "published"].includes(post.status)) return { error: "Post já publicado não pode ser editado." };
    const { data: brand } = await supabase.from("brand_profiles").select("max_hashtags,banned_words").eq("entity_id", entity.id).maybeSingle();
    const caption = String(form.get("caption") ?? "").replace(/\r\n/g, "\n").trim();
    const hashtags = normalizeHashtags(String(form.get("hashtags") ?? "").split(/[\s,]+/), brand?.max_hashtags ?? 5);
    const alt = String(form.get("alt_texts") ?? "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 10);
    let copy = post.copy;
    const rawCopy = form.get("copy");
    if (rawCopy) {
      try {
        copy = JSON.parse(String(rawCopy));
      } catch {
        return { error: "Texto dos slides inválido." };
      }
    }
    if (caption.length + hashtags.join(" ").length > 2200) return { error: "Legenda acima de 2.200 caracteres." };
    const { error } = await supabase
      .from("social_posts")
      .update({ caption, hashtags, alt_texts: alt, copy, revision: post.revision + 1, status: "review", error: null })
      .eq("id", id);
    if (error) return { error: "Não foi possível salvar." };
    // re-render SEM IA
    await admin().from("social_posts").update({ status: "rendering" }).eq("id", id);
    await enqueue({ entity_id: post.entity_id, post_id: id, kind: "render", payload: { reason: "edit" }, dedupe_key: `render:${id}`, created_by: ctx.profile.id });
    const issues = lintCaption(caption, hashtags, { maxHashtags: brand?.max_hashtags ?? 5, bannedWords: brand?.banned_words ?? [] }).filter((i) => i.level === "error");
    revalidatePath(`${base(slug)}/post/${id}`);
    return issues.length ? { error: `Salvo e re-renderizando, mas a legenda tem pendências: ${issues.map((i) => i.message).join(" ")}` } : { message: "Salvo. Re-renderizando as artes (sem IA)." };
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
    revalidatePath(`${base(slug)}/post/${id}`);
    return { message: "Refazendo com a sua instrução (1 chamada de IA)." };
  } catch (e) {
    return fail(e);
  }
}

export async function changeTemplate(slug: string, id: string, form: FormData) {
  const { ctx, post, supabase } = await ownPost(slug, id);
  if (["publishing", "published"].includes(post.status)) return;
  const key = str(form, "template_key", 60);
  await supabase.from("social_posts").update({ template_key: key || null }).eq("id", id);
  await admin().from("social_posts").update({ status: "rendering" }).eq("id", id);
  await enqueue({ entity_id: post.entity_id, post_id: id, kind: "render", payload: { reason: "template" }, dedupe_key: `render:${id}`, created_by: ctx.profile.id });
  revalidatePath(`${base(slug)}/post/${id}`);
}

async function rulesFor(entityId: string) {
  const supabase = await createClient();
  const [{ data: rules }, { data: taken }] = await Promise.all([
    supabase.from("content_rules").select("*").eq("entity_id", entityId).eq("active", true),
    supabase.from("social_posts").select("scheduled_at").eq("entity_id", entityId).in("status", ["approved", "scheduled", "publishing"]).not("scheduled_at", "is", null),
  ]);
  return { rules: (rules ?? []) as Rule[], taken: (taken ?? []).map((t) => new Date(t.scheduled_at as string)) };
}

export async function approvePost(slug: string, id: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { post, supabase, entity } = await ownPost(slug, id);
    if (!["review", "failed", "approved", "scheduled"].includes(post.status)) return { error: "Este post ainda não está pronto para aprovar." };
    const { data: assets } = await supabase.from("social_assets").select("kind").eq("post_id", id);
    if (!post.format.startsWith("youtube") && !(assets ?? []).some((a) => a.kind === "image" || a.kind === "video")) return { error: "O post ainda não tem mídia renderizada." };
    if (!post.caption.trim() && !post.format.startsWith("youtube")) return { error: "Legenda vazia." };
    const when = str(form, "when", 30);
    let at: Date | null;
    if (when === "next") {
      const { rules, taken } = await rulesFor(entity.id);
      at = nextFreeSlot(rules, taken, new Date(), post.format) ?? nextFreeSlot(rules, taken, new Date());
      if (!at) return { error: "Não há horário livre nas regras. Escolha data e hora." };
    } else if (when === "now") {
      at = new Date();
    } else {
      const date = str(form, "date", 10);
      const time = str(form, "time", 5);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return { error: "Escolha data e hora." };
      at = zonedTime(date, time, "America/Sao_Paulo");
      if (at.getTime() < Date.now() - 60_000) return { error: "Esse horário já passou." };
    }
    const { error } = await supabase.from("social_posts").update({ status: "scheduled", scheduled_at: at.toISOString(), error: null }).eq("id", id);
    if (error) return { error: "Não foi possível aprovar." };
    revalidatePath(base(slug), "layout");
    return { message: `Aprovado e agendado para ${at.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}.` };
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
    await supabase.from("social_posts").update({ status: "review", scheduled_at: null, approved_by: null, approved_at: null }).eq("id", id);
  }
  revalidatePath(base(slug), "layout");
}

export async function deletePost(slug: string, id: string) {
  const { post, supabase } = await ownPost(slug, id);
  if (["publishing", "published", "scheduled"].includes(post.status)) return;
  const { data: assets } = await supabase.from("social_assets").select("storage_path").eq("post_id", id);
  await supabase.from("social_posts").delete().eq("id", id);
  const paths = (assets ?? []).map((a) => a.storage_path);
  if (paths.length) await admin().storage.from(BUCKET).remove(paths);
  revalidatePath(base(slug), "layout");
  redirect(`${base(slug)}/revisao`);
}

export async function videoUploadUrl(slug: string, id: string) {
  const { post, entity } = await ownPost(slug, id);
  if (!["reel", "story", "youtube_video"].includes(post.format)) throw new Error("Este formato não usa vídeo enviado.");
  const path = `${entity.slug}/${id}/upload-${randomUUID()}.mp4`;
  return { path, url: await signedUpload(path) };
}

export async function attachVideo(slug: string, id: string, path: string, opts: { subtitles: boolean }): Promise<ActionState> {
  try {
    const { ctx, post, entity } = await ownPost(slug, id);
    if (!new RegExp(`^${entity.slug}/${id}/upload-[0-9a-f-]{36}\\.mp4$`).test(path)) return { error: "Arquivo inválido." };
    await admin().from("social_posts").update({ status: "rendering" }).eq("id", id);
    await enqueue({
      entity_id: post.entity_id,
      post_id: id,
      kind: "render",
      payload: { reason: "upload", upload_path: path, subtitles: opts.subtitles },
      dedupe_key: `render:${id}`,
      created_by: ctx.profile.id,
    });
    revalidatePath(`${base(slug)}/post/${id}`);
    return { message: "Vídeo recebido. Normalizando (H.264/AAC, 30 fps)." };
  } catch (e) {
    return fail(e);
  }
}

// ================================================================ Calendário
export async function reschedule(slug: string, id: string, isoAt: string): Promise<ActionState> {
  try {
    const { post, supabase } = await ownPost(slug, id);
    if (!["approved", "scheduled"].includes(post.status)) return { error: "Só posts aprovados são reagendados." };
    const at = new Date(isoAt);
    if (Number.isNaN(at.getTime()) || at.getTime() < Date.now() - 60_000) return { error: "Escolha um horário futuro." };
    await supabase.from("social_posts").update({ scheduled_at: at.toISOString() }).eq("id", id);
    revalidatePath(`${base(slug)}/calendario`);
    return { message: "Reagendado." };
  } catch (e) {
    return fail(e);
  }
}

// ================================================================ Regras semanais
export async function saveRule(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { entity } = await writable(slug);
    const fmt = str(form, "format", 30);
    const weekdays = form.getAll("weekday").map(Number).filter((d) => d >= 0 && d <= 6);
    const time = str(form, "local_time", 5);
    const count = Math.min(10, Math.max(1, Number(form.get("count") ?? 1) || 1));
    const mix = form.getAll("mix_types").map(String).filter((t) => TYPES.includes(t));
    if (!FORMATS.includes(fmt)) return { error: "Escolha o formato." };
    if (!weekdays.length) return { error: "Escolha pelo menos um dia." };
    if (!/^\d{2}:\d{2}$/.test(time)) return { error: "Informe o horário." };
    const requireReview = form.get("require_review") !== "off";
    const supabase = await createClient();
    const rows = weekdays.map((weekday) => ({
      entity_id: entity.id,
      format: fmt,
      weekday,
      local_time: time,
      count,
      mix_types: mix.length ? mix : TYPES,
      auto_generate: form.get("auto_generate") === "on",
      require_review: requireReview,
    }));
    const { error } = await supabase.from("content_rules").insert(rows);
    if (error) return { error: "Não foi possível salvar a regra." };
    revalidatePath(`${base(slug)}/regras`);
    return { message: requireReview ? "Regra criada." : "Regra criada SEM revisão: posts dela publicam sozinhos." };
  } catch (e) {
    return fail(e);
  }
}

export async function toggleRule(slug: string, form: FormData) {
  const { entity } = await writable(slug);
  const id = String(form.get("id"));
  const field = String(form.get("field"));
  if (!UUID.test(id) || !["active", "auto_generate", "require_review"].includes(field)) return;
  const supabase = await createClient();
  await supabase.from("content_rules").update({ [field]: form.get("value") === "true" }).eq("id", id).eq("entity_id", entity.id);
  revalidatePath(`${base(slug)}/regras`);
}

export async function deleteRule(slug: string, form: FormData) {
  const { entity } = await writable(slug);
  const id = String(form.get("id"));
  if (!UUID.test(id)) return;
  const supabase = await createClient();
  await supabase.from("content_rules").delete().eq("id", id).eq("entity_id", entity.id);
  revalidatePath(`${base(slug)}/regras`);
}

export async function planWeekNow(slug: string): Promise<ActionState> {
  try {
    const { ctx, entity } = await writable(slug);
    await enqueue({ entity_id: entity.id, kind: "plan_week", payload: { manual: true }, dedupe_key: `plan:${entity.id}`, created_by: ctx.profile.id });
    revalidatePath(`${base(slug)}/regras`);
    return { message: "Planejando a próxima semana. Os posts aparecem na Revisão quando ficarem prontos." };
  } catch (e) {
    return fail(e);
  }
}
