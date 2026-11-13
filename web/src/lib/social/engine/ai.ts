import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { autofix, hasErrors, lintCaption, normalizeHashtags, type LintIssue } from "@shared/social/lint";
import { anthropicKey } from "./secrets";
import { Fatal } from "./db";

// IA comercial (Claude) só escreve TEXTO estruturado. Imagens, vídeo, voz e legendas de vídeo
// são desenhados pelos templates (sem IA). A chave é colada no Studio (Conexão) e fica cifrada.

/** US$ por milhão de tokens (entrada, saída, leitura de cache). Escrita de cache = 1,25 × entrada. */
export const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
};
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-sonnet-5-5"]);

export type Usage = { model: string; input_tokens: number; output_tokens: number; cache_read_tokens: number; cache_write_tokens: number; cost_usd: number };

export function cost(model: string, u: { input_tokens: number; output_tokens: number; cache_read_tokens: number; cache_write_tokens: number }) {
  const p = PRICES[model] ?? PRICES["claude-opus-5-5"];
  return (u.input_tokens * p.input + u.output_tokens * p.output + u.cache_read_tokens * p.cacheRead + u.cache_write_tokens * p.input * 1.25) / 1e6;
}

export type BrandProfile = {
  handle: string | null;
  voice: string | null;
  audience: string | null;
  positions: string[];
  banned_words: string[];
  emoji_policy: string | null;
  hashtag_bank: string[];
  max_hashtags: number;
  cta_default: string | null;
  link_in_bio: string | null;
  extra_rules: string | null;
  ai_model: string;
};

const HOUSE_RULES = `REGRAS DA CASA (obrigatórias)
- Português do Brasil, escrito por gente da área, não por IA. Frases curtas, concretas, com números e exemplos reais do público.
- Nunca use travessão (—), aspas curvas ou caracteres invisíveis.
- Uma única chamada para ação por post.
- Primeira linha da legenda com no máximo 125 caracteres: é o gancho que aparece antes do "… mais". Nunca comece com hashtag, menção ou emoji.
- Hashtags só no campo "hashtags" (sem # no texto), específicas, no máximo o limite da marca. Nada de #viral, #fyp, #explore.
- Sem link no texto da legenda: o link fica na bio.
- Não invente dados, clientes, depoimentos ou números. Exemplo numérico é sempre chamado de "exemplo".
- Nunca prometa resultado financeiro exato.
- Evite vocabulário típico de IA: jornada, alavancar, revolucionar, desbloquear, potencializar, mergulhar, "no mundo de hoje", "não é só X, é Y".
- Textos das artes: título de capa com até 6 palavras, título de slide com até 7 palavras, corpo de slide com até 25 palavras. Sem emoji nas artes.
- Texto alternativo (alt_texts): descreva cada imagem de forma objetiva para quem não enxerga.

TIPOS DE POST
- prova: resultado ou prova com dados reais do contexto.
- ensino: dica prática, passo a passo.
- opiniao: posição forte da marca.
- historia: bastidor ou caso.
- oferta: convite direto ao produto.

FORMATOS
- carousel: capa (kicker curto, título, subtítulo) + 6 a 8 slides (ou exatamente o que o TAMANHO pedir; se a instrução de mudança pedir outra quantidade de imagens, siga a instrução) + resumo (3 a 5 itens) + CTA. Tipos de slide: dor (o problema), conteudo, lista (2 a 6 itens curtos), numero (um número grande em "number"), citacao.
- post: imagem única (kicker, título, texto).
- reel: gancho dos 2 primeiros segundos + batidas (texto na tela, narração, segundos) somando 15 a 45 s + CTA.
- story: 3 a 5 telas; sticker_suggestion = enquete/caixinha/link sugerido, ou null.
- youtube_video / youtube_thumbnail: título, descrição, capítulos (00:00 …), tags, texto da miniatura (até 4 palavras) e roteiro.`;

/** Serialização estável do perfil (mesma ordem sempre → o cache de prompt funciona). */
function brandBlock(b: BrandProfile) {
  const list = (a: string[]) => (a.length ? a.map((x) => `- ${x}`).join("\n") : "—");
  return `PERFIL DA MARCA ${b.handle ?? ""}
Voz: ${b.voice ?? "—"}
Público: ${b.audience ?? "—"}
Posições:
${list(b.positions)}
Palavras proibidas: ${b.banned_words.join(", ") || "—"}
Emoji: ${b.emoji_policy ?? "no máximo 1"}
Banco de hashtags: ${b.hashtag_bank.join(" ") || "—"}
Máximo de hashtags: ${b.max_hashtags}
Chamada padrão: ${b.cta_default ?? "—"}
Link da bio: ${b.link_in_bio ?? "—"}
Regras fixas: ${b.extra_rules ?? "—"}`;
}

