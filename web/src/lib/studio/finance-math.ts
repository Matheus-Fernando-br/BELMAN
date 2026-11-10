// Cálculos financeiros puros (sem acesso a banco), cobertos por testes.

export type TxLike = {
  type: "income" | "expense";
  amount_cents: number;
  due_date: string; // YYYY-MM-DD
  paid_amount_cents: number | null;
  paid_date: string | null;
  cancelled: boolean;
};

/** "1.234,56", "1234.56", "R$ 1.234" -> centavos. null se inválido. */
export function parseMoney(input: string): number | null {
  const raw = input.replace(/[R$\s]/g, "").trim();
  if (!raw) return null;
  let normalized = raw;
  if (raw.includes(",")) normalized = raw.replace(/\./g, "").replace(",", ".");
  else if ((raw.match(/\./g) ?? []).length > 1 || /\.\d{3}$/.test(raw)) normalized = raw.replace(/\./g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const cents = Math.round(Number(normalized) * 100);
  return Number.isFinite(cents) ? cents : null;
}

export function formatCents(cents: number, { sign = false, whole = false } = {}) {
  const value = (whole ? Math.round(cents / 100) : cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: whole ? 0 : 2,
    minimumFractionDigits: whole ? 0 : 2,
  });
  return sign && cents > 0 ? `+${value}` : value;
}

export function centsToInput(cents: number | null | undefined) {
  if (cents == null) return "";
  return (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const monthKey = (date: string) => date.slice(0, 7);

/** Lista de meses YYYY-MM de `from` até `to`, inclusive. */
export function monthsBetween(from: string, to: string) {
  const out: string[] = [];
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

export function addMonths(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(month: string, withYear = false) {
  const [y, m] = month.split("-").map(Number);
  const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("pt-BR", {
    month: "short",
    year: withYear ? "2-digit" : undefined,
    timeZone: "UTC",
  });
  return label.replace(".", "").replace(" de ", "/");
}

export function lastDayOfMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export type MonthFlow = {
  month: string;
  plannedIn: number;
  plannedOut: number;
  realizedIn: number;
  realizedOut: number;
};

/**
 * Fluxo de caixa por mês. Previsto usa a data prevista e o valor previsto de
 * todos os lançamentos não cancelados; realizado usa a data e o valor pagos.
 */
export function cashFlow(txs: TxLike[], months: string[]): MonthFlow[] {
  const rows = new Map(months.map((m) => [m, { month: m, plannedIn: 0, plannedOut: 0, realizedIn: 0, realizedOut: 0 }]));
  for (const t of txs) {
    if (t.cancelled) continue;
    const planned = rows.get(monthKey(t.due_date));
    if (planned) {
      if (t.type === "income") planned.plannedIn += t.amount_cents;
      else planned.plannedOut += t.amount_cents;
    }
    if (t.paid_date && t.paid_amount_cents != null) {
      const real = rows.get(monthKey(t.paid_date));
      if (real) {
        if (t.type === "income") real.realizedIn += t.paid_amount_cents;
        else real.realizedOut += t.paid_amount_cents;
      }
    }
  }
  return months.map((m) => rows.get(m)!);
}

/** Saldo realizado até `date` (inclusive) a partir do saldo inicial. */
export function balanceAt(txs: TxLike[], opening: number, date: string, contributions = 0) {
  return txs.reduce((sum, t) => {
    if (t.cancelled || !t.paid_date || t.paid_amount_cents == null || t.paid_date > date) return sum;
    return sum + (t.type === "income" ? t.paid_amount_cents : -t.paid_amount_cents);
  }, opening + contributions);
}

/**
 * Burn rate = média do resultado negativo realizado nos últimos meses completos
 * (0 quando a empresa está no azul). Runway = caixa / burn, em meses.
 */
export function burnAndRunway(flows: MonthFlow[], cash: number) {
  const nets = flows.map((f) => f.realizedIn - f.realizedOut);
  const avgNet = nets.length ? nets.reduce((a, b) => a + b, 0) / nets.length : 0;
  const burn = avgNet < 0 ? Math.round(-avgNet) : 0;
  const runway = burn > 0 ? cash / burn : null; // null = sem queima (infinito)
  return { burn, runway, avgNet: Math.round(avgNet) };
}

/**
 * Ponto de equilíbrio: receita necessária para cobrir os custos fixos, dada a
 * margem de contribuição ((receita - custos variáveis) / receita).
 */
export function breakEven(revenue: number, variableCosts: number, fixedCosts: number) {
  if (revenue <= 0) return null;
  const margin = (revenue - variableCosts) / revenue;
  if (margin <= 0) return null;
  return Math.round(fixedCosts / margin);
}
