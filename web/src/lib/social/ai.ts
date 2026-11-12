import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { readSecret } from "@/lib/studio/vault";
import { cleanCaption, flaggedWords, normalizeHashtags } from "./caption";

// Geração de conteúdo com a API da Anthropic, sempre no servidor.
// A chave vem do cofre do Studio (Conexões) ou da variável ANTHROPIC_API_KEY.

export const MODEL = "claude-opus-5-5";
const PRICE = { input: 4 / 1e6, output: 20 / 1e6 }; // US$ por token

export async function anthropicKey() {
  return (await readSecret("anthropic_api_key").catch(() => null)) || process.env.ANTHROPIC_API_KEY || null;
}

export const FORMATS = ["carousel", "single", "reels", "stories", "youtube"] as const;
export type Format = (typeof FORMATS)[number];
export const POST_TYPES = ["prova", "ensino", "opiniao", "historia", "oferta"] as const;

const Slide = z.object({ heading: z.string(), body: z.string() });
const PostSchema = z.object({
  format: z.enum(FORMATS),
  post_type: z.enum(POST_TYPES),
  title: z.string().describe("Título interno curto para a fila de revisão"),
  caption: z.string().describe("Legenda completa, sem hashtags"),
  hashtags: z.array(z.string()),
  alt_text: z.string().describe("Descrição da imagem para acessibilidade"),
  carousel: z
    .object({
      cover: z.object({ headline: z.string(), subtitle: z.string() }),
      slides: z.array(Slide).describe("De 4 a 7 slides de conteúdo"),
      summary: z.array(z.string()).describe("3 a 5 itens de resumo"),
      cta: z.string(),
    })
    .nullable(),
  single: z.object({ headline: z.string(), body: z.string() }).nullable(),
  reels: z
    .object({
      cover_text: z.string(),
      hook: z.string().describe("O que é dito/mostrado nos 2 primeiros segundos"),
      scenes: z.array(z.object({ seconds: z.number(), on_screen_text: z.string(), narration: z.string(), shot: z.string() })),
      music_hint: z.string(),
    })
    .nullable(),
  stories: z.object({ frames: z.array(z.object({ text: z.string(), sticker: z.string().nullable() })) }).nullable(),
  youtube: z
    .object({
      title: z.string(),
      description: z.string(),
      chapters: z.array(z.object({ time: z.string(), label: z.string() })),
      tags: z.array(z.string()),
      thumbnail_text: z.string(),
      script: z.string(),
    })
    .nullable(),
});
const BatchSchema = z.object({ posts: z.array(PostSchema) });
export type GeneratedPost = z.infer<typeof PostSchema>;

export type BrandProfile = {
  entity_id: string;
  display_name: string;
  handle: string | null;
  audience: string | null;
  tone: string | null;
  words_use: string | null;
  words_avoid: string | null;
  positions: string | null;
  colors: Record<string, string>;
  font: string;
  links: Record<string, string>;
  default_cta: string | null;
  max_emojis: number;
  max_hashtags: number;
  link_in_caption: boolean;
  extra_rules: string | null;
  posts_per_week: number;
  posting_days: number[];
  posting_time: string;
  formats: Format[];
  auto_generate: boolean;
  auto_publish: boolean;
};

export type GenContext = {
  recentTitles: string[];
  topPosts: { title: string; format: string; reach: number | null; saves: number | null }[];
  productFacts: string | null;
};

function system(b: BrandProfile) {
  return `Você é o redator e estrategista de redes sociais da marca ${b.display_name}${b.handle ? ` (${b.handle})` : ""}, escrevendo em português do Brasil.

PERFIL DA MARCA
- Público: ${b.audience || "não informado"}
- Tom de voz: ${b.tone || "claro e direto"}
- Palavras que usamos: ${b.words_use || "—"}
- Palavras que evitamos: ${b.words_avoid || "—"}
- Posicionamentos: ${b.positions || "—"}
- Chamada padrão: ${b.default_cta || "—"}
- Links: ${Object.entries(b.links ?? {}).map(([k, v]) => `${k}: ${v}`).join(", ") || "—"}
- Regras extras: ${b.extra_rules || "—"}

REGRAS DE ESCRITA (obrigatórias)
- Escreva como uma pessoa da área, não como IA. Frases curtas, concretas, com exemplos e números do dia a dia do público.
- Nunca use travessão (—). Nunca use palavras genéricas como "revolucionário", "incrível", "jornada", "alavancar", "desbloqueie", "no mundo de hoje".
- No máximo ${b.max_emojis} emoji(s) na legenda e ${b.max_hashtags} hashtags (no campo hashtags, sem # no texto da legenda).
- ${b.link_in_caption ? "Pode citar o link na legenda." : "Não coloque links na legenda: use 'link na bio'."}
- Não invente dados, depoimentos, clientes ou números que não estejam no contexto. Se precisar de exemplo numérico, deixe claro que é um exemplo.
- Não prometa resultado financeiro garantido.
- A primeira linha da legenda precisa prender a atenção (gancho) e o fim deve ter uma chamada para ação.
- Textos das artes são curtos: título até 60 caracteres, corpo de slide até 180 caracteres. Sem emojis nas artes.

TIPOS DE POST: prova (resultado/prova social com dados reais do contexto), ensino (dica prática), opiniao (posição forte da marca), historia (bastidor/caso), oferta (convite direto ao produto).

FORMATOS: preencha só o bloco do formato escolhido; os outros blocos ficam null.
- carousel: capa + 4 a 7 slides + resumo + CTA.
- single: um post de imagem única.
- reels: roteiro de 15 a 40 segundos com gancho nos 2 primeiros segundos, cenas com texto na tela, narração e tomada sugerida.
- stories: 3 a 5 telas; sticker = enquete/caixinha/link sugerido ou null.
- youtube: título, descrição com capítulos, tags, texto da miniatura e roteiro.`;
}

