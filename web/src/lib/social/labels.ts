// Rótulos e opções do módulo Redes Sociais (usados no servidor e no navegador).

export const FORMATS = [
  ["carousel", "Carrossel"],
  ["post", "Post único"],
  ["reel", "Reels"],
  ["story", "Stories"],
  ["youtube_video", "Vídeo do YouTube"],
  ["youtube_thumbnail", "Miniatura do YouTube"],
] as const;

export const POST_TYPES = [
  ["ensino", "Ensino"],
  ["prova", "Prova"],
  ["opiniao", "Opinião"],
  ["historia", "História"],
  ["oferta", "Oferta"],
] as const;

export const STATUS = [
  ["draft", "Rascunho", "neutral"],
  ["generating", "Gerando texto", "warn"],
  ["rendering", "Renderizando", "warn"],
  ["review", "Aguardando revisão", "warn"],
  ["approved", "Aprovado", "ok"],
  ["scheduled", "Agendado", "ok"],
  ["publishing", "Publicando", "warn"],
  ["published", "Publicado", "ok"],
  ["failed", "Falhou", "bad"],
  ["rejected", "Rejeitado", "neutral"],
] as const;

export const ACCOUNT_STATUS: Record<string, [string, string]> = {
  connected: ["Conectada", "ok"],
  expiring: ["Token vencendo", "warn"],
  expired: ["Token expirado", "bad"],
  error: ["Erro", "bad"],
  disconnected: ["Desconectada", "neutral"],
};

export const TOKEN_KIND: Record<string, string> = {
  ig_user: "Login do Instagram (renova sozinho a cada 60 dias)",
  fb_user: "Usuário do Facebook (vence em ~60 dias, sem renovação automática)",
  fb_system_user: "System User (não expira)",
};

export const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export const statusLabel = (s: string) => STATUS.find(([k]) => k === s)?.[1] ?? s;
export const statusTone = (s: string) => STATUS.find(([k]) => k === s)?.[2] ?? "neutral";
export const formatLabel = (s: string) => FORMATS.find(([k]) => k === s)?.[1] ?? s;
export const typeLabel = (s?: string | null) => POST_TYPES.find(([k]) => k === s)?.[1] ?? "Automático";

export const BUSY = ["draft", "generating", "rendering", "publishing"];

export function dateTimeBR(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