// ---------------------------------------------------------------- esquemas
const Slide = z.object({
  title: z.string(),
  body: z.string(),
  kind: z.enum(["dor", "conteudo", "lista", "numero", "citacao"]),
  items: z.array(z.string()),
  number: z.string().nullable(),
});
const Blocks = {
  carousel: z.object({ cover: z.object({ kicker: z.string(), title: z.string(), subtitle: z.string() }), slides: z.array(Slide), recap: z.array(z.string()), cta: z.string() }),
  post: z.object({ kicker: z.string(), title: z.string(), body: z.string() }),
  reel: z.object({ hook: z.string(), beats: z.array(z.object({ on_screen_text: z.string(), voiceover: z.string(), seconds: z.number() })), cta: z.string() }),
  story: z.object({ frames: z.array(z.object({ text: z.string(), sticker_suggestion: z.string().nullable() })) }),
  youtube: z.object({
    title: z.string(),
    description: z.string(),
    chapters: z.array(z.object({ time: z.string(), label: z.string() })),
    tags: z.array(z.string()),
    thumbnail_text: z.string(),
    script: z.string(),
  }),
};
const Common = {
  theme: z.string().describe("O tema do post em até 8 palavras"),
  post_type: z.enum(["prova", "ensino", "opiniao", "historia", "oferta"]),
  caption: z.string().describe("Legenda completa, sem hashtags"),
  first_line: z.string().describe("A primeira linha da legenda (até 125 caracteres)"),
  hashtags: z.array(z.string()),
  alt_texts: z.array(z.string()).describe("Um texto alternativo por imagem, na ordem"),
  keywords: z.array(z.string()).describe("Palavras que o público buscaria"),
};
const AutoSchema = z.object({
  format: z.enum(["carousel", "post", "reel", "story"]),
  ...Common,
  carousel: Blocks.carousel.nullable(),
  post: Blocks.post.nullable(),
  reel: Blocks.reel.nullable(),
  story: Blocks.story.nullable(),
});

export type FormatKey = "carousel" | "post" | "reel" | "story" | "youtube_video" | "youtube_thumbnail";
const blockKey = (f: FormatKey) => (f.startsWith("youtube") ? "youtube" : f) as keyof typeof Blocks;

function schemaFor(format: FormatKey | "auto") {
  if (format === "auto") return AutoSchema;
  const k = blockKey(format);
  return z.object({ ...Common, [k]: Blocks[k] } as Record<string, z.ZodType>);
}

export type Generated = {
  format: FormatKey;
  theme: string;
  post_type: string;
  caption: string;
  hashtags: string[];
  alt_texts: string[];
  copy: Record<string, unknown>;
  issues: LintIssue[];
  usages: Usage[];
};

// ---------------------------------------------------------------- chamada
async function anthropic() {
  const apiKey = await anthropicKey();
  if (!apiKey) throw new Fatal("Falta a chave da IA. Cole em Redes Sociais → Conexão.");
  return new Anthropic({ apiKey, timeout: 240_000, maxRetries: 1 });
}

async function call<S extends z.ZodType>(brand: BrandProfile, schema: S, user: string, effort: "low" | "medium"): Promise<{ data: z.infer<S>; usage: Usage }> {
  const model = brand.ai_model || "claude-opus-5-5";
  const fallback = FALLBACK_MODELS.has(model);
  const ai = await anthropic();
  const res = await ai.beta.messages
    .parse({
    model,
    max_tokens: 16000,
    ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    // parte fixa (regras da casa + marca) com cache; a parte variável vem na mensagem
    system: [
      { type: "text", text: HOUSE_RULES },
      { type: "text", text: brandBlock(brand), cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: user }],
    output_config: { format: betaZodOutputFormat(schema), effort },
  })
    .catch((e) => {
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) throw new Fatal("A chave da IA foi recusada pela Anthropic. Confira ou troque em Redes Sociais → Conexão.");
      if (e instanceof Anthropic.BadRequestError && /credit|billing|balance/i.test(e.message)) throw new Fatal("A conta da Anthropic está sem créditos. Adicione créditos em console.anthropic.com → Billing.");
      throw e;
    });
  if (res.stop_reason === "refusal") throw new Fatal("O modelo recusou este pedido. Ajuste o tema.");
  if (res.stop_reason === "max_tokens") throw new Error("Resposta longa demais. Peça um formato menor.");
  if (!res.parsed_output) throw new Error("A IA não devolveu um conteúdo válido.");
  const u = {
    input_tokens: res.usage.input_tokens,
    output_tokens: res.usage.output_tokens,
    cache_read_tokens: res.usage.cache_read_input_tokens ?? 0,
    cache_write_tokens: res.usage.cache_creation_input_tokens ?? 0,
  };
  return { data: res.parsed_output as z.infer<S>, usage: { model: res.model, ...u, cost_usd: cost(res.model, u) } };
}

type Raw = { format?: string; theme: string; post_type: string; caption: string; first_line: string; hashtags: string[]; alt_texts: string[]; keywords: string[] } & Record<string, unknown>;

