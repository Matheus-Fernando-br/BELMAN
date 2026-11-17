// Motor do Planejamento: puro (sem banco), usado na tela para recalcular na hora.
// Valores em centavos. "Base" = dados oficiais do Studio; "config" = hipóteses do cenário.

export const EXPENSE_GROUPS = [
  ["marketing", "Marketing e publicidade"],
  ["tecnologia", "Tecnologia e infraestrutura"],
  ["servicos", "Serviços e prestadores"],
  ["manutencao", "Manutenção"],
  ["operacional", "Despesas operacionais"],
  ["outras", "Outras despesas"],
] as const;
export type ExpenseGroup = (typeof EXPENSE_GROUPS)[number][0];

export type PlanBase = { id: string; entity: string; name: string; priceCents: number; billing: "monthly" | "yearly"; subscribers: number; source: "sync" | "manual" | "snapshot" };
export type ProductBase = { slug: string; name: string; color: string };
export type Base = {
  products: ProductBase[];
  plans: PlanBase[];
  /** Média mensal oficial (Financeiro, últimos 3 meses) por produto e grupo. Impostos ficam de fora (usam a alíquota). */
  expenses: Record<string, Partial<Record<ExpenseGroup, number>>>;
  /** Despesas da holding e compartilhadas (a ratear), por grupo. */
  shared: Partial<Record<ExpenseGroup, number>>;
  /** Rateio padrão do Financeiro (% por produto). */
  defaultSplit: Record<string, number>;
  /** Impostos lançados no Financeiro (média mensal), só para referência. */
  taxesActual: Record<string, number>;
  /** Receita realizada (média mensal), só para referência. */
  revenueActual: Record<string, number>;
  baseMonths: string[];
};

export type Hypothetical = { id: string; entity: string; group: ExpenseGroup; name: string; monthlyCents: number };
export type Partner = { name: string; pct: number };
export type Bonus = { name: string; kind: "pct" | "fixed"; value: number };

export type Config = {
  growthPct: number; // crescimento de assinantes ao mês (%)
  churnPct: number; // cancelamentos ao mês (%)
  expenseGrowthPct: number; // aumento das despesas ao mês (%)
  taxPct: number; // impostos sobre o faturamento (%)
  reservePct: number; // reserva da empresa sobre o lucro (%)
  horizon: 12 | 24 | 36;
  plans: Record<string, { subscribers?: number; priceCents?: number }>;
  expenseOverride: Record<string, Partial<Record<ExpenseGroup, number>>>; // valor mensal no lugar do oficial
  hypothetical: Hypothetical[];
  split: Record<string, number>; // rateio das compartilhadas (% por produto)
  partners: Partner[];
  bonuses: Bonus[];
};

export const DEFAULT_CONFIG: Config = {
  growthPct: 8,
  churnPct: 3,
  expenseGrowthPct: 1,
  taxPct: 6,
  reservePct: 20,
  horizon: 12,
  plans: {},
  expenseOverride: {},
  hypothetical: [],
  split: {},
  partners: [
    { name: "Sócio 1", pct: 33.34 },
    { name: "Sócio 2", pct: 33.33 },
    { name: "Sócio 3", pct: 33.33 },
  ],
  bonuses: [],
};

export function withDefaults(raw: Partial<Config> | null | undefined): Config {
  const c = { ...DEFAULT_CONFIG, ...(raw ?? {}) } as Config;
  if (![12, 24, 36].includes(c.horizon)) c.horizon = 12;
  if (!Array.isArray(c.partners) || !c.partners.length) c.partners = DEFAULT_CONFIG.partners;
  return c;
}

const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);

export const planPrice = (p: PlanBase, c: Config) => Math.max(0, num(c.plans[p.id]?.priceCents, p.priceCents));
export const planSubscribers = (p: PlanBase, c: Config) => Math.max(0, num(c.plans[p.id]?.subscribers, p.subscribers));
/** Receita mensal equivalente de um assinante (anual dividido por 12). */
export const monthlyOf = (p: PlanBase, c: Config) => (p.billing === "yearly" ? planPrice(p, c) / 12 : planPrice(p, c));

export function splitOf(base: Base, c: Config) {
  const slugs = base.products.map((p) => p.slug);
  const raw = slugs.map((s) => num(c.split[s], num(base.defaultSplit[s], 100 / Math.max(1, slugs.length))));
  const total = raw.reduce((a, b) => a + b, 0) || 1;
  return Object.fromEntries(slugs.map((s, i) => [s, raw[i] / total])) as Record<string, number>;
}

