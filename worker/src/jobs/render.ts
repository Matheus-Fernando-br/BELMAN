import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { CarouselCopy, PostCopy, ReelCopy, StoryCopy, YoutubeCopy } from "@shared/social/copy";
import { validateCarousel, validateImage, validateReel, validateStory } from "@shared/social/media-rules";
import { carouselClassic, postSingle, reelCover, storyFrames, youtubeThumbnail, type Brand, type Frame } from "@shared/social-templates/index";
import { BUCKET, db, log, setPost } from "../db.js";
import { renderFrames } from "../images.js";
import { alignVoice, extractWav, mixAudio, normalize, probe } from "../video/ffmpeg.js";
import { hasPiper, hasWhisper, speak, transcribe } from "../video/speech.js";
import { templateBrand, type Job } from "./brand.js";

export const videoEnabled = () => process.env.SOCIAL_VIDEO === "1";

type Asset = { post_id: string; entity_id: string; idx: number; kind: string; storage_path: string; mime: string; width?: number; height?: number; duration_ms?: number; bytes: number };

async function upload(p: string, data: Buffer, mime: string) {
  const { error } = await db.storage.from(BUCKET).upload(p, data, { contentType: mime, upsert: true });
  if (error) throw new Error(`Falha ao salvar mídia (${p.split("/").pop()}): ${error.message}`);
}

function framesFor(format: string, brand: Brand, copy: Record<string, unknown>): Frame[] {
  if (format === "carousel" && copy.carousel) return carouselClassic(brand, copy.carousel as CarouselCopy);
  if (format === "post" && copy.post) return postSingle(brand, copy.post as PostCopy);
  if (format === "story" && copy.story) return storyFrames(brand, copy.story as StoryCopy);
  if (format.startsWith("youtube") && copy.youtube) return youtubeThumbnail(brand, copy.youtube as YoutubeCopy);
  if (format === "reel" && copy.reel) return [reelCover(brand, (copy.reel as ReelCopy).hook)];
  return [];
}

const brandProps = (b: Brand) => ({ handle: b.handle, primary: b.palette.primary, accent: b.palette.accent, bg: b.palette.bg, font: b.fonts.heading, logo: b.logo ?? null });

