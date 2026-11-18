import { cashProjection, distribute, expensesByMonth, expensesByGroup, projectProduct, splitOf, sumMonths, totals, withDefaults, type Base } from "./planning-math";

const base: Base = {
  products: [
    { slug: "finc", name: "FINC", color: "#0a0" },
    { slug: "obra-facil", name: "Obra Fácil", color: "#c50" },
  ],
  plans: [
    { id: "a", entity: "obra-facil", name: "Básico", priceCents: 2500, billing: "monthly", subscribers: 10, source: "sync" },
    { id: "b", entity: "obra-facil", name: "Anual", priceCents: 120000, billing: "yearly", subscribers: 2, source: "sync" },
    { id: "c", entity: "finc", name: "Pro", priceCents: 5000, billing: "monthly", subscribers: 4, source: "manual" },
  ],
  expenses: { "obra-facil": { tecnologia: 10000 }, finc: { marketing: 5000 } },
  shared: { servicos: 20000 },
  defaultSplit: { finc: 50, "obra-facil": 50 },
  taxesActual: {},
  revenueActual: {},
  baseMonths: [],
  cash: { consolidado: 100000 },
  startMonth: "2026-12",
};

describe("planejamento", () => {
  it("receita do mês 1 soma mensal + anual/12", () => {
    const c = withDefaults({ growthPct: 0, churnPct: 0, taxPct: 0, expenseGrowthPct: 0 });
    const m = projectProduct(base, c, "obra-facil");
    expect(m).toHaveLength(12);
    expect(m[0].revenue).toBe(10 * 2500 + 2 * 10000);
  });
  it("rateia as compartilhadas pelo split e soma hipóteses", () => {
    const c = withDefaults({ split: { finc: 25, "obra-facil": 75 }, hypothetical: [{ id: "h", entity: "shared", group: "manutencao", name: "x", monthlyCents: 4000 }] });
    expect(splitOf(base, c)).toEqual({ finc: 0.25, "obra-facil": 0.75 });
    const e = expensesByGroup(base, c, "obra-facil");
    expect(e.servicos).toBe(15000);
    expect(e.tecnologia).toBe(10000);
    expect(e.manutencao).toBe(3000);
  });
  it("ajuste de despesa substitui o oficial sem mexer no Financeiro", () => {
    const c = withDefaults({ expenseOverride: { finc: { marketing: 0 } } });
    expect(expensesByGroup(base, c, "finc").marketing).toBe(0);
  });
  it("crescimento líquido composto e consolidado = soma dos produtos", () => {
    const c = withDefaults({ growthPct: 10, churnPct: 0, horizon: 24 });
    const of = projectProduct(base, c, "obra-facil");
    expect(of).toHaveLength(24);
    expect(of[1].subscribers).toBeCloseTo(12 * 1.1);
    const all = sumMonths([of, projectProduct(base, c, "finc")]);
    expect(all[0].revenue).toBe(of[0].revenue + projectProduct(base, c, "finc")[0].revenue);
    expect(totals(all).revenue).toBe(all.reduce((s, m) => s + m.revenue, 0));
  });
  it("impostos pela alíquota e lucro líquido", () => {
    const c = withDefaults({ growthPct: 0, churnPct: 0, taxPct: 10, expenseGrowthPct: 0 });
    const [m] = projectProduct(base, c, "finc");
    expect(m.revenue).toBe(20000);
    expect(m.taxes).toBe(2000);
    expect(m.expenses).toBe(5000 + 10000);
    expect(m.net).toBe(20000 - 2000 - 15000);
  });
  it("lançamento pontual entra só no mês dele e o caixa acumula", () => {
    const c = withDefaults({ growthPct: 0, churnPct: 0, taxPct: 0, expenseGrowthPct: 0, oneOffs: [{ id: "o", entity: "shared", month: 2, name: "Notebook", cents: -10000 }] });
    const of = projectProduct(base, c, "obra-facil");
    expect(of[0].extra).toBe(0);
    expect(of[1].extra).toBe(-5000);
    expect(of[1].net).toBe(of[0].net - 5000);
    const cash = cashProjection(of.slice(0, 2), 1000);
    expect(cash).toEqual([1000 + of[0].net, 1000 + of[0].net + of[1].net]);
  });
  it("despesas por grupo crescem mês a mês na planilha", () => {
    const c = withDefaults({ expenseGrowthPct: 10, horizon: 12 });
    const rows = expensesByMonth(base, c, "obra-facil");
    expect(rows).toHaveLength(12);
    expect(rows[1].tecnologia).toBe(11000);
  });
  it("distribui: reserva, gratificações e sócios; prejuízo não distribui", () => {
    const c = withDefaults({
      reservePct: 20,
      bonuses: [{ name: "Bônus", kind: "pct", value: 10 }],
      partners: [
        { name: "A", pct: 50 },
        { name: "B", pct: 30 },
        { name: "C", pct: 20 },
      ],
    });
    const d = distribute(100000, c);
    expect(d.reserve).toBe(20000);
    expect(d.bonuses[0].amount).toBe(8000);
    expect(d.distributable).toBe(72000);
    expect(d.partners.map((p) => p.amount)).toEqual([36000, 21600, 14400]);
    expect(distribute(-5000, c).partners.every((p) => p.amount === 0)).toBe(true);
  });
});
