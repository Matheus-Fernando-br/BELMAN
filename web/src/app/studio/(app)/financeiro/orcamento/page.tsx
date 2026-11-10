import type { Metadata } from "next";
import Link from "next/link";
import { loadAllocated, loadLookups, requireFinance, todayISO } from "@/lib/studio/finance";
import { centsToInput, formatCents, monthKey, monthLabel, monthsBetween } from "@/lib/studio/finance-math";
import { createClient } from "@/lib/supabase/server";
import { BudgetForm } from "./BudgetForm";

export const metadata: Metadata = { title: "Orçamento" };

export default async function BudgetPage({ searchParams }: { searchParams: Promise<{ e?: string; ano?: string; ent?: string }> }) {
  const params = await searchParams;
  const ctx = await requireFinance(params.e);
  const today = todayISO();
  const year = /^\d{4}$/.test(params.ano ?? "") ? params.ano! : today.slice(0, 4);
  const entity = ctx.scope.find((e) => e.slug === params.ent) ?? (ctx.scope.length === 1 ? ctx.scope[0] : ctx.scope.find((e) => e.kind === "product") ?? ctx.scope[0]);
  const months = monthsBetween(`${year}-01`, `${year}-12`);
  const supabase = await createClient();
  const [{ categories }, budgets, actual] = await Promise.all([
    loadLookups(),
    supabase.from("fin_budgets").select("category_id,month,amount_cents").eq("entity_id", entity.id).gte("month", `${year}-01-01`).lte("month", `${year}-12-01`),
    loadAllocated([entity.id], `${year}-01-01`, `${year}-12-31`),
  ]);
  const cats = categories.filter((c) => c.active);
  const budget = new Map((budgets.data ?? []).map((b) => [`${b.category_id}_${String(b.month).slice(0, 7)}`, Number(b.amount_cents)]));
  const current = monthKey(today) <= `${year}-12` && monthKey(today) >= `${year}-01` ? monthKey(today) : `${year}-12`;
  const realizedIn = (catId: string, month: string) =>
    actual
      .filter((r) => r.category_id === catId && !r.cancelled && r.paid_date?.startsWith(month))
      .reduce((s, r) => s + (r.paid_amount_cents ?? 0), 0);

  const compare = cats
    .map((c) => {
      const planned = budget.get(`${c.id}_${current}`) ?? 0;
      const real = realizedIn(c.id, current);
      return { c, planned, real, used: planned > 0 ? (real / planned) * 100 : null };
    })
    .filter((x) => x.planned > 0 || x.real > 0);

  const link = (extra: Record<string, string>) => {
    const sp = new URLSearchParams({ ...(params.e ? { e: params.e } : {}), ano: year, ent: entity.slug, ...extra });
    return `/studio/financeiro/orcamento?${sp}`;
  };

  return (
    <>
      <div className="st-page-head">
        <div>
          <p className="st-eyebrow">Financeiro · Orçamento {year}</p>
          <h1>Orçamento de {entity.name}</h1>
          <p>Planejamento mensal por categoria. Vale para receitas (metas) e despesas (limites).</p>
        </div>
        <div className="st-actions">
          {ctx.scope.length > 1 &&
            ctx.scope.map((e) => (
              <Link key={e.id} className="st-tag" href={link({ ent: e.slug })} aria-current={e.id === entity.id ? "true" : undefined}>
                <span className="st-dot" style={{ background: e.color }} aria-hidden="true" />
                {e.name}
              </Link>
            ))}
          <Link className="st-tag" href={link({ ano: String(Number(year) - 1) })}>
            ‹ {Number(year) - 1}
          </Link>
          <Link className="st-tag" href={link({ ano: String(Number(year) + 1) })}>
            {Number(year) + 1} ›
          </Link>
        </div>
      </div>

      <article className="st-card">
        <div className="st-card-head">
          <h2>Orçado x realizado · {monthLabel(current, true)}</h2>
        </div>
        {compare.length ? (
          <ul className="st-list">
            {compare.map(({ c, planned, real, used }) => (
              <li key={c.id}>
                <span className="st-grow">
                  {c.name}
                  <br />
                  <small>{c.type === "income" ? "Receita" : "Despesa"}</small>
                </span>
                <span className="st-funnel-bar" style={{ width: "8rem", flex: "none" }} aria-hidden="true">
                  <span style={{ width: `${Math.min(100, used ?? 100)}%`, background: c.type === "expense" && (used ?? 0) > 100 ? "#b42318" : "#0b0b0b" }} />
                </span>
                <small style={{ minWidth: "11rem", textAlign: "right" }}>
                  {formatCents(real)} de {formatCents(planned)}
                  {used != null && ` · ${Math.round(used)}%`}
                </small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="st-hint">Preencha a grade abaixo para acompanhar o orçado x realizado.</p>
        )}
      </article>

      <BudgetForm
        entityId={entity.id}
        months={months.map((m) => ({ key: m, label: monthLabel(m) }))}
        categories={cats.map((c) => ({ id: c.id, name: c.name, type: c.type }))}
        values={Object.fromEntries([...budget.entries()].map(([k, v]) => [k, centsToInput(v)]))}
      />
    </>
  );
}
