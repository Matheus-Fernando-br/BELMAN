import type { Metadata } from "next";
import Link from "next/link";
import { loadTransactions, requireFinance, STATUS_LABEL, STATUS_TONE, todayISO } from "@/lib/studio/finance";
import { addMonths, formatCents, lastDayOfMonth, monthKey, monthLabel } from "@/lib/studio/finance-math";
import { markPaid, setCancelled } from "../actions";
import { shortDate } from "../TxQuickList";

export const metadata: Metadata = { title: "Lançamentos" };

type Params = { e?: string; tipo?: string; status?: string; mes?: string; q?: string };

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const ctx = await requireFinance(params.e);
  const month = /^\d{4}-\d{2}$/.test(params.mes ?? "") ? params.mes! : monthKey(todayISO());
  const tipo = params.tipo === "receber" ? "income" : params.tipo === "pagar" ? "expense" : null;
  const status = ["planned", "overdue", "paid", "cancelled"].includes(params.status ?? "") ? params.status : null;
  const q = (params.q ?? "").trim().toLowerCase();

  const all = await loadTransactions(ctx.scopeIds, `${month}-01`, lastDayOfMonth(month));
  const rows = all.filter(
    (t) =>
      (!tipo || t.type === tipo) &&
      (!status || t.status === status) &&
      (!q || [t.description, t.counterparty_name, t.category_name].some((v) => v?.toLowerCase().includes(q))),
  );
  const live = rows.filter((t) => !t.cancelled);
  const totalIn = live.filter((t) => t.type === "income").reduce((s, t) => s + t.amount_cents, 0);
  const totalOut = live.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount_cents, 0);
  const paidIn = live.filter((t) => t.type === "income").reduce((s, t) => s + (t.paid_amount_cents ?? 0), 0);
  const paidOut = live.filter((t) => t.type === "expense").reduce((s, t) => s + (t.paid_amount_cents ?? 0), 0);

  const keep = (extra: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    const merged = { e: params.e, tipo: params.tipo, status: params.status, mes: month, q: params.q, ...extra };
    Object.entries(merged).forEach(([k, v]) => v && sp.set(k, v));
    return `/studio/financeiro/lancamentos?${sp}`;
  };
  const back = keep({});

  return (
    <>
      <div className="st-page-head">
        <div>
          <p className="st-eyebrow">Financeiro · {ctx.filter.label}</p>
          <h1>Lançamentos</h1>
          <p>Contas a pagar e a receber, com previsto x realizado.</p>
        </div>
        <div className="st-actions">
          <Link className="st-btn" data-variant="ghost" href={`/studio/financeiro/lancamentos/novo?tipo=income${params.e ? `&e=${params.e}` : ""}`}>
            + Receita
          </Link>
          <Link className="st-btn" href={`/studio/financeiro/lancamentos/novo?tipo=expense${params.e ? `&e=${params.e}` : ""}`}>
            + Despesa
          </Link>
        </div>
      </div>

      <nav className="st-actions" aria-label="Tipo de lançamento">
        {[
          { v: undefined, l: "Todos" },
          { v: "receber", l: "Contas a receber" },
          { v: "pagar", l: "Contas a pagar" },
        ].map((o) => (
          <Link key={o.l} href={keep({ tipo: o.v })} className="st-tag" aria-current={params.tipo === o.v ? "true" : undefined} style={params.tipo === o.v ? { background: "#0b0b0b", color: "#fff", borderColor: "#0b0b0b" } : undefined}>
            {o.l}
          </Link>
        ))}
      </nav>

      <form className="st-card" method="get" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(10rem, 1fr))", alignItems: "end" }}>
        {params.e && <input type="hidden" name="e" value={params.e} />}
        {params.tipo && <input type="hidden" name="tipo" value={params.tipo} />}
        <div className="st-field">
          <label htmlFor="f-mes">Mês</label>
          <input id="f-mes" type="month" name="mes" defaultValue={month} className="st-input" />
        </div>
        <div className="st-field">
          <label htmlFor="f-status">Situação</label>
          <select id="f-status" name="status" defaultValue={status ?? ""} className="st-input">
            <option value="">Todas</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="st-field">
          <label htmlFor="f-q">Buscar</label>
          <input id="f-q" name="q" defaultValue={params.q} placeholder="descrição, cliente, fornecedor" className="st-input" />
        </div>
        <div className="st-actions">
          <button className="st-btn" data-variant="ghost" type="submit">
            Filtrar
          </button>
          <Link href={keep({ mes: addMonths(month, -1) })} className="st-btn" data-variant="ghost" aria-label="Mês anterior">
            ‹
          </Link>
          <Link href={keep({ mes: addMonths(month, 1) })} className="st-btn" data-variant="ghost" aria-label="Próximo mês">
            ›
          </Link>
        </div>
      </form>

      <div className="st-table-wrap">
        <table className="st-table">
          <caption className="visually-hidden">
            Lançamentos de {monthLabel(month, true)}
          </caption>
          <thead>
            <tr>
              <th scope="col">Previsto</th>
              <th scope="col">Descrição</th>
              <th scope="col">Entidade</th>
              <th scope="col">Categoria</th>
              <th scope="col" style={{ textAlign: "right" }}>
                Valor previsto
              </th>
              <th scope="col" style={{ textAlign: "right" }}>
                Realizado
              </th>
              <th scope="col">Situação</th>
              <th scope="col">
                <span className="visually-hidden">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} style={t.cancelled ? { opacity: 0.55 } : undefined}>
                <td style={{ whiteSpace: "nowrap" }}>{shortDate(t.due_date)}</td>
                <td>
                  <Link href={`/studio/financeiro/lancamentos/${t.id}?back=${encodeURIComponent(back)}`}>{t.description}</Link>
                  <br />
                  <small className="st-hint">
                    {t.type === "income" ? "Receita" : "Despesa"}
                    {t.counterparty_name ? ` · ${t.counterparty_name}` : ""}
                    {t.allocation_rule_name ? ` · rateio: ${t.allocation_rule_name}` : ""}
                    {t.recurrence_id ? " · recorrente" : ""}
                  </small>
                </td>
                <td>
                  <span className="st-tag">
                    <span className="st-dot" style={{ background: t.entity_color }} aria-hidden="true" />
                    {t.entity_name}
                  </span>
                </td>
                <td className="st-hint">{t.category_name ?? "—"}</td>
                <td className="st-num" style={{ color: t.type === "expense" ? "#7a1b13" : undefined }}>
                  {t.type === "expense" ? "−" : ""}
                  {formatCents(t.amount_cents)}
                </td>
                <td className="st-num">
                  {t.paid_amount_cents != null ? (
                    <>
                      {formatCents(t.paid_amount_cents)}
                      <br />
                      <small className="st-hint">{shortDate(t.paid_date!)}</small>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  <span className="st-status" data-tone={STATUS_TONE[t.status]}>
                    {STATUS_LABEL[t.status]}
                  </span>
                </td>
                <td>
                  <div className="st-actions" style={{ flexWrap: "nowrap", justifyContent: "flex-end" }}>
                    {t.attachment_path && (
                      <a href={`/studio/financeiro/comprovante/${t.id}`} target="_blank" rel="noopener noreferrer" className="st-hint" title="Abrir comprovante">
                        📎<span className="visually-hidden">Comprovante</span>
                      </a>
                    )}
                    {(t.status === "planned" || t.status === "overdue") && (
                      <form action={markPaid}>
                        <input type="hidden" name="id" value={t.id} />
                        <button type="submit" className="st-btn" data-variant="ghost" style={{ minHeight: "2rem", padding: "0.2rem 0.7rem", fontSize: "0.78rem" }}>
                          {t.type === "income" ? "Recebido" : "Pago"}
                        </button>
                      </form>
                    )}
                    {t.status !== "paid" && (
                      <form action={setCancelled}>
                        <input type="hidden" name="id" value={t.id} />
                        <input type="hidden" name="cancelled" value={t.cancelled ? "false" : "true"} />
                        <button type="submit" className="st-linkbtn" style={{ color: "#6a6a6a", fontSize: "0.78rem" }}>
                          {t.cancelled ? "Reabrir" : "Cancelar"}
                        </button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={8}>Nenhum lançamento em {monthLabel(month, true)} com esses filtros.</td>
              </tr>
            )}
          </tbody>
          {!!rows.length && (
            <tfoot>
              <tr>
                <th scope="row" colSpan={4}>
                  Totais (sem cancelados)
                </th>
                <td className="st-num">
                  <small className="st-hint">entradas</small> {formatCents(totalIn)}
                  <br />
                  <small className="st-hint">saídas</small> −{formatCents(totalOut)}
                </td>
                <td className="st-num">
                  {formatCents(paidIn)}
                  <br />−{formatCents(paidOut)}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </>
  );
}