/** Render: artes (Satori) e, se ligado, vídeo (Remotion/FFmpeg). Editar texto chega aqui SEM IA. */
export async function renderPost(job: Job) {
  if (!job.post_id || !job.entity_id) throw new Error("Job sem post.");
  const { data: post } = await db.from("social_posts").select("*").eq("id", job.post_id).single();
  if (!post) throw new Error("Post não encontrado.");
  const { data: ent } = await db.from("entities").select("slug").eq("id", job.entity_id).single();
  const slug = ent!.slug as string;
  const brand = await templateBrand(job.entity_id);
  const copy = (post.copy ?? {}) as Record<string, unknown>;
  const stamp = Date.now().toString(36);
  const base = `${slug}/${post.id}`;
  const assets: Asset[] = [];
  const notes: string[] = [];
  const tmp = await mkdtemp(path.join(os.tmpdir(), "social-"));

  try {
    // ---------- imagens
    const frames = framesFor(post.format, brand, copy);
    if (!frames.length && !post.format.startsWith("youtube") && post.format !== "reel") throw new Error("O post não tem texto para desenhar. Gere ou edite o texto.");
    const imgs = await renderFrames(frames);
    for (const [i, r] of imgs.entries()) {
      const kind = post.format === "reel" ? "cover" : "image";
      const p = `${base}/${stamp}-${i}.jpg`;
      await upload(p, r.jpeg, "image/jpeg");
      assets.push({ post_id: post.id, entity_id: job.entity_id, idx: i, kind, storage_path: p, mime: "image/jpeg", width: r.width, height: r.height, bytes: r.jpeg.length });
      const pp = `${base}/${stamp}-${i}.preview.png`;
      await upload(pp, r.preview, "image/png");
      assets.push({ post_id: post.id, entity_id: job.entity_id, idx: i, kind: "preview", storage_path: pp, mime: "image/png", width: 360, height: Math.round((360 * r.height) / r.width), bytes: r.preview.length });
    }

    // ---------- vídeo
    const uploadPath = job.payload.upload_path as string | undefined;
    const wantsVideo = ["reel", "story", "youtube_video"].includes(post.format);
    let videoFile: string | null = null;
    let reusePrevious = false;

    if (uploadPath) {
      // vídeo enviado: normaliza (H.264/AAC, 30 fps, faststart) e, se pedido, legenda via whisper.cpp
      const { data } = await db.storage.from(BUCKET).download(uploadPath);
      if (!data) throw new Error("Vídeo enviado não encontrado.");
      const raw = path.join(tmp, "upload.mp4");
      await writeFile(raw, Buffer.from(await data.arrayBuffer()));
      let srt: string | null = null;
      if (job.payload.subtitles) {
        if (hasWhisper()) {
          const wav = path.join(tmp, "audio.wav");
          await extractWav(raw, wav);
          srt = await transcribe(wav, tmp);
        } else notes.push("Legendas não geradas: whisper.cpp não está instalado neste worker.");
      }
      videoFile = path.join(tmp, "final.mp4");
      await normalize(raw, videoFile, { vertical: post.format !== "youtube_video", srt });
      await db.storage.from(BUCKET).remove([uploadPath]);
    } else if (wantsVideo && post.format === "reel" && copy.reel) {
      const { data: prevVideo } = await db.from("social_assets").select("id").eq("post_id", post.id).eq("kind", "video").limit(1);
      if (!videoEnabled()) {
        if (prevVideo?.length) reusePrevious = true;
        else notes.push("Vídeo desligado neste worker (SOCIAL_VIDEO=0): envie um MP4 gravado ou ligue o vídeo no plano Standard.");
      } else {
        const reel = copy.reel as ReelCopy;
        const { renderComposition } = await import("../video/render.js");
        const silent = path.join(tmp, "silent.mp4");
        const beats = reel.beats.map((b) => ({ text: b.on_screen_text, seconds: Math.max(1.5, Math.min(8, b.seconds)) }));
        const useScreen = post.template_key === "reel.screenDemo";
        if (useScreen) {
          const { data: rec } = await db.from("media_library").select("storage_path,duration_ms").eq("entity_id", job.entity_id).eq("kind", "screen_recording").order("created_at", { ascending: false }).limit(1).maybeSingle();
          if (!rec) throw new Error("Template de demonstração precisa de uma gravação de tela no Acervo.");
          const { data: signed } = await db.storage.from(BUCKET).createSignedUrl(rec.storage_path, 3600);
          const local = path.join(tmp, "rec.mp4");
          await writeFile(local, Buffer.from(await (await fetch(signed!.signedUrl)).arrayBuffer()));
          const info = await probe(local);
          let t = 0;
          const captions = beats.map((b) => {
            const c = { startMs: t, endMs: t + b.seconds * 1000, text: b.text };
            t += b.seconds * 1000;
            return c;
          });
          await renderComposition("reel-screenDemo", { brand: brandProps(brand), videoUrl: signed!.signedUrl, durationMs: Math.min(info.durationMs, 90_000), captions, zoom: 1.08 }, silent);
        } else {
          await renderComposition("reel-textBeats", { brand: brandProps(brand), hook: reel.hook, beats, cta: reel.cta }, silent);
        }
        // voz (Piper) a partir do roteiro; legendas já estão na tela (vêm do próprio roteiro)
        let voice: string | null = null;
        if (process.env.SOCIAL_VOICE !== "0" && hasPiper()) {
          const parts: { file: string; startMs: number }[] = [];
          let at = useScreen ? 0 : 2000;
          for (const [i, b] of reel.beats.entries()) {
            if (b.voiceover.trim()) parts.push({ file: await speak(b.voiceover, path.join(tmp, `v${i}.wav`)), startMs: Math.round(at) });
            at += Math.max(1.5, Math.min(8, b.seconds)) * 1000;
          }
          voice = await alignVoice(parts, path.join(tmp, "voice.wav"));
        } else if (process.env.SOCIAL_VOICE !== "0") notes.push("Sem narração: Piper TTS não está instalado neste worker.");
        // trilha só do acervo (com licença): a API não dá acesso às músicas do Instagram
        const { data: music } = await db.from("media_library").select("storage_path").eq("entity_id", job.entity_id).eq("kind", "music").not("license_note", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
        let musicFile: string | null = null;
        if (music) {
          const { data: m } = await db.storage.from(BUCKET).download(music.storage_path);
          if (m) {
            musicFile = path.join(tmp, `music${path.extname(music.storage_path)}`);
            await writeFile(musicFile, Buffer.from(await m.arrayBuffer()));
          }
        }
        const mixed = path.join(tmp, "mixed.mp4");
        await mixAudio(silent, mixed, voice, musicFile);
        videoFile = path.join(tmp, "final.mp4");
        await normalize(mixed, videoFile, { vertical: true });
      }
    } else if (post.format === "youtube_video" && videoEnabled() && copy.youtube) {
      // abertura e encerramento (5 s cada) para montar no editor
      const { renderComposition } = await import("../video/render.js");
      const yt = copy.youtube as YoutubeCopy;
      for (const [i, id] of ["youtube-intro", "youtube-outro"].entries()) {
        const f = path.join(tmp, `${id}.mp4`);
        await renderComposition(id, { brand: brandProps(brand), title: i ? "Obrigado por assistir" : yt.title, subtitle: i ? `Inscreva-se · ${brand.handle}` : brand.handle, kind: i ? "outro" : "intro" }, f);
        const buf = await readFile(f);
        const p = `${base}/${stamp}-${id}.mp4`;
        await upload(p, buf, "video/mp4");
        assets.push({ post_id: post.id, entity_id: job.entity_id, idx: i + 1, kind: "video", storage_path: p, mime: "video/mp4", width: 1920, height: 1080, duration_ms: 5000, bytes: buf.length });
      }
    }

    if (videoFile) {
      const info = await probe(videoFile);
      const errs = post.format === "story" ? validateStory({ mime: "video/mp4", ...info }) : post.format === "reel" ? validateReel({ mime: "video/mp4", ...info }) : [];
      if (errs.length) throw new Error(errs.join(" "));
      const buf = await readFile(videoFile);
      const p = `${base}/${stamp}-video.mp4`;
      await upload(p, buf, "video/mp4");
      assets.push({ post_id: post.id, entity_id: job.entity_id, idx: 0, kind: "video", storage_path: p, mime: "video/mp4", width: info.width, height: info.height, duration_ms: info.durationMs, bytes: buf.length });
    }

    // validação das imagens antes de liberar para revisão
    const images = assets.filter((a) => a.kind === "image").map((a) => ({ mime: a.mime, width: a.width, height: a.height, bytes: a.bytes }));
    const imgErrors = post.format === "carousel" ? validateCarousel(images) : post.format === "post" ? images.flatMap((m) => validateImage(m)) : post.format === "story" ? images.flatMap((m) => validateStory(m)) : [];
    if (imgErrors.length) throw new Error(imgErrors.join(" "));

    // troca as mídias antigas pelas novas (mantém o vídeo anterior se o vídeo estiver desligado)
    const { data: old } = await db.from("social_assets").select("id,storage_path,kind").eq("post_id", post.id);
    const drop = (old ?? []).filter((o) => !(reusePrevious && o.kind === "video"));
    if (drop.length) {
      await db.from("social_assets").delete().in("id", drop.map((o) => o.id));
      await db.storage.from(BUCKET).remove(drop.map((o) => o.storage_path));
    }
    const { error } = await db.from("social_assets").insert(assets);
    if (error) throw new Error(`Falha ao registrar mídias: ${error.message}`);

    // pronto para revisão, ou agendado direto se a regra dispensa revisão
    const autoSchedule = post.require_review === false && post.scheduled_at;
    await setPost(post.id, {
      status: autoSchedule ? "scheduled" : "review",
      error: notes.length ? notes.join(" ") : post.error?.startsWith("Lint:") ? post.error : null,
    });
    log("info", "render ok", { post: post.id, images: imgs.length, video: Boolean(videoFile) });
    return { images: imgs.length, video: Boolean(videoFile), notes };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}
