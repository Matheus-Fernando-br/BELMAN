import "server-only";
import { createClient } from "@/lib/supabase/server";
import { addMonths, lastDayOfMonth, monthKey, monthsBetween } from "./finance-math";
import type { Base, ExpenseGroup, PlanBase } from "./planning-math";
import type { StudioContext } from "./session";
import { todayLocal } from "./scope";
import { cashToday } from "./finance";

// Dados oficiais do Studio para o Planejamento (só leitura): planos e preços,
// despesas do Financeiro (média dos 3 últimos meses fechados) e o rateio da holding.

type Group = ExpenseGroup | "impostos";

/** Mesmo critério da migração 0013 (usado se a categoria ainda não tiver grupo). */
export function groupOf(name: string, planGroup?: string | null): Group {
  if (planGroup) return planGroup as Group;
  const n = name.toLowerCase();
  if (n.startsWith("marketing")) return "marketing";
  if (n.startsWith("impostos")) return "impostos";
  if (["infraestrutura", "ferramentas", "domínio", "dominio", "inteligência", "inteligencia", "lojas de aplicativos"].some((p) => n.startsWith(p))) return "tecnologia";
  if (["contabilidade", "pessoas", "prestadores"].some((p) => n.startsWith(p))) return "servicos";
  if (n.startsWith("manuten")) return "manutencao";
  if (n.startsWith("taxas de pagamento")) return "operacional";
  return "outras";
}

export async function loadPlanningBase(ctx: StudioContext): Promise<Base> {
  const supabase = await createClient();
  const products = ctx.visible.filter((e) => e.kind === "product");
  const productIds = products.map((p) => p.id);
  const slugOf = new Map(ctx.visible.map((e) => [e.id, e]));
  const current = monthKey(todayLocal());
  const baseMonths = monthsBetween(addMonths(current, -3), addMonths(current, -1));
  const from = `${baseMonths[0]}-01`;
  const to = lastDayOfMonth(baseMonths.at(-1)!);

  const allIds = ctx.visible.map((e) => e.id);
  const [{ data: plans }, { data: snaps }, { data: txs }, { data: cats }, { data: rules }, cashAll, ...cashProducts] = await Promise.all([
    supabase.from("product_plans").select("id,entity_id,name,price_cents,billing,subscribers,source,active,sort_order").in("entity_id", productIds).eq("active", true).order("sort_order"),
    supabase.from("product_revenue_snapshots").select("entity_id,day,subscriptions").in("entity_id", productIds).order("day", { ascending: false }).limit(20),
    supabase
      .from("fin_transactions")
      .select("entity_id,type,category_id,amount_cents,paid_amount_cents,due_date,paid_date,cancelled")
      .in("entity_id", ctx.visible.map((e) => e.id))
      .eq("cancelled", false)
      .or(`and(paid_date.gte.${from},paid_date.lte.${to}),and(paid_date.is.null,due_date.gte.${from},due_date.lte.${to})`)
      .limit(5000),
    supabase.from("fin_categories").select("*").eq("type", "expense"),
    supabase.from("fin_allocation_rules").select("active,fin_allocation_shares(entity_id,percent)").eq("active", true).limit(1),
    cashToday(allIds).catch(() => 0),
    ...products.map((p) => cashToday([p.id]).catch(() => 0)),
  ]);

  // planos: catálogo oficial; sem catálogo ainda, usa o último retrato sincronizado
  const planList: PlanBase[] = (plans ?? []).map((p) => ({
    id: p.id,
    entity: slugOf.get(p.entity_id)!.slug,
    name: p.name,
    priceCents: Number(p.price_cents),
    billing: p.billing === "yearly" ? "yearly" : "monthly",
    subscribers: p.subscribers,
    source: p.source === "sync" ? "sync" : "manual",
  }));
  for (const prod of products) {
    if (planList.some((p) => p.entity === prod.slug)) continue;
    const snap = (snaps ?? []).find((s) => s.entity_id === prod.id);
    const byPlan = (snap?.subscriptions?.byPlan ?? []) as { planId: string; planName: string; priceCents: number; active: number }[];
    for (const b of byPlan) planList.push({ id: `snap:${prod.slug}:${b.planId}`, entity: prod.slug, name: b.planName, priceCents: b.priceCents, billing: "monthly", subscribers: b.active, source: "snapshot" });
  }

  const catGroup = new Map((cats ?? []).map((c) => [c.id, groupOf(c.name, (c as { plan_group?: string | null }).plan_group)]));
  const expenses: Base["expenses"] = Object.fromEntries(products.map((p) => [p.slug, {}]));
  const shared: Base["shared"] = {};
  const taxesActual: Record<string, number> = {};
  const revenueActual: Record<string, number> = {};
  const months = baseMonths.length;
  for (const t of txs ?? []) {
    const e = slugOf.get(t.entity_id);
    if (!e) continue;
    const value = Number(t.paid_amount_cents ?? t.amount_cents) / months;
    if (t.type === "income") {
      revenueActual[e.slug] = (revenueActual[e.slug] ?? 0) + value;
      continue;
    }
    const g = t.category_id ? (catGroup.get(t.category_id) ?? "outras") : "outras";
    if (g === "impostos") {
      taxesActual[e.slug] = (taxesActual[e.slug] ?? 0) + value;
      continue;
    }
    if (e.kind === "product") expenses[e.slug][g] = (expenses[e.slug][g] ?? 0) + value;
    else shared[g] = (shared[g] ?? 0) + value; // holding e Compartilhado: rateados
  }

  const defaultSplit: Record<string, number> = {};
  const shares = (rules?.[0]?.fin_allocation_shares ?? []) as { entity_id: string; percent: number }[];
  for (const s of shares) {
    const e = slugOf.get(s.entity_id);
    if (e?.kind === "product") defaultSplit[e.slug] = Number(s.percent);
  }

  return {
    products: products.map((p) => ({ slug: p.slug, name: p.name, color: p.color })),
    plans: planList,
    expenses,
    shared,
    defaultSplit,
    taxesActual,
    revenueActual,
    baseMonths,
    cash: { consolidado: cashAll, ...Object.fromEntries(products.map((p, i) => [p.slug, cashProducts[i]])) },
    startMonth: addMonths(current, 1),
  };
}
