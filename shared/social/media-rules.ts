// Regras de mídia do Instagram, validadas ANTES de enviar à Meta.

export type MediaInfo = { mime: string; width?: number | null; height?: number | null; bytes?: number | null; durationMs?: number | null; fps?: number | null };

export class MediaRuleError extends Error {}

const ratio = (m: MediaInfo) => (m.width && m.height ? m.width / m.height : null);

export function validateImage(m: MediaInfo, opts: { story?: boolean } = {}) {
  const errors: string[] = [];
  if (m.mime !== "image/jpeg") errors.push("Imagem precisa ser JPEG.");
  if (m.bytes != null && m.bytes > 8 * 1024 * 1024) errors.push("Imagem acima de 8 MB.");
  const r = ratio(m);
  if (opts.story) {
    if (r != null && Math.abs(r - 9 / 16) > 0.02) errors.push("Story precisa ser 9:16 (1080×1920).");
  } else if (r != null && (r < 0.8 - 0.005 || r > 1.91 + 0.005)) errors.push("Proporção fora de 4:5 a 1.91:1.");
  return errors;
}

export function validateCarousel(items: MediaInfo[]) {
  const errors: string[] = [];
  if (items.length < 2 || items.length > 10) errors.push(`Carrossel com ${items.length} itens (precisa de 2 a 10).`);
  items.forEach((m, i) => validateImage(m).forEach((e) => errors.push(`Item ${i + 1}: ${e}`)));
  return errors;
}

export function validateReel(m: MediaInfo) {
  const errors: string[] = [];
  if (m.mime !== "video/mp4") errors.push("Reels precisa ser MP4 (H.264 + AAC).");
  const r = ratio(m);
  if (r != null && Math.abs(r - 9 / 16) > 0.02) errors.push("Reels precisa ser 9:16 (1080×1920).");
  if (m.durationMs != null && (m.durationMs < 3000 || m.durationMs > 15 * 60_000)) errors.push("Duração do Reels fora do permitido (3 s a 15 min).");
  return errors;
}

/** Recomendação (não bloqueia): 5 a 90 s, 30 fps. */
export function reelWarnings(m: MediaInfo) {
  const w: string[] = [];
  if (m.durationMs != null && (m.durationMs < 5000 || m.durationMs > 90_000)) w.push("Recomendado entre 5 e 90 segundos.");
  if (m.fps != null && Math.round(m.fps) !== 30) w.push("Recomendado 30 fps.");
  return w;
}

export function validateStory(m: MediaInfo) {
  if (m.mime.startsWith("image/")) return validateImage(m, { story: true });
  const errors: string[] = [];
  if (m.mime !== "video/mp4") errors.push("Story em vídeo precisa ser MP4.");
  if (m.durationMs != null && m.durationMs > 60_000) errors.push("Story em vídeo até 60 s.");
  return errors;
}

export function validateCaption(caption: string, hashtags: string[], maxHashtags = 5) {
  const errors: string[] = [];
  const full = hashtags.length ? `${caption}\n\n${hashtags.join(" ")}` : caption;
  if (full.length > 2200) errors.push("Legenda acima de 2.200 caracteres.");
  if (hashtags.length > maxHashtags) errors.push(`Mais de ${maxHashtags} hashtags.`);
  return errors;
}
