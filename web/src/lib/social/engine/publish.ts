import "server-only";
import { fullCaption } from "@shared/social/lint";
import { validateCaption, validateCarousel, validateImage } from "@shared/social/media-rules";
import { MetaError, withBackoff } from "@shared/social/meta-client";
import { shouldDefer, spacingOk, withinQuota } from "@shared/social/schedule";
import { BUCKET, Fatal, log, RetryLater, sb, setPost } from "./db";
import { clientFor, markExpired } from "./meta";
import type { Job } from "./brand";

const SIGNED_URL_SECONDS = 2 * 3600; // a Meta baixa a mídia na criação do container

/** Publica um post aprovado: cria os containers NA HORA (expiram em 24 h), espera e publica. */
export async function publishPost(job: Job) {
  if (!job.post_id) throw new Error("Job sem post.");
  const { data: post } = await sb().from("social_posts").select("*").eq("id", job.post_id).single();
  if (!post) throw new Error("Post não encontrado.");
  if (post.status === "published") return { skipped: "já publicado" };
  if (!["approved", "scheduled"].includes(post.status)) return { skipped: `status ${post.status}` };
  // revisão humana obrigatória: nunca publicar sem aprovação
  if (post.require_review && !post.approved_at) throw new Fatal("Post sem aprovação: não publicado.");
  if (post.format.startsWith("youtube")) return { skipped: "YouTube é publicado manualmente" };
  if (!post.account_id) {
    const { data: acc } = await sb().from("social_accounts").select("id").eq("entity_id", post.entity_id).eq("platform", "instagram").maybeSingle();
    if (!acc) throw new Fatal("Instagram não conectado. Cole o token em Redes Sociais → Conexão.");
    post.account_id = acc.id;
  }

  const { acc, client } = await clientFor(post.account_id);
  if (acc.status === "expired" || acc.status === "disconnected") throw new Fatal("O token do Instagram venceu. Cole um novo em Redes Sociais → Conexão.");

  // espaço de 2 min entre publicações da mesma conta
  const { data: last } = await sb().from("social_posts").select("published_at").eq("account_id", post.account_id).eq("status", "published").order("published_at", { ascending: false }).limit(1).maybeSingle();
  if (!spacingOk(last?.published_at ? new Date(last.published_at) : null, new Date())) throw new RetryLater("Aguardando 2 min desde a última publicação.", 2 * 60_000);

  // cota de 24 h com 10% de folga
  const quota = await withBackoff(() => client.getPublishingLimit()).catch(() => null);
  if (quota && !withinQuota(quota.used, quota.total)) throw new RetryLater(`Cota de publicação quase cheia (${quota.used}/${quota.total}).`, 60 * 60_000);
  if (shouldDefer(client.lastUsage.percent)) throw new RetryLater(`Uso da API em ${client.lastUsage.percent}%: adiando.`, 15 * 60_000);

  const { data: assets } = await sb().from("social_assets").select("*").eq("post_id", post.id).order("idx");
  const images = (assets ?? []).filter((a) => a.kind === "image");
  const video = (assets ?? []).find((a) => a.kind === "video" && a.idx === 0);
  const cover = (assets ?? []).find((a) => a.kind === "cover");
  const caption = fullCaption(post.caption, post.hashtags ?? []);
  const capErr = validateCaption(post.caption, post.hashtags ?? [], 5);
  if (capErr.length) throw new Error(capErr.join(" "));

  const sign = async (p: string) => {
    const { data, error } = await sb().storage.from(BUCKET).createSignedUrl(p, SIGNED_URL_SECONDS);
    if (error || !data) throw new Error("Não foi possível gerar o link da mídia.");
    return data.signedUrl;
  };

  // trava: só um publicador por post
  const { data: locked } = await sb().from("social_posts").update({ status: "publishing", error: null }).eq("id", post.id).in("status", ["approved", "scheduled"]).select("id");
  if (!locked?.length) return { skipped: "outro processo está publicando" };

  try {
    const results: { mediaId: string; permalink: string | null }[] = [];
    let containerId: string | null = null;
    const alt = (i: number) => post.alt_texts?.[i] ?? post.alt_texts?.[0] ?? undefined;

    if (post.format === "carousel") {
      const errs = validateCarousel(images.map((a) => ({ mime: a.mime, width: a.width, height: a.height, bytes: a.bytes })));
      if (errs.length) throw new Error(errs.join(" "));
      const children: string[] = [];
      for (const [i, a] of images.slice(0, 10).entries()) children.push(await withBackoff(async () => client.createImageContainer({ image_url: await sign(a.storage_path), is_carousel_item: true, alt_text: alt(i) })));
      for (const c of children) await client.waitContainer(c);
      containerId = await withBackoff(() => client.createCarousel({ children, caption }));
      await client.waitContainer(containerId);
      results.push(await withBackoff(() => client.publish(containerId!)));
    } else if (post.format === "post") {
      const a = images[0];
      if (!a) throw new Error("Post sem arte.");
      const errs = validateImage({ mime: a.mime, width: a.width, height: a.height, bytes: a.bytes });
      if (errs.length) throw new Error(errs.join(" "));
      containerId = await withBackoff(async () => client.createImageContainer({ image_url: await sign(a.storage_path), caption, alt_text: alt(0) }));
      await client.waitContainer(containerId);
      results.push(await withBackoff(() => client.publish(containerId!)));
    } else if (post.format === "reel") {
      if (!video) throw new Error("Reels sem vídeo: envie um MP4 ou ligue o vídeo no worker.");
      containerId = await withBackoff(async () => client.createVideoContainer({ media_type: "REELS", video_url: await sign(video.storage_path), caption, cover_url: cover ? await sign(cover.storage_path) : undefined, share_to_feed: true }));
      await client.waitContainer(containerId, 10 * 60_000);
      results.push(await withBackoff(() => client.publish(containerId!)));
    } else if (post.format === "story") {
      if (video) {
        containerId = await withBackoff(async () => client.createVideoContainer({ media_type: "STORIES", video_url: await sign(video.storage_path) }));
        await client.waitContainer(containerId, 10 * 60_000);
        results.push(await withBackoff(() => client.publish(containerId!)));
      } else {
        for (const a of images) {
          const c = await withBackoff(async () => client.createImageContainer({ image_url: await sign(a.storage_path), story: true }));
          await client.waitContainer(c);
          results.push(await withBackoff(() => client.publish(c)));
          containerId = c;
        }
      }
    }
    if (!results.length) throw new Error("Nada para publicar.");
    await setPost(post.id, {
      status: "published",
      published_at: new Date().toISOString(),
      container_id: containerId,
      external_media_id: results.map((r) => r.mediaId).join(","),
      permalink: results[0].permalink,
      account_id: post.account_id,
      error: null,
    });
    log("info", "publicado", { post: post.id, media: results[0].mediaId });
    return { mediaId: results[0].mediaId, permalink: results[0].permalink };
  } catch (e) {
    if (e instanceof MetaError && e.tokenInvalid) {
      await markExpired(post.account_id, e.message);
    }
    // volta para agendado se for tentar de novo; senão o loop marca como falha
    const retry = e instanceof RetryLater || (e instanceof MetaError && e.retryable);
    await setPost(post.id, { status: retry ? "scheduled" : "failed", error: (e as Error).message.slice(0, 400) });
    if (e instanceof MetaError && e.retryable) throw new RetryLater(e.message, e.rateLimited ? 15 * 60_000 : 2 * 60_000);
    throw e;
  }
}