function finish(raw: Raw, format: FormatKey, brand: BrandProfile) {
  const caption = autofix(raw.caption.startsWith(raw.first_line) || !raw.first_line ? raw.caption : `${raw.first_line}\n\n${raw.caption}`);
  const hashtags = normalizeHashtags(raw.hashtags, Math.min(5, brand.max_hashtags));
  const k = blockKey(format);
  const block = raw[k] as Record<string, unknown> | null;
  // autofix também nos textos das artes
  const fixDeep = (v: unknown): unknown => (typeof v === "string" ? autofix(v) : Array.isArray(v) ? v.map(fixDeep) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([a, b]) => [a, fixDeep(b)])) : v);
  const copy: Record<string, unknown> = { [k]: fixDeep(block), first_line: autofix(raw.first_line), keywords: raw.keywords };
  const issues = lintCaption(caption, hashtags, { maxHashtags: brand.max_hashtags, bannedWords: brand.banned_words, maxEmojis: /nenhum|zero|sem emoji/i.test(brand.emoji_policy ?? "") ? 0 : 1 });
  return { caption, hashtags, copy, issues, alt_texts: raw.alt_texts.map(autofix) };
}

export async function generatePost(
  brand: BrandProfile,
  req: { theme: string; format: FormatKey | "auto"; post_type: string | null; recentThemes: string[]; instruction?: string; current?: unknown; size?: number | null },
): Promise<Generated> {
  const usages: Usage[] = [];
  const schema = schemaFor(req.format);
  const user = [
    `TEMA: ${req.theme}`,
    req.format === "auto" ? "FORMATO: escolha o melhor entre carousel, post, reel e story para este tema." : `FORMATO: ${req.format}`,
    req.post_type ? `TIPO: ${req.post_type}` : "TIPO: escolha o melhor.",
    req.size ? `TAMANHO: o carrossel deve ter exatamente ${req.size} imagens no total, ou seja, ${Math.max(1, req.size - 3)} slide(s) de conteúdo (além da capa, do resumo e da chamada).` : "",
    req.recentThemes.length ? `NÃO REPITA estes temas recentes:\n${req.recentThemes.map((t) => `- ${t}`).join("\n")}` : "",
    req.current ? `VERSÃO ATUAL (refaça a partir dela):\n${JSON.stringify(req.current)}` : "",
    req.instruction ? `O QUE MUDAR: ${req.instruction}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const first = await call(brand, schema, user, "low");
  usages.push(first.usage);
  let raw = first.data as Raw;
  const format = (req.format === "auto" ? (raw.format as FormatKey) : req.format) ?? "carousel";
  let out = finish(raw, format, brand);
  // no máximo 1 correção, enviando só os erros
  if (hasErrors(out.issues)) {
    const fix = await call(
      brand,
      schemaFor(format),
      `Corrija SOMENTE estes problemas e devolva o post completo, igual no resto:\n${out.issues
        .filter((i) => i.level === "error")
        .map((i) => `- ${i.message}`)
        .join("\n")}\n\nPOST:\n${JSON.stringify({ caption: out.caption, hashtags: out.hashtags, ...out.copy })}`,
      "low",
    );
    usages.push(fix.usage);
    raw = { ...(fix.data as Raw), format };
    out = finish(raw, format, brand);
  }
  return { format, theme: autofix(raw.theme), post_type: raw.post_type, ...out, usages };
}

export async function suggestBios(brand: BrandProfile, profile: { name?: string | null; biography?: string | null }, hint: string) {
  const schema = z.object({ suggestions: z.array(z.string()).describe("3 bios diferentes, cada uma com no máximo 150 caracteres") });
  const r = await call(
    brand,
    schema,
    `Escreva 3 sugestões de bio do Instagram (máximo 150 caracteres cada, quebras de linha permitidas, até 1 emoji, sem hashtags).\nBio atual: ${profile.biography ?? "—"}\nNome: ${profile.name ?? "—"}\n${hint ? `Foco: ${hint}` : ""}`,
    "low",
  );
  return { suggestions: r.data.suggestions.map(autofix).filter((s) => [...s].length <= 150).slice(0, 3), usage: r.usage };
}

export async function planThemes(brand: BrandProfile, slots: { format: string; post_type: string; when: string }[], recentThemes: string[]) {
  const schema = z.object({ themes: z.array(z.object({ theme: z.string(), post_type: z.enum(["prova", "ensino", "opiniao", "historia", "oferta"]) })) });
  const r = await call(
    brand,
    schema,
    `Planeje os temas da próxima semana: um tema por horário, nesta ordem, respeitando o tipo indicado (pode trocar só se for repetir tema). Temas específicos e úteis para o público, sem repetir entre si nem os recentes.\n\nHORÁRIOS:\n${slots
      .map((s, i) => `${i + 1}. ${s.when} · ${s.format} · tipo ${s.post_type}`)
      .join("\n")}\n\nTEMAS RECENTES (não repetir):\n${recentThemes.map((t) => `- ${t}`).join("\n") || "—"}`,
    "medium",
  );
  return { themes: r.data.themes.slice(0, slots.length), usage: r.usage };
}
