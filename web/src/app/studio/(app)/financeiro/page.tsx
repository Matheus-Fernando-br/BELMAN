import type { Metadata } from "next";
import Link from "next/link";
import { LineChart } from "@/components/studio/charts";
import { cashToday, loadAllocated, loadTransactions, requireFinance, scopeQuery, todayISO, type TxRow } from "@/lib/studio/finance";
import { addMonths, cashFlow, formatCents, lastDayOfMonth, monthKey, monthLabel, monthsBetween } from "@/lib/studio/finance-math";
import { TxQuickList } from "./TxQuickList";

export const metadata: Metadata = { title: "Financeiro" };

export default async function FinanceOverview({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  const ctx = await requireFinance(e);
  const today = todayISO();
  const month = monthKey(today);
  const months = monthsBetween(addMonths(month, -5), month);
  const from = `${months[0]}-01`;
  const to = lastDayOfMonth(month);
  const in7 = new Date(Date.parse(today) + 7 * 864e5).toISOString().slice(0, 10);

  const [allocated, txs, cash, upcoming] = await Promise.all([
    loadAllocated(ctx.scopeIds, from, to),
    loadTransactions(ctx.scopeIds, `${month}-01`, to),
    cashToday(ctx.scopeIds),
    loadTransactions(ctx.scopeIds, "2000-01-01", in7),
  ]);
  const flows = cashFlow(allocated, months);
  const now = flows.at(-1)!;
  const open = (t: TxRow) => t.status === "planned" || t.status === "overdue";
  const receivable = txs.filter((t) => t.type === "income" && open(t) && monthKey(t.due_date) === month);
  const payable = txs.filter((t) => t.type === "expense" && open(t) && monthKey(t.due_date) === month);
  const overdue = upcoming.filter((t) => t.status === "overdue");
  const next7 = upcoming.filter((t) => t.status === "planned" && t.due_date >= today && t.due_date <= in7);
  const q = scopeQuery(ctx.filter);
  const sum = (list: TxRow[]) => list.reduce((s, t) => s + t.amount_cents, 0);
  const empty = !allocated.length && !upcoming.length;

  return (
    <>
      <div className="st-page-head">
        <div>
          <p className="st-eyebrow">Financeiro · {ctx.filter.label}</p>
          <h1>Visão geral</h1>
          <p>{monthLabel(month, true)} · valores realizados no mês e o que ainda está previsto.</p>
        </div>
        <div className="st-actions">
          <Link className="st-btn" data-variant="ghost" href={`/studio/financeiro/lancamentos/novo?tipo=income${q ? `&${q}` : ""}`}>
            + Receita
          </Link>
          <Link className="st-btn" href={`/studio/financeiro/lancamentos/novo?tipo=expense${q ? `&${q}` : ""}`}>
            + Despesa
          </Link>
        </div>
      </div>

      {empty && (
        <p className="st-banner" data-tone="info">
          <span>
            <strong>Comece por aqui:</strong> cadastre suas contas bancárias em{" "}
            <Link href="/studio/configuracoes/financeiro">Configurações → Financeiro</Link>, depois lance receitas e
            despesas ou crie as <Link href="/studio/financeiro/recorrentes">recorrentes</Link> (Render, Vercel, contador…).
          </span>
        </p>
      )}

      <dl className="st-kpis">
        <div className="st-kpi">
          <dt>Receitas realizadas</dt>
          <dd>{formatCents(now.realizedIn, { whole: true })}</dd>
          <span className="st-delta">previsto {formatCents(now.plannedIn)}</span>
        </div>
        <div className="st-kpi">
          <dt>Despesas realizadas</dt>
          <dd>{formatCents(now.realizedOut, { whole: true })}</dd>
          <span className="st-delta">previsto {formatCents(now.plannedOut)}</span>
        </div>
        <div className="st-kpi">
          <dt>Resultado do mês</dt>
          <dd>{formatCents(now.realizedIn - now.realizedOut, { whole: true })}</dd>
          <span className="st-delta" data-tone={now.realizedIn - now.realizedOut >= 0 ? "up" : "down"}>
            previsto {formatCents(now.plannedIn - now.plannedOut)}
          </span>
        </div>
        <div className="st-kpi">
          <dt>Saldo em caixa</dt>
          <dd>{formatCents(cash, { whole: true })}</dd>
          <span className="st-delta">hoje</span>
        </div>
        <div className="st-kpi">
          <dt>A receber no mês</dt>
          <dd>{formatCents(sum(receivable), { whole: true })}</dd>
          <span className="st-delta">{receivable.length} lançamento(s)</span>
        </div>
        <div className="st-kpi">
          <dt>A pagar no mês</dt>
          <dd>{formatCents(sum(payable), { whole: true })}</dd>
          <span className="st-delta">{payable.length} lançamento(s)</span>
        </div>
      </dl>

      <div className="st-grid" data-cols="2-1">
        <article className="st-card">
          <div className="st-card-head">
            <h2>Previsto x realizado</h2>
            <span>últimos 6 meses · com rateio</span>
          </div>
          <LineChart
            title="Entradas e saídas, previstas e realizadas"
            labels={months.map((m) => monthLabel(m))}
            series={[
              { label: "Entradas", color: "#0b0b0b", values: flows.map((f) => f.realizedIn / 100) },
              { label: "Entradas previstas", color: "#0b0b0b", values: flows.map((f) => f.plannedIn / 100), dashed: true },
              { label: "Saídas", color: "#8a8a8a", values: flows.map((f) => f.realizedOut / 100) },
              { label: "Saídas previstas", color: "#8a8a8a", values: flows.map((f) => f.plannedOut / 100), dashed: true },
            ]}
          />
        </article>
        <div className="st-grid">
          <article className="st-card">
            <div className="st-card-head">
              <h2>Atrasados</h2>
              <span>{formatCents(sum(overdue))}</span>
            </div>
            <TxQuickList items={overdue.slice(0, 8)} empty="Nada atrasado." />
          </article>
          <article className="st-card">
            <div className="st-card-head">
              <h2>Próximos 7 dias</h2>
              <span>{formatCents(sum(next7))}</span>
            </div>
            <TxQuickList items={next7.slice(0, 8)} empty="Nenhum vencimento na semana." />
          </article>
        </div>
      </div>
    </>
  );
}
