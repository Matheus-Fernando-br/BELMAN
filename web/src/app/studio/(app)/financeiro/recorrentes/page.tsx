import type { Metadata } from "next";
import { loadLookups, requireFinance, todayISO } from "@/lib/studio/finance";
import { formatCents } from "@/lib/studio/finance-math";
import { createClient } from "@/lib/supabase/server";
import { toggleRecurrence } from "../actions";
import { GenerateButton, RecurrenceForm } from "./Forms";

export const metadata: Metadata = { title: "Recorrentes" };

export default async function RecurrencesPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  const ctx = await requireFinance(e);
  const supabase = await createClient();
  const [{ data }, lookups] = await Promise.all([
    supabase.from("fin_recurrences").select("*").in("entity_id", ctx.scopeIds).order("active", { ascending: false }).order("description"),
    loadLookups(),
  ]);
  const list = data ?? [];
  const byEntity = new Map(ctx.entities.map((x) => [x.id, x]));
  const monthly = (r: (typeof list)[number]) => (r.frequency === "monthly" ? Number(r.amount_cents) : Number(r.amount_cents) / 12);
  const infraMonthly = list.filter((r) => r.active && r.type === "expense" && r.is_infrastructure).reduce((s, r) => s + monthly(r), 0);
  const fixedOut = list.filter((r) => r.active && r.type === "expense").reduce((s, r) => s + monthly(r), 0);
  const fixedIn = list.filter((r) => r.active && r.type === "income").reduce((s, r) => s + monthly(r), 0);

  return (
    <>
      <div className="st-page-head">
        <div>
          <p className="st-eyebrow">Financeiro · {ctx.filter.label}</p>
          <h1>Recorrentes</h1>
          <p>Mensalidades e custos fixos viram lançamentos previstos automaticamente para os próximos 6 meses.</p>
        </div>
        <GenerateButton />
      </div>
      <dl className="st-kpis">
        <div className="st-kpi">
          <dt>Receitas recorrentes / mês</dt>
          <dd>{formatCents(Math.round(fixedIn), { whole: true })}</dd>
        </div>
        <div className="st-kpi">
          <dt>Despesas recorrentes / mês</dt>
          <dd>{formatCents(Math.round(fixedOut), { whole: true })}</dd>
        </div>
        <div className="st-kpi">
          <dt>Infraestrutura / mês</dt>
          <dd>{formatCents(Math.round(infraMonthly), { whole: true })}</dd>
        </div>
      </dl>
      <div className="st-grid" data-cols="2-1">
        <div className="st-table-wrap">
          <table className="st-table">
            <caption className="visually-hidden">Recorrências</caption>
            <thead>
              <tr>
                <th scope="col">Descrição</th>
                <th scope="col">Entidade</th>
                <th scope="col" style={{ textAlign: "right" }}>
                  Valor
                </th>
                <th scope="col">Quando</th>
                <th scope="col">
                  <span className="visually-hidden">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id} style={r.active ? undefined : { opacity: 0.5 }}>
                  <td>
                    {r.description}
                    <br />
                    <small className="st-hint">
                      {r.type === "income" ? "Receita" : "Despesa"}
                      {r.is_infrastructure ? " · infraestrutura" : ""}
                      {r.allocation_rule_id ? " · com rateio" : ""}
                    </small>
                  </td>
                  <td>
                    <span className="st-tag">
                      <span className="st-dot" style={{ background: byEntity.get(r.entity_id)?.color }} aria-hidden="true" />
                      {byEntity.get(r.entity_id)?.name}
                    </span>
                  </td>
                  <td className="st-num">{formatCents(Number(r.amount_cents))}</td>
                  <td className="st-hint" style={{ whiteSpace: "nowrap" }}>
                    {r.frequency === "monthly" ? "Todo dia" : "Anual, dia"} {r.day_of_month}
                    {r.end_date ? ` até ${r.end_date.split("-").reverse().join("/")}` : ""}
                  </td>
                  <td>
                    <form action={toggleRecurrence}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="active" value={r.active ? "false" : "true"} />
                      <button type="submit" className="st-linkbtn" style={{ color: "#6a6a6a", fontSize: "0.8rem" }}>
                        {r.active ? "Pausar" : "Reativar"}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
              {!list.length && (
                <tr>
                  <td colSpan={5}>Nenhuma recorrência ainda. Cadastre ao lado os custos fixos (hospedagem, ferramentas, contador…).</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <article className="st-card">
          <h2>Nova recorrência</h2>
          <RecurrenceForm
            entities={ctx.visible.map((x) => ({ id: x.id, name: x.name, kind: x.kind }))}
            today={todayISO()}
            {...lookups}
          />
        </article>
      </div>
    </>
  );
}