/** Despesa mensal (mês 0) por grupo de um produto: oficial (ou ajuste) + parte das compartilhadas + hipóteses. */
export function expensesByGroup(base: Base, c: Config, slug: string) {
  const share = splitOf(base, c)[slug] ?? 0;
  const out = {} as Record<ExpenseGroup, number>;
  for (const [g] of EXPENSE_GROUPS) {
    const own = num(c.expenseOverride[slug]?.[g], num(base.expenses[slug]?.[g]));
    const shared = num(c.expenseOverride.shared?.[g], num(base.shared[g])) * share;
    const hyp = c.hypothetical.filter((h) => h.group === g && (h.entity === slug || h.entity === "shared")).reduce((s, h) => s + num(h.monthlyCents) * (h.entity === "shared" ? share : 1), 0);
    out[g] = Math.round(own + shared + hyp);
  }
  return out;
}

export type Month = { index: number; subscribers: number; revenue: number; taxes: number; expenses: number; net: number };

/** Projeção mês a mês de um produto (mês 1 = próximo mês). */
export function projectProduct(base: Base, c: Config, slug: string): Month[] {
  const plans = base.plans.filter((p) => p.entity === slug);
  const net = 1 + (num(c.growthPct) - num(c.churnPct)) / 100;
  const eg = 1 + num(c.expenseGrowthPct) / 100;
  const exp0 = Object.values(expensesByGroup(base, c, slug)).reduce((a, b) => a + b, 0);
  const months: Month[] = [];
  for (let m = 1; m <= c.horizon; m++) {
    const factor = Math.pow(Math.max(0, net), m - 1);
    let subs = 0;
    let revenue = 0;
    for (const p of plans) {
      const s = planSubscribers(p, c) * factor;
      subs += s;
      revenue += s * monthlyOf(p, c);
    }
    const taxes = (revenue * num(c.taxPct)) / 100;
    const expenses = exp0 * Math.pow(eg, m - 1);
    months.push({ index: m, subscribers: subs, revenue: Math.round(revenue), taxes: Math.round(taxes), expenses: Math.round(expenses), net: Math.round(revenue - taxes - expenses) });
  }
  return months;
}

export function sumMonths(list: Month[][]): Month[] {
  const len = Math.max(0, ...list.map((l) => l.length));
  return Array.from({ length: len }, (_, i) => ({
    index: i + 1,
    subscribers: list.reduce((s, l) => s + (l[i]?.subscribers ?? 0), 0),
    revenue: list.reduce((s, l) => s + (l[i]?.revenue ?? 0), 0),
    taxes: list.reduce((s, l) => s + (l[i]?.taxes ?? 0), 0),
    expenses: list.reduce((s, l) => s + (l[i]?.expenses ?? 0), 0),
    net: list.reduce((s, l) => s + (l[i]?.net ?? 0), 0),
  }));
}

export function totals(months: Month[]) {
  const t = months.reduce((a, m) => ({ revenue: a.revenue + m.revenue, taxes: a.taxes + m.taxes, expenses: a.expenses + m.expenses, net: a.net + m.net }), { revenue: 0, taxes: 0, expenses: 0, net: 0 });
  return { ...t, margin: t.revenue > 0 ? (t.net / t.revenue) * 100 : null };
}

export type Distribution = {
  profit: number;
  reserve: number;
  afterReserve: number;
  bonuses: { name: string; amount: number }[];
  distributable: number;
  partners: { name: string; pct: number; amount: number }[];
  partnersPctTotal: number;
};

/** Divisão do lucro: reservas → gratificações → sócios (pela participação). Prejuízo não é distribuído. */
export function distribute(profit: number, c: Config, periodMonths = 1): Distribution {
  const p = Math.max(0, profit);
  const reserve = Math.round((p * Math.min(100, Math.max(0, num(c.reservePct)))) / 100);
  const afterReserve = p - reserve;
  let left = afterReserve;
  const bonuses = c.bonuses.map((b) => {
    const amount = Math.min(left, Math.round(b.kind === "pct" ? (afterReserve * Math.max(0, num(b.value))) / 100 : Math.max(0, num(b.value)) * periodMonths));
    left -= amount;
    return { name: b.name, amount };
  });
  const partnersPctTotal = c.partners.reduce((s, x) => s + Math.max(0, num(x.pct)), 0);
  const partners = c.partners.map((x) => ({ name: x.name, pct: num(x.pct), amount: partnersPctTotal > 0 ? Math.round((left * Math.max(0, num(x.pct))) / partnersPctTotal) : 0 }));
  return { profit: p, reserve, afterReserve, bonuses, distributable: left, partners, partnersPctTotal };
}