function contextBlock(c: GenContext) {
  const parts = [];
  if (c.productFacts) parts.push(`DADOS REAIS DO PRODUTO (pode usar em posts de prova):\n${c.productFacts}`);
  if (c.topPosts.length)
    parts.push(
      `POSTS QUE MELHOR FUNCIONARAM (repita o que deu certo, sem copiar):\n${c.topPosts
        .map((p) => `- [${p.format}] ${p.title} · alcance ${p.reach ?? "?"} · salvamentos ${p.saves ?? "?"}`)
        .join("\n")}`,
    );
  if (c.recentTitles.length) parts.push(`POSTS RECENTES (não repita estes temas):\n${c.recentTitles.map((t) => `- ${t}`).join("\n")}`);
  return parts.join("\n\n");
}

export type RunResult = { posts: GeneratedPost[]; model: string; inputTokens: number; outputTokens: number; costUsd: number };

async function run(b: BrandProfile, user: string): Promise<RunResult> {
  const apiKey = await anthropicKey();
  if (!apiKey) throw new Error("Chave da Anthropic não configurada. Cadastre em Redes sociais → Conexões.");
  const client = new Anthropic({ apiKey, timeout: 280_000, maxRetries: 1 });
  const res = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: system(b),
    messages: [{ role: "user", content: user }],
    output_config: { format: betaZodOutputFormat(BatchSchema), effort: "medium" },
  });
  if (res.stop_reason === "refusal") throw new Error("O modelo recusou este pedido. Ajuste a instrução e tente de novo.");
  if (res.stop_reason === "max_tokens") throw new Error("A resposta ficou longa demais. Peça menos posts de uma vez.");
  const parsed = res.parsed_output;
  if (!parsed) throw new Error("A IA não devolveu um conteúdo válido. Tente de novo.");
  const inputTokens = res.usage.input_tokens + (res.usage.cache_read_input_tokens ?? 0) + (res.usage.cache_creation_input_tokens ?? 0);
  const outputTokens = res.usage.output_tokens;
  return {
    posts: parsed.posts.map((p) => polish(p, b)),
    model: res.model,
    inputTokens,
    outputTokens,
    costUsd: inputTokens * PRICE.input + outputTokens * PRICE.output,
  };
}

/** Aplica as regras do perfil no texto final (o modelo pode escorregar). */
export function polish(p: GeneratedPost, b: Pick<BrandProfile, "max_emojis" | "max_hashtags" | "link_in_caption" | "words_avoid">): GeneratedPost {
  const rules = { maxEmojis: b.max_emojis, maxHashtags: b.max_hashtags, linkInCaption: b.link_in_caption };
  const strip = (s: string) => s.replace(/\s+—\s+/g, ", ").replace(/[—–]/g, "-");
  return {
    ...p,
    title: strip(p.title).slice(0, 120),
    caption: cleanCaption(p.caption, rules).slice(0, 2200),
    hashtags: normalizeHashtags(p.hashtags, b.max_hashtags),
    alt_text: strip(p.alt_text).slice(0, 1000),
    carousel: p.carousel && {
      cover: { headline: strip(p.carousel.cover.headline), subtitle: strip(p.carousel.cover.subtitle) },
      slides: p.carousel.slides.slice(0, 8).map((s) => ({ heading: strip(s.heading), body: strip(s.body) })),
      summary: p.carousel.summary.slice(0, 6).map(strip),
      cta: strip(p.carousel.cta),
    },
    single: p.single && { headline: strip(p.single.headline), body: strip(p.single.body) },
  };
}

export function warnings(p: { caption: string; content: unknown }, words_avoid?: string | null) {
  return flaggedWords(`${p.caption}\n${JSON.stringify(p.content ?? {})}`, words_avoid);
}

export function generateBatch(b: BrandProfile, ctx: GenContext, plan: { format: Format; post_type?: string; theme?: string }[], extra?: string) {
  const list = plan
    .map((p, i) => `${i + 1}. formato ${p.format}${p.post_type ? `, tipo ${p.post_type}` : ""}${p.theme ? `, tema: ${p.theme}` : ""}`)
    .join("\n");
  return run(
    b,
    `${contextBlock(ctx)}\n\nCrie ${plan.length} post(s), nesta ordem:\n${list}\n\nVarie os tipos de post e os temas. ${extra ? `Instrução adicional: ${extra}` : ""}`.trim(),
  );
}

export function redoPost(b: BrandProfile, ctx: GenContext, current: { format: Format; post_type: string; title: string; caption: string; content: unknown }, instruction: string) {
  return run(
    b,
    `${contextBlock(ctx)}\n\nREFAÇA este post mantendo o formato ${current.format} (devolva exatamente 1 post).\nPost atual:\n${JSON.stringify(
      { title: current.title, post_type: current.post_type, caption: current.caption, content: current.content },
      null,
      1,
    )}\n\nO que mudar: ${instruction || "deixe mais forte e mais específico"}`,
  );
}
