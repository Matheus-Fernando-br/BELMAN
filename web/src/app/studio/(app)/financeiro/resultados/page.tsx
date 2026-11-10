import type { Metadata } from "next";
import Link from "next/link";
import { StackedColumns } from "@/components/studio/charts";
import { loadAllocated, requireFinance, todayISO } from "@/lib/studio/finance";
import { formatCents, lastDayOfMonth, monthKey, monthLabel, monthsBetween } from "@/lib/studio/finance-math";

export const metadata: Metadata = { title: "Resultados por produto" };

export default async function ResultsPage({ searchParams }: { searchParams: Promise<{ e?: string; ano?: string; mes?: string; base?: string }> }) {
  const params = await searchParams;
  const ctx = await requireFinance(params.e);
  const today = todayISO();
  const year = /^\d{4}$/.test(params.ano ?? "") ? params.ano! : today.slice(0, 4);
  const month = /^\d{4}-\d{2}$/.test(params.mes ?? "") ? params.mes! : null;
  const realized = params.base !== "previsto";
  const from = month ? `${month}-01` : `${year}-01-01`;
  const to = month ? lastDayOfMonth(month) : `${year}-12-31`;
  const entities = ctx.scope;
  const rows = await loadAllocated(entities.map((e) => e.id), from, to);

  const inPeriod = (date: string | null) => !!date && date >= from && date <= to;
  const value = (r: (typeof rows)[number]) => (realized ? (r.paid_amount_cents ?? 0) : r.amount_cents);
  const dateOf = (r: (typeof rows)[number]) => (realized ? r.paid_date : r.due_date);

  const cols = entities.map((e) => {
    const mine = rows.filter((r) => r.entity_id === e.id && !r.cancelled && inPeriod(dateOf(r)));
    const revenue = mine.filter((r) => r.type === "income").reduce((s, r) => s + value(r), 0);
    const direct = mine.filter((r) => r.type === "expense" && !r.allocated).reduce((s, r) => s + value(r), 0);
    const shared = mine.filter((r) => r.type === "expense" && r.allocated).reduce((s, r) => s + value(r), 0);
    const result = revenue - direct - shared;
    return { e, revenue, direct, shared, result, margin: revenue > 0 ? (result / revenue) * 100 : null };
  });
  const total = cols.reduce(
    (t, c) => ({ revenue: t.revenue + c.revenue, direct: t.direct + c.direct, shared: t.shared + c.shared, result: t.result + c.result }),
    { revenue: 0, direct: 0, shared: 0, result: 0 },
  );

  const chartMonths = monthsBetween(`${year}-01`, `${year}-12`).filter((m) => m <= monthKey(today) || !realized);
  const products = entities.filter((e) => e.kind === "product");
  const series = products.map((p) => ({
    label: p.name,
    color: p.color,
    values: chartMonths.map(
      (m) =>
        rows
          .filter((r) => r.entity_id === p.id && r.type === "income" && !r.cancelled && dateOf(r)?.startsWith(m))
          .reduce((s, r) => s + value(r), 0) / 100,
    ),
  }));

  const link = (extra: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    Object.entries({ e: params.e, ano: year, mes: month ?? undefined, base: params.base, ...extra }).forEach(([k, v]) => v && sp.set(k, v));
    return `/studio/financeiro/resultados?${sp}`;
  };
  const pct = (v: number | null) => (v == null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);

  return (
    <>
      <div className="st-page-head">
        <div>
          <p className="st-eyebrow">Financeiro · {ctx.filter.label}</p>
          <h1>Resultados por produto</h1>
          <p>
            {month ? monthLabel(month, true) : `Ano de ${year}`} · {realized ? "realizado" : "previsto"}. Custos compartilhados
            entram em cada produto pela regra de rateio.
          </p>
        </div>
        <div className="st-actions">
          <Link className="st-tag" href={link({ base: undefined })} aria-current={realized ? "true" : undefined}>
            Realizado
          </Link>
          <Link className="st-tag" href={link({ base: "previsto" })} aria-current={!realized ? "true" : undefined}>
            Previsto
          </Link>
          <Link className="st-tag" href={link({ ano: String(Number(year) - 1), mes: undefined })}>
            ‹ {Number(year) - 1}
          </Link>
          <Link className="st-tag" href={link({ ano: String(Number(year) + 1), mes: undefined })}>
            {Number(year) + 1} ›
          </Link>
          {month && (
            <Link className="st-tag" href={link({ mes: undefined })}>
              Ver ano todo
            </Link>
          )}
        </div>
      </div>

      <div className="st-table-wrap">
        <table className="st-table">
          <caption className="visually-hidden">Demonstrativo de resultado por entidade</caption>
          <thead>
            <tr>
              <th scope="col" />
              {cols.map((c) => (
                <th key={c.e.id} scope="col" style={{ textAlign: "right" }}>
                  <span className="st-dot" style={{ background: c.e.color, marginRight: "0.35rem" }} aria-hidden="true" />
                  {c.e.name}
                </th>
              ))}
              {cols.length > 1 && (
                <th scope="col" style={{ textAlign: "right" }}>
                  Consolidado
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {[
              { label: "Receitas", key: "revenue" as const },
              { label: "(−) Despesas diretas", key: "direct" as const },
              { label: "(−) Despesas rateadas", key: "shared" as const },
            ].map((row) => (
              <tr key={row.key}>
                <th scope="row">{row.label}</th>
                {cols.map((c) => (
                  <td key={c.e.id} className="st-num">
                    {formatCents(c[row.key])}
                  </td>
                ))}
                {cols.length > 1 && <td className="st-num">{formatCents(total[row.key])}</td>}
              </tr>
            ))}
            <tr style={{ fontWeight: 700 }}>
              <th scope="row">Resultado</th>
              {cols.map((c) => (
                <td key={c.e.id} className="st-num" style={{ color: c.result < 0 ? "#b42318" : undefined }}>
                  {formatCents(c.result)}
                </td>
              ))}
              {cols.length > 1 && (
                <td className="st-num" style={{ color: total.result < 0 ? "#b42318" : undefined }}>
                  {formatCents(total.result)}
                </td>
              )}
            </tr>
            <tr>
              <th scope="row">Margem</th>
              {cols.map((c) => (
                <td key={c.e.id} className="st-num">
                  {pct(c.margin)}
                </td>
              ))}
              {cols.length > 1 && <td className="st-num">{pct(total.revenue > 0 ? (total.result / total.revenue) * 100 : null)}</td>}
            </tr>
          </tbody>
        </table>
      </div>

      {series.length > 0 && (
        <article className="st-card">
          <div className="st-card-head">
            <h2>Receita {realized ? "realizada" : "prevista"} por produto</h2>
            <span>{year}</span>
          </div>
          <StackedColumns title={`Receita mensal por produto em ${year}`} labels={chartMonths.map((m) => monthLabel(m))} series={series} />
        </article>
      )}
    </>
  );
}
