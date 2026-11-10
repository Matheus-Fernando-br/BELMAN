// Dados de EXEMPLO para a Fase 0. Serão substituídos pelos dados reais a partir da Fase 1
// (financeiro), Fase 2 (operações e desenvolvimento) e Fase 3 (vendas e métricas dos produtos).

export const SAMPLE_MONTHS = ["jun", "jul", "ago", "set", "out", "nov"];

type ProductSample = {
  revenue: number[];
  expenses: number[];
  customers: number[];
  mrr: number;
  leads: number[]; // funil: recebido, qualificação, apresentação, proposta, negociação, concluída
};

const PRODUCTS: Record<string, ProductSample> = {
  finc: {
    revenue: [1180, 1460, 1720, 2050, 2380, 2690],
    expenses: [640, 660, 700, 720, 760, 790],
    customers: [31, 39, 47, 58, 69, 79],
    mrr: 2690,
    leads: [64, 41, 27, 16, 10, 7],
  },
  "obra-facil": {
    revenue: [0, 290, 610, 980, 1420, 1890],
    expenses: [420, 450, 490, 530, 560, 600],
    customers: [0, 10, 21, 33, 48, 63],
    mrr: 1890,
    leads: [88, 52, 30, 19, 12, 9],
  },
};

const SHARED_EXPENSES = [380, 380, 410, 410, 440, 460]; // hospedagem, ferramentas, contador
const HOLDING_EXPENSES = [250, 250, 250, 300, 300, 300];
const CASH = 18420;

export type DashboardData = {
  months: string[];
  revenueByProduct: { slug: string; values: number[] }[];
  revenue: number[];
  expenses: number[];
  customersByProduct: { slug: string; values: number[] }[];
  kpis: { revenue: number; prevRevenue: number; expenses: number; prevExpenses: number; result: number; cash: number; customers: number; prevCustomers: number; mrr: number };
  funnel: { stage: string; count: number }[];
  conversion: number;
  tasks: { title: string; entity: string; due: string; late: boolean }[];
  features: { title: string; entity: string; status: string }[];
  bugs: { title: string; entity: string; severity: "crítico" | "alto" }[];
  deliveries: { title: string; entity: string; date: string }[];
  content: { week: number; awaiting: number; published: number };
  alerts: { tone: "bad" | "warn"; text: string; entity: string }[];
};

const STAGES = ["Lead recebido", "Qualificação", "Apresentação", "Proposta enviada", "Negociação", "Venda concluída"];

const TASKS = [
  { title: "Fechar parceria com escritório contábil", entity: "finc", due: "12/11", late: false },
  { title: "Gravar tutorial de orçamento em PDF", entity: "obra-facil", due: "08/11", late: true },
  { title: "Revisar contrato do contador", entity: "bellman", due: "05/11", late: true },
  { title: "Onboarding da Construtora Horizonte", entity: "obra-facil", due: "14/11", late: false },
  { title: "Renovar domínio e e-mail", entity: "compartilhado", due: "20/11", late: false },
];

const FEATURES = [
  { title: "Emissão de NFS-e em lote", entity: "finc", status: "Em desenvolvimento" },
  { title: "Fotos da obra no diário", entity: "obra-facil", status: "Em testes" },
  { title: "Conciliação bancária", entity: "finc", status: "Em desenvolvimento" },
];

const BUGS = [
  { title: "PDF do orçamento corta a última linha", entity: "obra-facil", severity: "crítico" as const },
  { title: "Timeout ao emitir NFC-e em horário de pico", entity: "finc", severity: "alto" as const },
];

const DELIVERIES = [
  { title: "Obra Fácil 1.2.0", entity: "obra-facil", date: "18/11" },
  { title: "FINC · relatório de DRE", entity: "finc", date: "25/11" },
  { title: "Reunião mensal de sócios", entity: "bellman", date: "28/11" },
];

const ALERTS = [
  { tone: "bad" as const, text: "2 pagamentos de clientes em atraso", entity: "finc" },
  { tone: "warn" as const, text: "Conta do Render vence em 3 dias", entity: "compartilhado" },
  { tone: "bad" as const, text: "Bug crítico aberto há 4 dias", entity: "obra-facil" },
  { tone: "warn" as const, text: "Meta de novos clientes do mês em 72%", entity: "obra-facil" },
  { tone: "warn" as const, text: "3 conteúdos aguardando revisão", entity: "bellman" },
];

const sum = (arrays: number[][]) => SAMPLE_MONTHS.map((_, i) => arrays.reduce((s, a) => s + (a[i] ?? 0), 0));

/** Builds the sample dashboard for the selected scope (entity slugs). */
export function sampleDashboard(scope: string[]): DashboardData {
  const products = Object.keys(PRODUCTS).filter((slug) => scope.includes(slug));
  const expenseSources = [
    ...products.map((p) => PRODUCTS[p].expenses),
    ...(scope.includes("compartilhado") ? [SHARED_EXPENSES] : []),
    ...(scope.includes("bellman") ? [HOLDING_EXPENSES] : []),
  ];
  const revenue = sum(products.map((p) => PRODUCTS[p].revenue));
  const expenses = sum(expenseSources);
  const customers = sum(products.map((p) => PRODUCTS[p].customers));
  const leads = STAGES.map((_, i) => products.reduce((s, p) => s + PRODUCTS[p].leads[i], 0));
  const last = SAMPLE_MONTHS.length - 1;
  const inScope = <T extends { entity: string }>(list: T[]) => list.filter((x) => scope.includes(x.entity));

  return {
    months: SAMPLE_MONTHS,
    revenueByProduct: products.map((slug) => ({ slug, values: PRODUCTS[slug].revenue })),
    revenue,
    expenses,
    customersByProduct: products.map((slug) => ({ slug, values: PRODUCTS[slug].customers })),
    kpis: {
      revenue: revenue[last],
      prevRevenue: revenue[last - 1],
      expenses: expenses[last],
      prevExpenses: expenses[last - 1],
      result: revenue[last] - expenses[last],
      cash: scope.includes("bellman") ? CASH : Math.round(CASH * (products.length / 2) * 0.4),
      customers: customers[last],
      prevCustomers: customers[last - 1],
      mrr: products.reduce((s, p) => s + PRODUCTS[p].mrr, 0),
    },
    funnel: STAGES.map((stage, i) => ({ stage, count: leads[i] })),
    conversion: leads[0] ? leads[5] / leads[0] : 0,
    tasks: inScope(TASKS),
    features: inScope(FEATURES),
    bugs: inScope(BUGS),
    deliveries: inScope(DELIVERIES),
    content: { week: products.length * 2 + 1, awaiting: Math.min(3, products.length + 1), published: products.length * 3 },
    alerts: inScope(ALERTS),
  };
}
