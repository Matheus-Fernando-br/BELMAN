import type { Metadata } from "next";
import Link from "next/link";
import { cashToday, loadAllocated, loadLookups, requireFinance, todayISO } from "@/lib/studio/finance";
import { addMonths, breakEven, burnAndRunway, cashFlow, centsToInput, formatCents, lastDayOfMonth, monthKey, monthLabel, monthsBetween } from "@/lib/studio/finance-math";
import { createClient } from "@/lib/supabase/server";
import { TargetsForm } from "./TargetsForm";

export const metadata: Metadata = { title: "Planejamento financeiro" };

export default async function PlanningPage({ searchParams }: { searchParams: Promise<{ e?: string; ent?: string }> }) {
  const params = await searchParams;
  const ctx = await requireFinance(params.e);
  const today = todayISO();
  const current = monthKey(today);
  // Base: os 3 últimos meses completos.
  const base = monthsBetween(addMonths(current, -3), addMonths(current, -1));
  const [rows, cash, { categories }] = await Promise.all([
    loadAllocated(ctx.scopeIds, `${base[0]}-01`, lastDayOfMonth(base.at(-1)!)),
    cashToday(ctx.scopeIds),
    loadLookups(),
  ]);
  const flows = cashFlow(rows, base);
  const { burn, runway, avgNet } = burnAndRunway(flows, cash);
  const fixedIds = new Set(categories.filter((c) => c.is_fixed).map((c) => c.id));
  const realized = rows.filter((r) => !r.cancelled && r.paid_date && r.paid_amount_cents != null);
  const avg = (v: number) => Math.round(v / base.length);
  const revenue = avg(realized.filter((r) => r.type === "income").reduce((s, r) => s + r.paid_amount_cents!, 0));
  const fixed = avg(realized.filter((r) => r.type === "expense" && r.category_id && fixedIds.has(r.category_id)).reduce((s, r) => s + r.paid_amount_cents!, 0));
  const variable = avg(realized.filter((r) => r.type === "expense" && !(r.category_id && fixedIds.has(r.category_id))).reduce((s, r) => s + r.paid_amount_cents!, 0));
  const margin = revenue > 0 ? ((revenue - fixed - variable) / revenue) * 100 : null;
  const be = breakEven(revenue, variable, fixed);

  const entity = ctx.scope.find((x) => x.slug === params.ent) ?? (ctx.scope.length === 1 ? ctx.scope[0] : ctx.scope.find((x) => x.kind === "holding") ?? ctx.scope[0]);
  const supabase = await createClient();
  const { data: target } = await supabase.from("fin_targets").select("*").eq("entity_id", entity.id).maybeSingle();
  const goal = target?.monthly_revenue_goal_cents ? Number(target.monthly_revenue_goal_cents) : null;

  const scenarios = [
    { label: "Pessimista", growth: -0.2 },
    { label: "Base", growth: 0 },
    { label: "Otimista", growth: 0.2 },
  ].map((s) => {
    const rev = Math.round(revenue * (1 + s.growth));
    const varCost = Math.round(variable * (1 + s.growth));
    const result = rev - varCost - fixed;
    const r = result < 0 && cash > 0 ? cash / -result : null;
    return { ...s, rev, result, runway: r };
  });
  const months = (v: number | null) => (v == null ? "sem queima de caixa" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} meses`);

  return (
    <>
      <div className="st-page-head">
        <div>
          <p className="st-eyebrow">Financeiro · {ctx.filter.label}</p>
          <h1>Planejamento</h1>
          <p>
            Indicadores calculados com a média dos últimos 3 meses completos ({monthLabel(base[0])} a {monthLabel(base.at(-1)!, true)}),
            realizado e com rateio.
          </p>
        </div>
      </div>

      <dl className="st-kpis">
        <div className="st-kpi">
          <dt>Saldo em caixa</dt>
          <dd>{formatCents(cash, { whole: true })}</dd>
        </div>
        <div className="st-kpi">
          <dt>Resultado médio / mês</dt>
          <dd>{formatCents(avgNet, { whole: true })}</dd>
        </div>
        <div className="st-kpi">
          <dt>Burn rate</dt>
          <dd>{formatCents(burn, { whole: true })}</dd>
          <span className="st-delta">{burn ? "queima média por mês" : "a operação se paga"}</span>
        </div>
        <div className="st-kpi">
          <dt>Runway</dt>
          <dd>{runway == null ? "∞" : `${runway.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} m`}</dd>
          <span className="st-delta">{runway == null ? "sem queima de caixa" : "meses de caixa"}</span>
        </div>
        <div className="st-kpi">
          <dt>Margem de lucro</dt>
          <dd>{margin == null ? "—" : `${margin.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}</dd>
        </div>
        <div className="st-kpi">
          <dt>Ponto de equilíbrio</dt>
          <dd>{be == null ? "—" : formatCents(be)}</dd>
          <span className="st-delta">receita mensal para cobrir os fixos</span>
        </div>
      </dl>

      <div className="st-grid" data-cols="2">
        <article className="st-card">
          <h2>Composição média mensal</h2>
          <ul className="st-list">
            <li>
              <span className="st-grow">Receitas</span>
              <strong>{formatCents(revenue)}</strong>
            </li>
            <li>
              <span className="st-grow">Custos fixos (categorias marcadas como fixas)</span>
              <strong>{formatCents(fixed)}</strong>
            </li>
            <li>
              <span className="st-grow">Custos variáveis</span>
              <strong>{formatCents(variable)}</strong>
            </li>
          </ul>
          <p className="st-hint">
            Quais categorias são fixas se define em <Link href="/studio/configuracoes/financeiro">Configurações → Financeiro</Link>.
          </p>
        </article>
        <article className="st-card">
          <h2>Cenários para o próximo mês</h2>
          <div className="st-table-wrap">
            <table className="st-table">
              <thead>
                <tr>
                  <th scope="col">Cenário</th>
                  <th scope="col" style={{ textAlign: "right" }}>Receita</th>
                  <th scope="col" style={{ textAlign: "right" }}>Resultado</th>
                  <th scope="col">Runway</th>
                </tr>
              </thead>
              <tbody>
                {scenarios.map((s) => (
                  <tr key={s.label}>
                    <th scope="row">
                      {s.label}
                      <br />
                      <small className="st-hint">{s.growth === 0 ? "igual à média" : `receita ${s.growth > 0 ? "+" : ""}${s.growth * 100}%`}</small>
                    </th>
                    <td className="st-num">{formatCents(s.rev)}</td>
                    <td className="st-num" style={{ color: s.result < 0 ? "#b42318" : undefined }}>
                      {formatCents(s.result)}
                    </td>
                    <td className="st-hint">{months(s.runway)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
        <article className="st-card">
          <div className="st-card-head">
            <h2>Metas · {entity.name}</h2>
            {ctx.scope.length > 1 && (
              <span>
                {ctx.scope.map((x) => (
                  <Link key={x.id} href={`/studio/financeiro/planejamento?${params.e ? `e=${params.e}&` : ""}ent=${x.slug}`} style={{ marginLeft: "0.5rem", fontWeight: x.id === entity.id ? 700 : 400 }}>
                    {x.name}
                  </Link>
                ))}
              </span>
            )}
          </div>
          {goal != null && (
            <p>
              Meta de receita: <strong>{formatCents(goal)}</strong> por mês.
            </p>
          )}
          <TargetsForm
            entityId={entity.id}
            revenueGoal={centsToInput(target?.monthly_revenue_goal_cents ?? null)}
            marginGoal={target?.margin_goal_percent != null ? String(target.margin_goal_percent).replace(".", ",") : ""}
          />
        </article>
      </div>
    </>
  );
}
