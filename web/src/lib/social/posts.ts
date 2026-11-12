import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { generateBatch, redoPost, type BrandProfile, type Format, type GenContext, type GeneratedPost } from "./ai";
import { renderCarousel, renderReelFrames, renderSingle, renderStories, renderYoutube, type Brand } from "./render";

// Pipeline de conteúdo: IA → posts na fila → artes renderizadas no bucket privado.
// Roda com a chave secreta (servidor). Quem chama já validou a permissão do usuário.

export const BUCKET = "social-media";
const TZ = "America/Sao_Paulo";

export type MediaItem = { path: string; kind: "image" | "video"; role: string; width: number; height: number };

function admin() {
  const a = createAdminClient();
  if (!a) throw new Error("SUPABASE_SECRET_KEY não configurada.");
  return a;
}

export async function loadBrand(entityId: string) {
  const { data } = await admin().from("social_brand_profiles").select("*").eq("entity_id", entityId).maybeSingle();
  return data as BrandProfile | null;
}

export async function loadContext(entityId: string): Promise<GenContext> {
  const a = admin();
  const since = new Date(Date.now() - 90 * 864e5).toISOString();
  const [{ data: recent }, { data: metrics }, { data: usage }, { data: entity }] = await Promise.all([
    a.from("social_posts").select("title").eq("entity_id", entityId).neq("status", "rejected").order("created_at", { ascending: false }).limit(30),
    a.from("social_post_metrics").select("post_id,reach,saves,captured_at").eq("entity_id", entityId).gte("captured_at", since).order("captured_at", { ascending: false }),
    a.from("product_usage_snapshots").select("users,day").eq("entity_id", entityId).order("day", { ascending: false }).limit(1),
    a.from("entities").select("name,kind").eq("id", entityId).maybeSingle(),
  ]);
  // última medição de cada post; os 5 melhores por salvamentos + alcance
  const latest = new Map<string, { reach: number | null; saves: number | null }>();
  for (const m of metrics ?? []) if (!latest.has(m.post_id)) latest.set(m.post_id, m);
  const ids = [...latest.entries()].sort((x, y) => (y[1].saves ?? 0) * 10 + (y[1].reach ?? 0) - ((x[1].saves ?? 0) * 10 + (x[1].reach ?? 0))).slice(0, 5);
  let topPosts: GenContext["topPosts"] = [];
  if (ids.length) {
    const { data: tp } = await a.from("social_posts").select("id,title,format").in("id", ids.map(([id]) => id));
    topPosts = ids.map(([id, m]) => ({ title: tp?.find((p) => p.id === id)?.title ?? "", format: tp?.find((p) => p.id === id)?.format ?? "", ...m })).filter((p) => p.title);
  }
  const u = usage?.[0]?.users as { total?: number; active30d?: number } | undefined;
  // Só números agregados de uso (nunca receita ou dados de clientes) vão para a IA.
  const productFacts = u?.total ? `${entity?.name}: ${u.total} usuários cadastrados, ${u.active30d ?? "?"} ativos nos últimos 30 dias (dados de ${usage?.[0]?.day}).` : null;
  return { recentTitles: (recent ?? []).map((r) => r.title), topPosts, productFacts };
}

/** Próximos horários de postagem do perfil (dias + hora, fuso de São Paulo), pulando os já ocupados. */
export function nextSlots(b: Pick<BrandProfile, "posting_days" | "posting_time">, count: number, from: Date, taken: Date[] = []) {
  const [hh, mm] = b.posting_time.split(":").map(Number);
  const days = b.posting_days.length ? b.posting_days : [2, 4];
  const out: Date[] = [];
  const takenKeys = new Set(taken.map((d) => d.toISOString().slice(0, 13)));
  for (let i = 0; out.length < count && i < 120; i++) {
    const day = new Date(from.getTime() + i * 864e5);
    const local = day.toLocaleDateString("sv-SE", { timeZone: TZ });
    const dow = new Date(`${local}T12:00:00Z`).getUTCDay();
    if (!days.includes(dow)) continue;
    // São Paulo sem horário de verão: UTC-3
    const at = new Date(`${local}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00-03:00`);
    if (at.getTime() < from.getTime() + 30 * 60_000) continue;
    if (takenKeys.has(at.toISOString().slice(0, 13))) continue;
    out.push(at);
  }
  return out;
}

function brandOf(b: BrandProfile): Brand {
  return { name: b.display_name, handle: b.handle, font: b.font, colors: b.colors ?? {} };
}

