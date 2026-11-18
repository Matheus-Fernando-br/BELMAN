"use server";

import { revalidatePath } from "next/cache";
import { withDefaults, type Config } from "@/lib/studio/planning-math";
import { requireStudio } from "@/lib/studio/session";
import { createClient } from "@/lib/supabase/server";

export type PlanState = { error?: string; message?: string; id?: string } | undefined;
const UUID = /^[0-9a-f-]{36}$/;

async function finance() {
  const ctx = await requireStudio();
  if (!ctx.canSeeFinance) throw new Error("Somente Sócio/Admin usa o Planejamento.");
  return ctx;
}

/** Guarda só as hipóteses do cenário. Nunca altera Financeiro, planos ou preços oficiais. */
function clean(raw: unknown): Config {
  const c = withDefaults(raw as Partial<Config>);
  const n = (v: unknown, min: number, max: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d);
  return {
    ...c,
    growthPct: n(c.growthPct, -50, 200, 8),
    churnPct: n(c.churnPct, 0, 100, 3),
    expenseGrowthPct: n(c.expenseGrowthPct, -50, 100, 1),
    taxPct: n(c.taxPct, 0, 60, 6),
    reservePct: n(c.reservePct, 0, 100, 20),
    hypothetical: (c.hypothetical ?? []).slice(0, 60).map((h) => ({ ...h, name: String(h.name ?? "").slice(0, 80), monthlyCents: n(h.monthlyCents, 0, 1e11, 0) })),
    oneOffs: (c.oneOffs ?? []).slice(0, 120).map((o) => ({ id: String(o.id ?? "").slice(0, 20), entity: String(o.entity ?? "shared").slice(0, 40), month: Math.round(n(o.month, 1, 36, 1)), name: String(o.name ?? "").slice(0, 80), cents: Math.round(n(o.cents, -1e11, 1e11, 0)) })),
    partners: (c.partners ?? []).slice(0, 10).map((p) => ({ name: String(p.name ?? "").slice(0, 60), pct: n(p.pct, 0, 100, 0) })),
    bonuses: (c.bonuses ?? []).slice(0, 10).map((b) => ({ name: String(b.name ?? "").slice(0, 60), kind: b.kind === "fixed" ? "fixed" : "pct", value: n(b.value, 0, 1e11, 0) })),
  };
}

export async function saveScenario(id: string, config: unknown): Promise<PlanState> {
  try {
    await finance();
    if (!UUID.test(id)) return { error: "Cenário inválido." };
    const supabase = await createClient();
    const { error } = await supabase.from("planning_scenarios").update({ config: clean(config) }).eq("id", id);
    if (error) return { error: "Não foi possível salvar." };
    revalidatePath("/studio/planejamento");
    return { message: "Cenário salvo." };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function createScenario(name: string, config: unknown): Promise<PlanState> {
  try {
    await finance();
    const n = name.trim().slice(0, 60);
    if (n.length < 2) return { error: "Dê um nome ao cenário." };
    const supabase = await createClient();
    const { data, error } = await supabase.from("planning_scenarios").insert({ name: n, kind: "personalizado", config: clean(config), sort_order: 50 }).select("id").single();
    if (error || !data) return { error: "Não foi possível criar." };
    revalidatePath("/studio/planejamento");
    return { message: "Cenário criado.", id: data.id };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function deleteScenario(id: string): Promise<PlanState> {
  try {
    await finance();
    if (!UUID.test(id)) return { error: "Cenário inválido." };
    const supabase = await createClient();
    const { count } = await supabase.from("planning_scenarios").select("id", { count: "exact", head: true });
    if ((count ?? 0) <= 1) return { error: "Mantenha pelo menos um cenário." };
    await supabase.from("planning_scenarios").delete().eq("id", id);
    revalidatePath("/studio/planejamento");
    return { message: "Cenário excluído." };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// ---------------------------------------------------------------- planos cadastrados no Studio
// (produtos sem integração, como a FINC hoje; os sincronizados mudam só pelo produto)
export async function saveManualPlan(_: PlanState, form: FormData): Promise<PlanState> {
  try {
    const ctx = await finance();
    const id = String(form.get("id") ?? "");
    const entityId = String(form.get("entity_id"));
    if (!ctx.visible.some((e) => e.id === entityId)) return { error: "Produto inválido." };
    const name = String(form.get("name") ?? "").trim().slice(0, 80);
    const price = Math.round(Number(String(form.get("price") ?? "0").replace(/\./g, "").replace(",", ".")) * 100);
    const subs = Math.max(0, Math.round(Number(form.get("subscribers") ?? 0)));
    const billing = form.get("billing") === "yearly" ? "yearly" : "monthly";
    if (!name) return { error: "Informe o nome do plano." };
    if (!Number.isFinite(price) || price < 0) return { error: "Preço inválido." };
    const supabase = await createClient();
    const row = { entity_id: entityId, name, price_cents: price, billing, subscribers: subs, source: "manual" };
    const { error } = UUID.test(id) ? await supabase.from("product_plans").update(row).eq("id", id) : await supabase.from("product_plans").insert(row);
    if (error) return { error: "Não foi possível salvar o plano." };
    revalidatePath("/studio", "layout");
    return { message: "Plano salvo. O Planejamento já usa o novo preço." };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function deleteManualPlan(form: FormData) {
  await finance();
  const id = String(form.get("id"));
  if (!UUID.test(id)) return;
  const supabase = await createClient();
  await supabase.from("product_plans").delete().eq("id", id).eq("source", "manual");
  revalidatePath("/studio", "layout");
}
