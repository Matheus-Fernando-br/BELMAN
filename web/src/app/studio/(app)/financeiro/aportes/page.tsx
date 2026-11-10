import type { Metadata } from "next";
import { requireFinance, todayISO } from "@/lib/studio/finance";
import { formatCents } from "@/lib/studio/finance-math";
import { createClient } from "@/lib/supabase/server";
import { deleteContribution } from "../actions";
import { ContributionForm } from "./Form";

export const metadata: Metadata = { title: "Aportes dos sócios" };

export default async function ContributionsPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  const ctx = await requireFinance(e);
  const supabase = await createClient();
  const [{ data }, { data: accounts }] = await Promise.all([
    supabase.from("fin_partner_contributions").select("*").in("entity_id", ctx.scopeIds).order("date", { ascending: false }),
    supabase.from("fin_accounts").select("id,name").eq("active", true).order("name"),
  ]);
  const list = data ?? [];
  const byEntity = new Map(ctx.entities.map((x) => [x.id, x]));
  const partners = new Map<string, { in: number; out: number }>();
  for (const c of list) {
    const p = partners.get(c.partner_name) ?? { in: 0, out: 0 };
    if (c.kind === "contribution") p.in += Number(c.amount_cents);
    else p.out += Number(c.amount_cents);
    partners.set(c.partner_name, p);
  }

  return (
    <>
      <div className="st-page-head">
        <div>
          <p className="st-eyebrow">Financeiro · {ctx.filter.label}</p>
          <h1>Aportes dos sócios</h1>
          <p>Investimentos e retiradas. Entram no saldo de caixa, mas não no resultado operacional.</p>
        </div>
      </div>
      {partners.size > 0 && (
        <dl className="st-kpis">
          {[...partners.entries()].map(([name, p]) => (
            <div className="st-kpi" key={name}>
              <dt>{name}</dt>
              <dd>{formatCents(p.in - p.out, { whole: true })}</dd>
              <span className="st-delta">
                aportou {formatCents(p.in)} · retirou {formatCents(p.out)}
              </span>
            </div>
          ))}
        </dl>
      )}
      <div className="st-grid" data-cols="2-1">
        <div className="st-table-wrap">
          <table className="st-table">
            <caption className="visually-hidden">Movimentações dos sócios</caption>
            <thead>
              <tr>
                <th scope="col">Data</th>
                <th scope="col">Sócio</th>
                <th scope="col">Movimento</th>
                <th scope="col">Entidade</th>
                <th scope="col" style={{ textAlign: "right" }}>
                  Valor
                </th>
                <th scope="col">
                  <span className="visually-hidden">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id}>
                  <td>{String(c.date).split("-").reverse().join("/")}</td>
                  <td>
                    {c.partner_name}
                    {c.notes && (
                      <>
                        <br />
                        <small className="st-hint">{c.notes}</small>
                      </>
                    )}
                  </td>
                  <td>{c.kind === "contribution" ? "Aporte" : "Retirada"}</td>
                  <td>{byEntity.get(c.entity_id)?.name}</td>
                  <td className="st-num">
                    {c.kind === "withdrawal" ? "−" : ""}
                    {formatCents(Number(c.amount_cents))}
                  </td>
                  <td>
                    <form action={deleteContribution}>
                      <input type="hidden" name="id" value={c.id} />
                      <button type="submit" className="st-linkbtn" style={{ color: "#b42318", fontSize: "0.8rem" }}>
                        Excluir
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
              {!list.length && (
                <tr>
                  <td colSpan={6}>Nenhuma movimentação registrada.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <article className="st-card">
          <h2>Registrar movimentação</h2>
          <ContributionForm entities={ctx.visible.map((x) => ({ id: x.id, name: x.name }))} accounts={accounts ?? []} today={todayISO()} />
        </article>
      </div>
    </>
  );
}
