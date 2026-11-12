// Formato da saída estruturada da IA (social_posts.copy), por formato de post.
// Os templates do worker desenham a partir daqui; editar o texto re-renderiza sem IA.

export type Slide = { title: string; body: string; kind: "dor" | "conteudo" | "lista" | "numero" | "citacao"; items: string[]; number: string | null };

export type CarouselCopy = { cover: { kicker: string; title: string; subtitle: string }; slides: Slide[]; recap: string[]; cta: string };
export type PostCopy = { kicker: string; title: string; body: string };
export type ReelCopy = { hook: string; beats: { on_screen_text: string; voiceover: string; seconds: number }[]; cta: string };
export type StoryCopy = { frames: { text: string; sticker_suggestion: string | null }[] };
export type YoutubeCopy = { title: string; description: string; chapters: { time: string; label: string }[]; tags: string[]; thumbnail_text: string; script: string };

export type CommonCopy = { first_line: string; keywords: string[] };

export type AnyCopy = Partial<CommonCopy> & {
  carousel?: CarouselCopy | null;
  post?: PostCopy | null;
  reel?: ReelCopy | null;
  story?: StoryCopy | null;
  youtube?: YoutubeCopy | null;
};

/** Rótulos amigáveis para o editor genérico. */
export const COPY_LABELS: Record<string, string> = {
  carousel: "Carrossel",
  post: "Post",
  reel: "Roteiro do Reels",
  story: "Stories",
  youtube: "YouTube",
  cover: "Capa",
  kicker: "Chapéu (acima do título)",
  title: "Título",
  subtitle: "Subtítulo",
  slides: "Slides",
  body: "Texto",
  kind: "Tipo do slide",
  items: "Itens da lista (um por linha)",
  number: "Número em destaque",
  recap: "Resumo (um por linha)",
  cta: "Chamada para ação",
  hook: "Gancho (2 primeiros segundos)",
  beats: "Batidas",
  on_screen_text: "Texto na tela",
  voiceover: "Narração",
  seconds: "Segundos",
  frames: "Telas",
  text: "Texto",
  sticker_suggestion: "Figurinha sugerida",
  description: "Descrição",
  chapters: "Capítulos",
  time: "Tempo",
  label: "Rótulo",
  tags: "Tags (uma por linha)",
  thumbnail_text: "Texto da miniatura",
  script: "Roteiro",
  first_line: "Primeira linha",
  keywords: "Palavras-chave (uma por linha)",
};
