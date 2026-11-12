// Limpeza das legendas geradas: regras do perfil de marca aplicadas no código,
// para não depender só do modelo obedecer.

const GENERIC = [
  "revolucionário",
  "revolucionária",
  "revolucione",
  "disruptivo",
  "disruptiva",
  "sinergia",
  "alavancar",
  "alavanque",
  "jornada",
  "game changer",
  "incrível",
  "incríveis",
  "desbloqueie",
  "potencialize",
  "no mundo de hoje",
  "nos dias de hoje",
  "mergulhe",
  "transformador",
  "transformadora",
];

const EMOJI = /\p{Extended_Pictographic}(\u{FE0F}|\u{200D}\p{Extended_Pictographic})*/gu;
const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;

export type CaptionRules = { maxEmojis: number; maxHashtags: number; linkInCaption: boolean; avoid?: string | null };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function avoidList(avoid?: string | null) {
  const extra = (avoid ?? "")
    .split(/[,;\n]/)
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length > 2);
  return [...new Set([...GENERIC, ...extra])];
}

/** Palavras proibidas que aparecem no texto (para avisar na revisão). */
export function flaggedWords(text: string, avoid?: string | null) {
  const lower = text.toLowerCase();
  return avoidList(avoid).filter((w) => new RegExp(`(^|[^\\p{L}])${escape(w)}($|[^\\p{L}])`, "u").test(lower));
}

export function normalizeHashtags(tags: string[], max: number) {
  const out: string[] = [];
  for (const t of tags) {
    const clean = t
      .trim()
      .replace(/^#+/, "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^\p{L}\p{N}_]/gu, "")
      .toLowerCase();
    if (clean && !out.includes(clean)) out.push(clean);
  }
  return out.slice(0, Math.max(0, max)).map((t) => `#${t}`);
}

export function cleanCaption(raw: string, rules: CaptionRules) {
  let text = raw.replace(/\r\n/g, "\n");
  // travessão vira vírgula/hífen (marca típica de texto de IA)
  text = text.replace(/\s+—\s+/g, ", ").replace(/—/g, "-").replace(/–/g, "-");
  // hashtags vão em campo próprio, nunca soltas no texto
  text = text.replace(/(^|\s)#[\p{L}\p{N}_]+/gu, "$1");
  if (!rules.linkInCaption) text = text.replace(URL_RE, "");
  let n = 0;
  text = text.replace(EMOJI, (m) => (++n <= rules.maxEmojis ? m : ""));
  return text
    .split("\n")
    .map((l) => l.replace(/[ \t]{2,}/g, " ").replace(/\s+([,.!?;:])/g, "$1").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function fullCaption(caption: string, hashtags: string[]) {
  return hashtags.length ? `${caption}\n\n${hashtags.join(" ")}` : caption;
}
