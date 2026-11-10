import type { Metadata } from "next";
import { LineChart } from "@/components/studio/charts";
import { cashToday, loadTransactions, requireFinance, todayISO } from "@/lib/studio/finance";
import { addMonths, cashFlow, formatCents, lastDayOfMonth, monthKey, monthLabel, monthsBetween } from "@/lib/studio/finance-math";

export const metadata: Metadata = { title: "Fluxo de caixa" };

export default async function CashFlowPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  const ctx = await requireFinance(e);
  const today = todayISO();
  const current = monthKey(today);
  const months = monthsBetween(addMonths(current, -5), addMonths(current, 6));
  const [txs, cash] = await Promise.all([
    loadTransactions(ctx.scopeIds, "2000-01-01", lastDayOfMonth(months.at(-1)!)),
    cashToday(ctx.scopeIds),
  ]);
  const flows = cashFlow(txs, months);

  // Projeção: saldo de hoje + o que ainda está em aberto (atrasados entram no mês atual).
  const openNet = new Map<string, number>();
  for (const t of txs) {
    if (t.cancelled || t.paid_date) continue;
    const m = t.due_date < `${current}-01` ? current : monthKey(t.due_date);
    openNet.set(m, (openNet.get(m) ?? 0) + (t.type === "income" ? t.amount_cents : -t.amount_cents));
  }
  const projected: (number | null)[] = [];
  for (const m of months) {
    const prev = projected.findLast((v) => v !== null) ?? cash;
    projected.push(m < current ? null : prev + (openNet.get(m) ?? 0));
  }
  const future = months.map((m, i) => ({ m, v: projected[i] })).filter((x) => x.v !== null) as { m: string; v: number }[];
  const negative = future.find((x) => x.v < 0);

  return (
    <>
      <div className="st-page-head">
        <div>
          <p className="st-eyebrow">Financeiro · {ctx.filter.label}</p>
          <h1>Fluxo de caixa</h1>
          <p>Entradas e saídas previstas e realizadas, pela Entidade dona do lançamento (onde o dinheiro entra e sai).</p>
        </div>
      </div>

      {negative && (
        <p className="st-banner" role="alert">
          <span>
            <strong>Atenção:</strong> pelo que está previsto, o saldo fica negativo em {monthLabel(negative.m, true)} (
            {formatCents(negative.v)}).
          </span>
        </p>
      )}

      <article className="st-card">
        <div className="st-card-head">
          <h2>Saldo projetado</h2>
          <span>hoje {formatCents(cash)}</span>
        </div>
        <LineChart title="Saldo projetado para os próximos meses" labels={future.map((x) => monthLabel(x.m))} series={[{ label: "Saldo projetado", color: "#0b0b0b", values: future.map((x) => x.v / 100) }]} />
      </article>

      <div className="st-table-wrap">
        <table className="st-table">
          <caption className="visually-hidden">Fluxo de caixa mensal</caption>
          <thead>
            <tr>
              <th scope="col">Mês</th>
              <th scope="col" style={{ textAlign: "right" }}>Entradas previstas</th>
              <th scope="col" style={{ textAlign: "right" }}>Entradas realizadas</th>
              <th scope="col" style={{ textAlign: "right" }}>Saídas previstas</th>
              <th scope="col" style={{ textAlign: "right" }}>Saídas realizadas</th>
              <th scope="col" style={{ textAlign: "right" }}>Resultado previsto</th>
              <th scope="col" style={{ textAlign: "right" }}>Resultado realizado</th>
              <th scope="col" style={{ textAlign: "right" }}>Saldo projetado</th>
            </tr>
          </thead>
          <tbody>
            {flows.map((f, i) => (
              <tr key={f.month} style={f.month === current ? { background: "#fafaf9", fontWeight: 600 } : undefined}>
                <th scope="row">
                  {monthLabel(f.month, true)}
                  {f.month === current && <small className="st-hint"> · atual</small>}
                </th>
                <td className="st-num">{formatCents(f.plannedIn)}</td>
                <td className="st-num">{f.month > current ? "—" : formatCents(f.realizedIn)}</td>
                <td className="st-num">{formatCents(f.plannedOut)}</td>
                <td className="st-num">{f.month > current ? "—" : formatCents(f.realizedOut)}</td>
                <td className="st-num">{formatCents(f.plannedIn - f.plannedOut)}</td>
                <td className="st-num">{f.month > current ? "—" : formatCents(f.realizedIn - f.realizedOut)}</td>
                <td className="st-num" style={projected[i] != null && projected[i]! < 0 ? { color: "#b42318" } : undefined}>
                  {projected[i] == null ? "—" : formatCents(projected[i]!)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