export function contentOf(p: GeneratedPost) {
  return { alt_text: p.alt_text, carousel: p.carousel, single: p.single, reels: p.reels, stories: p.stories, youtube: p.youtube };
}

type Content = ReturnType<typeof contentOf>;

/** Renderiza as artes do post e grava no bucket privado. Retorna a lista de mídias. */
export async function renderMedia(postId: string, entityId: string, format: Format, content: Content, b: BrandProfile, keepVideo?: MediaItem[]) {
  const brand = brandOf(b);
  let images: Buffer[] = [];
  let size = { width: 1080, height: 1350 };
  const roles: string[] = [];
  if (format === "carousel" && content.carousel) {
    images = await renderCarousel(brand, content.carousel);
    roles.push("capa", ...content.carousel.slides.map((_, i) => `slide ${i + 1}`), "resumo", "chamada");
  } else if (format === "single" && content.single) {
    images = await renderSingle(brand, content.single);
    roles.push("arte");
  } else if (format === "stories" && content.stories) {
    images = await renderStories(brand, content.stories.frames);
    size = { width: 1080, height: 1920 };
    roles.push(...content.stories.frames.map((_, i) => `story ${i + 1}`));
  } else if (format === "reels" && content.reels) {
    images = await renderReelFrames(brand, content.reels.scenes, content.reels.cover_text);
    size = { width: 1080, height: 1920 };
    roles.push("capa", ...content.reels.scenes.map((_, i) => `cena ${i + 1}`));
  } else if (format === "youtube" && content.youtube) {
    images = await renderYoutube(brand, content.youtube);
    roles.push("miniatura", "vinheta de abertura", "vinheta de encerramento");
  }
  const a = admin();
  const stamp = Date.now().toString(36);
  const media: MediaItem[] = [];
  for (const [i, img] of images.entries()) {
    const path = `${entityId}/${postId}/${stamp}-${String(i + 1).padStart(2, "0")}.jpg`;
    const { error } = await a.storage.from(BUCKET).upload(path, img, { contentType: "image/jpeg", upsert: true });
    if (error) throw new Error("Falha ao salvar a arte gerada.");
    const dims = format === "youtube" ? (i === 0 ? { width: 1280, height: 720 } : { width: 1920, height: 1080 }) : size;
    media.push({ path, kind: "image", role: roles[i] ?? `arte ${i + 1}`, ...dims });
  }
  // remove artes antigas (mantém o vídeo enviado, se houver)
  const { data: old } = await a.from("social_posts").select("media").eq("id", postId).maybeSingle();
  const stale = ((old?.media ?? []) as MediaItem[]).filter((m) => m.kind === "image").map((m) => m.path);
  if (stale.length) await a.storage.from(BUCKET).remove(stale);
  return [...media, ...(keepVideo ?? [])];
}

export type GenerateRequest = {
  entityId: string;
  kind: "weekly" | "manual";
  plan: { format: Format; post_type?: string; theme?: string }[];
  extra?: string;
  userId: string | null;
  schedule: boolean; // agenda nos próximos horários do perfil
};

export async function generateAndStore(req: GenerateRequest) {
  const a = admin();
  const brand = await loadBrand(req.entityId);
  if (!brand) throw new Error("Configure o perfil de marca antes de gerar.");
  const ctx = await loadContext(req.entityId);
  let result;
  try {
    result = await generateBatch(brand, ctx, req.plan, req.extra);
  } catch (error) {
    await a.from("social_generations").insert({ entity_id: req.entityId, kind: req.kind, model: "claude-opus-5-5", ok: false, error: (error as Error).message.slice(0, 500), created_by: req.userId });
    throw error;
  }
  const { data: gen } = await a
    .from("social_generations")
    .insert({
      entity_id: req.entityId,
      kind: req.kind,
      model: result.model,
      ok: true,
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      cost_usd: Number(result.costUsd.toFixed(4)),
      posts_created: result.posts.length,
      created_by: req.userId,
    })
    .select("id")
    .single();

  let slots: Date[] = [];
  if (req.schedule) {
    const { data: taken } = await a.from("social_posts").select("scheduled_at").eq("entity_id", req.entityId).in("status", ["scheduled", "approved", "review"]).not("scheduled_at", "is", null);
    slots = nextSlots(brand, result.posts.length, new Date(), (taken ?? []).map((t) => new Date(t.scheduled_at as string)));
  }
  const ids: string[] = [];
  for (const [i, p] of result.posts.entries()) {
    const auto = brand.auto_publish && p.format !== "youtube" && p.format !== "reels";
    const { data: row, error } = await a
      .from("social_posts")
      .insert({
        entity_id: req.entityId,
        format: p.format,
        post_type: p.post_type,
        status: auto && slots[i] ? "scheduled" : "review",
        title: p.title,
        caption: p.caption,
        hashtags: p.hashtags,
        content: contentOf(p),
        scheduled_at: slots[i]?.toISOString() ?? null,
        generation_id: gen?.id ?? null,
        created_by: req.userId,
      })
      .select("id")
      .single();
    if (error || !row) continue;
    ids.push(row.id);
    try {
      const media = await renderMedia(row.id, req.entityId, p.format, contentOf(p), brand);
      await a.from("social_posts").update({ media }).eq("id", row.id);
    } catch (e) {
      await a.from("social_posts").update({ error: `Artes: ${(e as Error).message}`.slice(0, 300) }).eq("id", row.id);
    }
  }
  return { ids, costUsd: result.costUsd, model: result.model };
}

