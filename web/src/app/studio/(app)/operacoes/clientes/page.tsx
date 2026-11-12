import type { Metadata } from "next";
import Link from "next/link";
import { QuickSelect, RecordForm } from "@/components/studio/RecordForm";
import { formatCents } from "@/lib/studio/finance-math";
import { CUSTOMER_STATUS } from "@/lib/studio/records";
import { br, requireScope } from "@/lib/studio/scope";
import { createClient } from "@/lib/supabase/server";
import { saveTemplate } from "../actions";

export const metadata: Metadata = { title: "Clientes" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ e?: string; status?: string; q?: string }> }) {
  const params = await searchParams;
  const ctx = await requireScope(params.e);
  const supabase = await createClient();
  let query = supabase.from("customers").select("id,name,entity_id,status,plan,mrr_cents,started_at,contact_name").in("entity_id", ctx.scopeIds).order("name").limit(1000);
  if (params.status) query = query.eq("status", params.status);
  if (params.q) query = query.ilike("name", `%${params.q.replace(/[%_]/g, "")}%`);
  const [{ data }, { data: templates }] = await Promise.all([
    query,
    supabase.from("onboarding_templates").select("id,name,items,entity_id").in("entity_id", ctx.scopeIds),
  ]);
  const ent = new Map(ctx.entities.map((x) => [x.id, x]));
  const rows = data ?? [];

  return (
    <>
      <div className="st-page-head">
        <div>
          <p className="st-eyebrow">Operações · {ctx.filter.label}</p>
          <h1>Clientes e onboarding</h1>
          <p>Contas por produto, situação e implantação. Vendas concluídas no CRM entram aqui sozinhas.</p>
        </div>
      </div>
      <form method="get" className="st-actions">
        {params.e && <input type="hidden" name="e" value={params.e} />}
        <input name="q" defaultValue={params.q} placeholder="Buscar cliente" className="st-input" style={{ maxWidth: "16rem" }} aria-label="Buscar cliente" />
        <select name="status" defaultValue={params.status ?? ""} className="st-input" style={{ maxWidth: "12rem" }} aria-label="Situação">
          <option value="">Todas as situações</option>
          {CUSTOMER_STATUS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <button className="st-btn" data-variant="ghost">
          Filtrar
        </button>
      </form>
      <div className="st-table-wrap">
        <table className="st-table">
          <thead>
            <tr>
              <th scope="col">Cliente</th>
              <th scope="col">Produto</th>
              <th scope="col">Plano</th>
              <th scope="col" style={{ textAlign: "right" }}>
                Mensalidade
              </th>
              <th scope="col">Desde</th>
              <th scope="col">Situação</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link href={`/studio/operacoes/clientes/${c.id}`}>{c.name}</Link>
                  {c.contact_name && (
                    <>
                      <br />
                      <small className="st-hint">{c.contact_name}</small>
                    </>
                  )}
                </td>
                <td>{ent.get(c.entity_id)?.name}</td>
                <td>{c.plan ?? "—"}</td>
                <td className="st-num">{ctx.canSeeFinance ? formatCents(Number(c.mrr_cents)) : "•••"}</td>
                <td>{br(c.started_at)}</td>
                <td>
                  <QuickSelect kind="customers" id={c.id} field="status" value={c.status} options={CUSTOMER_STATUS} label={`Situação de ${c.name}`} disabled={!ctx.canWrite} />
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={6}>Nenhum cliente com esses filtros.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="st-grid" data-cols="2">
        {ctx.canWrite && (
          <article className="st-card">
            <h2>Novo cliente</h2>
            <RecordForm kind="customers" entities={ctx.entityOptions} defaults={{ status: "onboarding" }} back="/studio/operacoes/clientes/{id}" />
          </article>
        )}
        <article className="st-card">
          <h2>Checklists de implantação</h2>
          <p className="st-hint">Um item por linha. Usado quando um cliente começa o onboarding.</p>
          {(templates ?? []).map((t) => (
            <form key={t.id} action={saveTemplate} className="st-form">
              <input type="hidden" name="id" value={t.id} />
              <label className="st-field">
                <span>
                  <strong>{ent.get(t.entity_id)?.name}</strong> · {t.name}
                </span>
                <textarea name="items" defaultValue={(t.items as string[]).join("\n")} rows={6} className="st-input" disabled={!ctx.canWrite} />
              </label>
              {ctx.canWrite && (
                <button className="st-btn" data-variant="ghost">
                  Salvar checklist
                </button>
              )}
            </form>
          ))}
        </article>
      </div>
    </>
  );
}
