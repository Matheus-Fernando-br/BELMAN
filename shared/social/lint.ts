// Lint local de legendas (zero token), portando as regras do pacote instagram-agent-skill
// (skills/ig-caption/caption.py e skills/ig-human/slop.json) para português do Brasil e
// para as regras da casa. Correções tipográficas são automáticas; o resto vira lista de
// problemas, e só então (no máximo 1 vez) a IA é chamada para corrigir.

export type LintRules = {
  maxHashtags: number; // regra da casa: 5
  bannedWords?: string[];
  maxEmojis?: number; // por legenda (voice.md: 1)
  firstLineMax?: number; // janela visível antes do "… mais"
  captionMax?: number;
};

export type LintIssue = { code: string; level: "error" | "warn"; message: string };

// ---------------------------------------------------------------- correções automáticas
const INVISIBLE_DELETE = /[​‌‍⁠﻿­᠎؜‎‏⁣]|[\u{E0000}-\u{E007F}]/gu;
const INVISIBLE_SPACE = /[      ]/g;

/** Remove invisíveis e troca tipografia "de IA" (travessão, aspas curvas, reticências…). */
export function autofix(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(INVISIBLE_DELETE, "")
    .replace(INVISIBLE_SPACE, " ")
    .replace(/\s*—\s*/g, ", ")
    .replace(/–/g, "-")
    .replace(/[‘’′]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/,\s*,/g, ",")
    .replace(/ {2,}/g, " ")
    .trim();
}

// ---------------------------------------------------------------- vocabulário de IA (pt-BR)
export const SLOP_PT = [
  "mergulhe",
  "mergulhar fundo",
  "alavancar",
  "alavanque",
  "potencialize",
  "desbloqueie",
  "revolucionar",
  "revolucionário",
  "revolucionária",
  "transformador",
  "disruptivo",
  "inovador",
  "solução inovadora",
  "sinergia",
  "jornada",
  "ecossistema",
  "robusto",
  "perfeitamente",
  "sem esforço",
  "crucial",
  "fundamental",
  "abrangente",
  "game changer",
  "divisor de águas",
  "no mundo acelerado de hoje",
  "nos dias de hoje",
  "no cenário atual",
  "vamos combinar",
  "imagine um mundo",
  "não é segredo que",
  "sem mais delongas",
  "apertem os cintos",
  "pare de rolar",
  "ninguém está falando sobre isso",
  "isso mudou tudo",
  "este é o seu sinal",
  "reflita sobre isso",
  "leia de novo",
  "no fim das contas",
  "fica a reflexão",
  "além disso",
  "ademais",
  "em suma",
  "em conclusão",
  "vale ressaltar que",
  "é importante destacar",
  "segredo do sucesso",
  "guia definitivo",
  "subir de nível",
];

const FILLER_TAGS = new Set(["viral", "fyp", "explore", "explorepage", "foryou", "foryoupage", "trending", "instagood", "love", "follow", "like4like", "reels", "reelsinstagram", "viralreels", "instadaily", "sigame", "curtir"]);

// chamadas para ação (uma por post)
const ASKS: [string, RegExp][] = [
  ["comente", /\bcomente\b|\bescreva\b.{0,20}\bnos comentários\b|\bdeixe (?:seu|um) coment/i],
  ["direct", /\bme chama\b|\bmanda (?:um )?direct\b|\bmanda (?:uma )?dm\b|\bno direct\b|\bchama no whats/i],
  ["salve", /\bsalv[ea] (?:este|esse|o post|pra|para)\b|\bsalva aí\b/i],
  ["compartilhe", /\bcompartilh[ea] com\b|\bmanda (?:pra|para) (?:aquele|quem)\b|\bmarque (?:alguém|aquele|quem)\b/i],
  ["siga", /\bsiga (?:o|a|@|para|pra)|\bsegue (?:o|a|@)\b/i],
  ["link na bio", /\blink (?:está |tá )?na bio\b/i],
  ["arraste", /\barraste (?:para|pra|pro)\b|\bpassa pro lado\b/i],
  ["pergunta", /\bme (?:conta|diz|responde)\b|\bqual (?:você|vc) (?:prefere|usa|escolhe)\b/i],
  ["baixe", /\bbaix[ea] (?:o|grátis|agora)\b|\bcomece grátis\b|\bteste grátis\b/i],
];

const URL_RE = /\bhttps?:\/\/\S+|\bwww\.\S+|\b[a-z0-9-]+\.(?:com|com\.br|br|co|io|net|org|ai|app)(?:\/\S*)?\b/gi;
const EMOJI_RE = /\p{Extended_Pictographic}/gu;

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

