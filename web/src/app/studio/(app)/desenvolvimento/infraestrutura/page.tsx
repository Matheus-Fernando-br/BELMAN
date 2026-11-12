import type { Metadata } from "next";
import Link from "next/link";
import { DeleteButton, RecordForm } from "@/components/studio/RecordForm";
import { formatCents } from "@/lib/studio/finance-math";
import { requireScope } from "@/lib/studio/scope";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Infraestrutura" };

export default async function InfraPage({ searchParams }: { searchParams: Promise<{ e?: string; editar?: string }> }) {
  const params = await searchParams;
  const ctx = await requireScope(params.e);
  const supabase = await createClient();
  const { data } = await supabase.from("infra_assets").select("*").in("entity_id", ctx.scopeIds).order("entity_id").order("name");
  const ent = new Map(ctx.entities.map((x) => [x.id, x.name]));
  const total = (data ?? []).reduce((s, a) => s + Number(a.monthly_cost_cents), 0);
  const editing = (data ?? []).find((a) => a.id === params.editar);
  return (
    <>
      <div className="st-page-head">
        <div>
          <p className="st-eyebrow">Desenvolvimento · {ctx.filter.label}</p>
          <h1>Tecnologia e infraestrutura</h1>
          <p>
            Inventário e links. A configuração técnica (chaves, planos, webhooks) continua no admin de cada produto; os custos
            mensais entram no Financeiro como <Link href="/studio/financeiro/recorrentes">recorrentes</Link>.
          </p>
        </div>
        <div className="st-actions">
          {ctx.scope
            .filter((x) => x.kind === "product" && x.admin_url)
            .map((x) => (
              <a key={x.id} className="st-btn" href={x.admin_url!} target="_blank" rel="noopener noreferrer">
                Abrir admin do {x.name} ↗
              </a>
            ))}
        </div>
      </div>
      <div className="st-grid" data-cols="2-1">
        <div className="st-table-wrap">
          <table className="st-table">
            <thead>
              <tr>
                <th scope="col">Recurso</th>
                <th scope="col">Entidade</th>
                <th scope="col">Fornecedor</th>
                <th scope="col" style={{ textAlign: "right" }}>
                  Custo/mês
                </th>
                <th scope="col">
                  <span className="visually-hidden">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((a) => (
                <tr key={a.id}>
                  <td>
                    {a.url ? (
                      <a href={a.url} target="_blank" rel="noopener noreferrer">
                        {a.name} ↗
                      </a>
                    ) : (
                      a.name
                    )}
                    <br />
                    <small className="st-hint">{a.kind}</small>
                  </td>
                  <td>{ent.get(a.entity_id)}</td>
                  <td>{a.provider ?? "—"}</td>
                  <td className="st-num">{ctx.canSeeFinance ? formatCents(Number(a.monthly_cost_cents)) : "•••"}</td>
                  <td>{ctx.canWrite && <Link href={`/studio/desenvolvimento/infraestrutura?editar=${a.id}`}>Editar</Link>}</td>
                </tr>
              ))}
              {!data?.length && (
                <tr>
                  <td colSpan={5}>Nenhum recurso cadastrado.</td>
                </tr>
              )}
            </tbody>
            {ctx.canSeeFinance && !!data?.length && (
              <tfoot>
                <tr>
                  <th scope="row" colSpan={3}>
                    Total mensal
                  </th>
                  <td className="st-num">{formatCents(total)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {ctx.canWrite && (
          <article className="st-card">
            <h2>{editing ? "Editar recurso" : "Novo recurso"}</h2>
            <RecordForm kind="infra_assets" record={editing} entities={ctx.entityOptions} back="/studio/desenvolvimento/infraestrutura" />
            {editing && <DeleteButton kind="infra_assets" id={editing.id} back="/studio/desenvolvimento/infraestrutura" />}
          </article>
        )}
      </div>
    </>
  );
}
