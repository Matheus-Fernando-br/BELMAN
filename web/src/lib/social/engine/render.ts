import "server-only";
import type { CarouselCopy, PostCopy, StoryCopy } from "@shared/social/copy";
import { validateCarousel, validateImage } from "@shared/social/media-rules";
import { carouselClassic, postSingle, storyFrames, type Brand, type Frame } from "@shared/social-templates/index";
import { BUCKET, log, sb, setPost } from "./db";
import { renderFrames } from "./images";
import { templateBrand, type Job } from "./brand";

type Asset = { post_id: string; entity_id: string; idx: number; kind: string; storage_path: string; mime: string; width: number; height: number; bytes: number };

function framesFor(format: string, brand: Brand, copy: Record<string, unknown>): Frame[] {
  if (format === "carousel" && copy.carousel) return carouselClassic(brand, copy.carousel as CarouselCopy);
  if (format === "post" && copy.post) return postSingle(brand, copy.post as PostCopy);
  if (format === "story" && copy.story) return storyFrames(brand, copy.story as StoryCopy);
  return [];
}

/** Desenha as artes (templates da marca, sem IA) e guarda no bucket privado. */
export async function renderPost(job: Job) {
  if (!job.post_id || !job.entity_id) throw new Error("Job sem post.");
  const { data: post } = await sb().from("social_posts").select("*").eq("id", job.post_id).single();
  if (!post) throw new Error("Post não encontrado.");
  const { data: ent } = await sb().from("entities").select("slug").eq("id", job.entity_id).single();
  const frames = framesFor(post.format, await templateBrand(job.entity_id), (post.copy ?? {}) as Record<string, unknown>);
  if (!frames.length) throw new Error("O post não tem texto para desenhar. Peça para a IA refazer.");
  const imgs = await renderFrames(frames);
  const stamp = Date.now().toString(36);
  const base = `${ent!.slug}/${post.id}`;
  const assets: Asset[] = [];
  const up = async (p: string, data: Buffer, mime: string) => {
    const { error } = await sb().storage.from(BUCKET).upload(p, data, { contentType: mime, upsert: true });
    if (error) throw new Error(`Falha ao salvar a arte: ${error.message}`);
  };
  for (const [i, r] of imgs.entries()) {
    const p = `${base}/${stamp}-${i}.jpg`;
    await up(p, r.jpeg, "image/jpeg");
    assets.push({ post_id: post.id, entity_id: job.entity_id, idx: i, kind: "image", storage_path: p, mime: "image/jpeg", width: r.width, height: r.height, bytes: r.jpeg.length });
    const pp = `${base}/${stamp}-${i}.preview.png`;
    await up(pp, r.preview, "image/png");
    assets.push({ post_id: post.id, entity_id: job.entity_id, idx: i, kind: "preview", storage_path: pp, mime: "image/png", width: 360, height: Math.round((360 * r.height) / r.width), bytes: r.preview.length });
  }
  const images = assets.filter((a) => a.kind === "image");
  const errs = post.format === "carousel" ? validateCarousel(images) : post.format === "post" ? images.flatMap((m) => validateImage(m)) : [];
  if (errs.length) throw new Error(errs.join(" "));

  const { data: old } = await sb().from("social_assets").select("id,storage_path").eq("post_id", post.id);
  if (old?.length) {
    await sb().from("social_assets").delete().in("id", old.map((o) => o.id));
    await sb().storage.from(BUCKET).remove(old.map((o) => o.storage_path));
  }
  const { error } = await sb().from("social_assets").insert(assets);
  if (error) throw new Error(`Falha ao registrar as artes: ${error.message}`);
  // pronto para revisão; se a regra dispensa revisão, já fica agendado
  const auto = post.require_review === false && post.scheduled_at;
  await setPost(post.id, { status: auto ? "scheduled" : "review", error: null });
  log("info", "render ok", { post: post.id, images: imgs.length });
  return { images: imgs.length };
}