function hasPhrase(text: string, phrase: string) {
  const p = norm(phrase).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${p}($|[^a-z0-9])`).test(norm(text));
}

/** Chamadas para ação por frase ("Comece grátis: link na bio." conta como uma só). */
export function countAsks(text: string) {
  return text
    .split(/[.!?\n]+/)
    .map((sentence) => ASKS.filter(([, re]) => re.test(sentence)).map(([name]) => name))
    .filter((names) => names.length)
    .map((names) => names.join(" + "));
}

export function lintCaption(caption: string, hashtags: string[], rules: LintRules): LintIssue[] {
  const issues: LintIssue[] = [];
  const firstMax = rules.firstLineMax ?? 125;
  const limit = rules.captionMax ?? 2200;
  const full = hashtags.length ? `${caption}\n\n${hashtags.join(" ")}` : caption;
  const push = (code: string, level: LintIssue["level"], message: string) => issues.push({ code, level, message });

  // caracteres
  if (/[—–]/.test(caption)) push("dash", "error", "Tem travessão (—). Troque por vírgula ou ponto.");
  if (/[“”‘’]/.test(caption)) push("curly_quotes", "error", "Tem aspas curvas. Use aspas retas.");
  if (INVISIBLE_DELETE.test(caption)) push("invisible", "error", "Tem caracteres invisíveis.");
  INVISIBLE_DELETE.lastIndex = 0;

  // tamanho
  if (full.length > limit) push("length", "error", `Legenda com ${full.length} caracteres (limite ${limit}).`);
  if (!caption.trim()) push("empty", "error", "Legenda vazia.");

  // primeira linha
  const first = caption.split("\n")[0] ?? "";
  if (/^\s*$/.test(first) && caption.trim()) push("first_blank", "error", "A legenda começa com linha em branco.");
  if (/^\s*[#@]/.test(first)) push("first_tag", "error", "A primeira linha começa com hashtag ou menção.");
  if (/^\s*\p{Extended_Pictographic}/u.test(first)) push("first_emoji", "error", "A legenda começa com emoji.");
  if (first.length > firstMax) push("first_line", "error", `Primeira linha com ${first.length} caracteres (máximo ${firstMax}: o resto some no "… mais").`);
  else if (first && !/\d|R\$|%/.test(first.slice(0, firstMax)) && !/\b[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]{2,}/.test(first.slice(1, firstMax)))
    push("hook_concrete", "warn", "O gancho não tem número nem nome concreto.");

  // hashtags
  const inBody = caption.match(/(^|\s)#[\p{L}\p{N}_]+/gu) ?? [];
  if (inBody.length) push("tags_in_body", "error", "Hashtag no meio do texto. Hashtags vão só no fim (campo de hashtags).");
  const total = hashtags.length + inBody.length;
  if (total > rules.maxHashtags) push("hashtags", "error", `${total} hashtags (máximo ${rules.maxHashtags}).`);
  const filler = hashtags.map((h) => h.replace(/^#/, "").toLowerCase()).filter((h) => FILLER_TAGS.has(h));
  if (filler.length) push("filler_tags", "warn", `Hashtags genéricas: ${filler.map((f) => `#${f}`).join(" ")}.`);

  // links
  if ((caption.match(URL_RE) ?? []).length) push("link", "error", "Tem link no texto. O link fica na bio.");

  // uma chamada para ação
  const asks = countAsks(caption);
  if (asks.length > 1) push("asks", "error", `Mais de uma chamada para ação (${asks.join(", ")}). Deixe só uma.`);
  if (asks.length === 0) push("no_ask", "warn", "Sem chamada para ação.");

  // emoji
  const emojis = (caption.match(EMOJI_RE) ?? []).length;
  if (rules.maxEmojis != null && emojis > rules.maxEmojis) push("emoji", "error", `${emojis} emojis (máximo ${rules.maxEmojis}).`);
  else if (caption.length && (emojis / caption.length) * 100 > 4) push("emoji_density", "warn", "Emojis demais para o tamanho do texto.");

  // palavras proibidas + vocabulário de IA
  const banned = [...new Set([...(rules.bannedWords ?? []), ...SLOP_PT])].filter((w) => w.trim() && hasPhrase(caption, w));
  if (banned.length) push("banned_words", "error", `Palavras a evitar: ${banned.join(", ")}.`);

  // estruturas típicas de IA (só aviso)
  if (/\bnão é (?:só|apenas) [^.,]+, é\b/i.test(caption)) push("not_just", "warn", 'Estrutura "não é só X, é Y".');
  if (/^(?:em resumo|resumindo|concluindo)\b/im.test(caption)) push("summary", "warn", "Linha começando com resumo/conclusão.");
  if (/\b(?:concorda|e você)\?\s*$/im.test(caption)) push("bait", "warn", "Pergunta de engajamento genérica no fim da linha.");

  return issues;
}

export const hasErrors = (issues: LintIssue[]) => issues.some((i) => i.level === "error");

/** Normaliza hashtags: sem acento, sem espaço, minúsculas, sem repetir, até o limite. */
export function normalizeHashtags(tags: string[], max: number) {
  const out: string[] = [];
  for (const t of tags) {
    const clean = norm(t.trim().replace(/^#+/, "")).replace(/[^a-z0-9_]/g, "");
    if (clean && !out.includes(clean)) out.push(clean);
  }
  return out.slice(0, Math.max(0, max)).map((t) => `#${t}`);
}

export const fullCaption = (caption: string, hashtags: string[]) => (hashtags.length ? `${caption}\n\n${hashtags.join(" ")}` : caption);
