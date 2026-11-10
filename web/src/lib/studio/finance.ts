import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CONSOLIDATED, filterOptions, resolveFilter, type FilterOption } from "./filter";
import { balanceAt, type TxLike } from "./finance-math";
import { requireStudio, type Entity, type StudioContext } from "./session";

export type Category = { id: string; name: string; type: "income" | "expense"; group_name: string | null; is_fixed: boolean; active: boolean; sort_order: number };
export type Account = { id: string; entity_id: string; name: string; kind: string; opening_balance_cents: number; opening_date: string; active: boolean };
export type Counterparty = { id: string; name: string; kind: string; document: string | null; email: string | null };
export type AllocationRule = { id: string; name: string; description: string | null; active: boolean; shares: { entity_id: string; percent: number }[] };

export type TxRow = TxLike & {
  id: string;
  entity_id: string;
  entity_slug: string;
  entity_name: string;
  entity_color: string;
  description: string;
  category_id: string | null;
  category_name: string | null;
  counterparty_id: string | null;
  counterparty_name: string | null;
  account_id: string | null;
  account_name: string | null;
  allocation_rule_id: string | null;
  allocation_rule_name: string | null;
  recurrence_id: string | null;
  attachment_path: string | null;
  notes: string | null;
  source: string;
  status: "planned" | "paid" | "overdue" | "cancelled";
  created_at: string;
  updated_at: string;
};

export type AllocatedRow = TxLike & { transaction_id: string; entity_id: string; origin_entity_id: string; allocated: boolean; category_id: string | null };

export const STATUS_LABEL = { planned: "Previsto", paid: "Realizado", overdue: "Atrasado", cancelled: "Cancelado" } as const;
export const STATUS_TONE = { planned: "neutral", paid: "ok", overdue: "bad", cancelled: "neutral" } as const;

export type FinanceContext = StudioContext & {
  filter: FilterOption;
  scope: Entity[]; // entidades no escopo do filtro global
  scopeIds: string[];
};

/** Garante acesso ao Financeiro e resolve o escopo do filtro global. */
export async function requireFinance(raw?: string | string[]): Promise<FinanceContext> {
  const ctx = await requireStudio();
  if (!ctx.canSeeFinance) redirect("/studio?erro=restrito");
  const filter = resolveFilter(raw, filterOptions(ctx.visible, ctx.fullAccess));
  const scope = filter.slug === CONSOLIDATED ? ctx.visible : ctx.visible.filter((e) => e.slug === filter.slug);
  return { ...ctx, filter, scope, scopeIds: scope.map((e) => e.id) };
}

export function todayISO() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}

export async function loadLookups() {
  const supabase = await createClient();
  const [cats, accs, parties, rules, shares] = await Promise.all([
    supabase.from("fin_categories").select("*").order("type").order("sort_order").order("name"),
    supabase.from("fin_accounts").select("*").order("name"),
    supabase.from("fin_counterparties").select("id,name,kind,document,email").order("name"),
    supabase.from("fin_allocation_rules").select("*").order("name"),
    supabase.from("fin_allocation_shares").select("*"),
  ]);
  return {
    categories: (cats.data ?? []) as Category[],
    accounts: (accs.data ?? []) as Account[],
    counterparties: (parties.data ?? []) as Counterparty[],
    rules: ((rules.data ?? []) as Omit<AllocationRule, "shares">[]).map((r) => ({
      ...r,
      shares: (shares.data ?? []).filter((s) => s.rule_id === r.id).map((s) => ({ entity_id: s.entity_id as string, percent: Number(s.percent) })),
    })),
  };
}

/** Lançamentos (lista) cuja data prevista OU realizada cai no período, da(s) entidade(s) de origem. */
export async function loadTransactions(scopeIds: string[], from: string, to: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fin_transactions_view")
    .select("*")
    .in("entity_id", scopeIds)
    .or(`and(due_date.gte.${from},due_date.lte.${to}),and(paid_date.gte.${from},paid_date.lte.${to})`)
    .order("due_date", { ascending: true })
    .limit(2000);
  if (error) throw new Error("Falha ao carregar lançamentos.");
  return (data ?? []) as TxRow[];
}

/** Valores com rateio aplicado (para resultados e fluxo por produto). */
export async function loadAllocated(scopeIds: string[], from: string, to: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fin_allocated")
    .select("*")
    .in("entity_id", scopeIds)
    .or(`and(due_date.gte.${from},due_date.lte.${to}),and(paid_date.gte.${from},paid_date.lte.${to})`)
    .limit(5000);
  if (error) throw new Error("Falha ao carregar valores.");
  return (data ?? []) as AllocatedRow[];
}

/**
 * Saldo disponível hoje no escopo: saldos iniciais das contas + lançamentos
 * realizados + aportes - retiradas (entidades de origem).
 */
export async function cashToday(scopeIds: string[]) {
  const supabase = await createClient();
  const today = todayISO();
  const [accs, txs, contributions] = await Promise.all([
    supabase.from("fin_accounts").select("opening_balance_cents").in("entity_id", scopeIds).eq("active", true),
    supabase
      .from("fin_transactions")
      .select("type,amount_cents,due_date,paid_amount_cents,paid_date,cancelled")
      .in("entity_id", scopeIds)
      .not("paid_date", "is", null)
      .lte("paid_date", today)
      .limit(10000),
    supabase.from("fin_partner_contributions").select("kind,amount_cents,date").in("entity_id", scopeIds).lte("date", today),
  ]);
  const opening = (accs.data ?? []).reduce((s, a) => s + Number(a.opening_balance_cents), 0);
  const contrib = (contributions.data ?? []).reduce(
    (s, c) => s + (c.kind === "contribution" ? Number(c.amount_cents) : -Number(c.amount_cents)),
    0,
  );
  return balanceAt((txs.data ?? []) as TxLike[], opening, today, contrib);
}

export function scopeQuery(filter: FilterOption) {
  return filter.slug === CONSOLIDATED ? "" : `e=${filter.slug}`;
}
