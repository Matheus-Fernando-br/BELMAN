import type { Metadata } from "next";
import Link from "next/link";
import { formatCents } from "@/lib/studio/finance-math";
import { br, requireScope, todayLocal } from "@/lib/studio/scope";
import { createClient } from "@/lib/supabase/server";
import { CancelContractForm } from "../Forms";

export const metadata: Metadata = { title: "Contratos" };

const CYCLE = { monthly: "Mensal", yearly: "Anual", one_time: "Único" } as Record<string, string>;
const STATUS = { active: "Ativo", canceled: "Cancelado", ended: "Encerrado" } as Record<string, string>;

export default async function ContractsPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  const ctx = await requireScope(e);
  const supabase = await createClient();
  const { data } = await supabase.from("contracts").select("*,customers(name)").in("entity_id", ctx.scopeIds).order("status").order("renewal_date");
  const ent = new Map(ctx.entities.map((x) => [x.id, x.name]));
  const today = todayLocal();
  const in30 = new Date(Date.parse(today) + 30 * 864e5).toISOString().slice(0, 10);
  return (
    <>
      <div className="st-page-head">
        <div>
          <p className="st-eyebrow">Vendas · {ctx.filter.label}</p>
          <h1>Contratos comerciais</h1>
          <p>Planos, valores, contratação, renovação e cancelamento. Contratos nascem ao concluir uma venda no CRM.</p>
        </div>
      </div>
      <div className="st-table-wrap">
        <table className="st-table">
          <thead>
            <tr>
              <th scope="col">Cliente</th>
              <th scope="col">Produto</th>
              <th scope="col">Plano</th>
              <th scope="col" style={{ textAlign: "right" }}>
                Valor
              </th>
              <th scope="col">Início</th>
              <th scope="col">Renovação</th>
              <th scope="col">Situação</th>
              <th scope="col">
                <span className="visually-hidden">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((k) => {
              const renewing = k.status === "active" && k.renewal_date && k.renewal_date <= in30;
              return (
                <tr key={k.id}>
                  <td>
                    <Link href={`/studio/operacoes/clientes/${k.customer_id}`}>{(k.customers as unknown as { name: string })?.name}</Link>
                  </td>
                  <td>{ent.get(k.entity_id)}</td>
                  <td>{k.plan}</td>
                  <td className="st-num">
                    {ctx.canSeeFinance ? formatCents(Number(k.value_cents)) : "•••"} <small className="st-hint">{CYCLE[k.cycle]}</small>
                  </td>
                  <td>{br(k.start_date)}</td>
                  <td style={renewing ? { color: "#a35f00", fontWeight: 600 } : undefined}>{br(k.renewal_date)}</td>
                  <td>
                    <span className="st-status" data-tone={k.status === "active" ? "ok" : "neutral"}>
                      {STATUS[k.status]}
                    </span>
                    {k.cancel_reason && (
                      <>
                        <br />
                        <small className="st-hint">{k.cancel_reason}</small>
                      </>
                    )}
                  </td>
                  <td>{ctx.canWrite && k.status === "active" && <CancelContractForm id={k.id} />}</td>
                </tr>
              );
            })}
            {!data?.length && (
              <tr>
                <td colSpan={8}>Nenhum contrato. Conclua uma venda no CRM para gerar o primeiro.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