export async function snapshot(postId: string, note: string, userId: string | null) {
  const a = admin();
  const { data } = await a.from("social_posts").select("entity_id,title,caption,hashtags,content,format,post_type").eq("id", postId).maybeSingle();
  if (data) await a.from("social_post_versions").insert({ post_id: postId, entity_id: data.entity_id, note, snapshot: data, created_by: userId });
}

export async function redo(postId: string, instruction: string, userId: string) {
  const a = admin();
  const { data: post } = await a.from("social_posts").select("*").eq("id", postId).maybeSingle();
  if (!post) throw new Error("Post não encontrado.");
  const brand = await loadBrand(post.entity_id);
  if (!brand) throw new Error("Perfil de marca não encontrado.");
  const ctx = await loadContext(post.entity_id);
  let result;
  try {
    result = await redoPost(brand, ctx, post, instruction);
  } catch (error) {
    await a.from("social_generations").insert({ entity_id: post.entity_id, kind: "redo", model: "claude-opus-5-5", ok: false, error: (error as Error).message.slice(0, 500), created_by: userId });
    throw error;
  }
  await a.from("social_generations").insert({
    entity_id: post.entity_id,
    kind: "redo",
    model: result.model,
    ok: true,
    input_tokens: result.inputTokens,
    output_tokens: result.outputTokens,
    cost_usd: Number(result.costUsd.toFixed(4)),
    posts_created: 1,
    created_by: userId,
  });
  const p = result.posts[0];
  if (!p) throw new Error("A IA não devolveu o post.");
  await snapshot(postId, `Antes de refazer: ${instruction}`.slice(0, 200), userId);
  const content = contentOf({ ...p, format: post.format });
  const video = ((post.media ?? []) as MediaItem[]).filter((m) => m.kind === "video");
  const media = await renderMedia(postId, post.entity_id, post.format, content, brand, video);
  await a
    .from("social_posts")
    .update({ title: p.title, caption: p.caption, hashtags: p.hashtags, content, post_type: p.post_type, media, status: "review", error: null, updated_by: userId })
    .eq("id", postId);
}

export async function rerender(postId: string) {
  const a = admin();
  const { data: post } = await a.from("social_posts").select("*").eq("id", postId).maybeSingle();
  if (!post) throw new Error("Post não encontrado.");
  const brand = await loadBrand(post.entity_id);
  if (!brand) throw new Error("Perfil de marca não encontrado.");
  const video = ((post.media ?? []) as MediaItem[]).filter((m) => m.kind === "video");
  const media = await renderMedia(postId, post.entity_id, post.format, post.content, brand, video);
  await a.from("social_posts").update({ media, error: null }).eq("id", postId);
}

export async function signedUrls(paths: string[], seconds = 3600) {
  if (!paths.length) return [] as string[];
  const { data, error } = await admin().storage.from(BUCKET).createSignedUrls(paths, seconds);
  if (error || !data) throw new Error("Não foi possível gerar os links das mídias.");
  if (data.some((d) => !d.signedUrl)) throw new Error("Mídia não encontrada no armazenamento.");
  return data.map((d) => d.signedUrl as string);
}

export async function deletePostMedia(media: MediaItem[]) {
  const paths = media.map((m) => m.path);
  if (paths.length) await admin().storage.from(BUCKET).remove(paths);
}
