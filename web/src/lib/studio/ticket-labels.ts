// Rótulos dos chamados (usados no servidor e no navegador).

export const TICKET_KIND = [
  ["melhoria", "Sugestão de melhoria"],
  ["problema", "Problema / erro"],
  ["duvida", "Dúvida"],
  ["outro", "Outro"],
] as const;
export const TICKET_STATUS = [
  ["aberto", "Aberto", "warn"],
  ["em_analise", "Em análise", "neutral"],
  ["concluido", "Concluído", "ok"],
  ["recusado", "Não será feito", "bad"],
] as const;
export const TICKET_PRIORITY = [
  ["baixa", "Baixa"],
  ["media", "Média"],
  ["alta", "Alta"],
] as const;
export const isClosed = (s: string) => s === "concluido" || s === "recusado";
export const ticketLabel = (list: readonly (readonly string[])[], v: string | null | undefined) => list.find((x) => x[0] === v)?.[1] ?? v ?? "—";
export const ticketTone = (s: string) => TICKET_STATUS.find((x) => x[0] === s)?.[2] ?? "neutral";
