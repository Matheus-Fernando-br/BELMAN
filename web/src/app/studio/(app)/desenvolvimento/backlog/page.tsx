import type { Metadata } from "next";
import Link from "next/link";
import { QuickSelect, RecordForm } from "@/components/studio/RecordForm";
import { BACKLOG_STATUS, BACKLOG_TYPE, label, PRIORITY, SEVERITY } from "@/lib/studio/records";
import { br, loadRefs, requireScope } from "@/lib/studio/scope";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Backlog e bugs" };

export default async function BacklogPage({ searchParams }: { searchParams: Promise<{ e?: string; tipo?: string; status?: string }> }) {
  const params = await searchParams;
  const ctx = await requireScope(params.e);
  const supabase = await createClient();
  let q = supabase.from("backlog_items").select("id,title,type,status,priority,severity,entity_id,source,created_at,release_id").in("entity_id", ctx.scopeIds).order("created_at", { ascending: false }).limit(500);
  if (params.tipo) q = q.eq("type", params.tipo);
  if (params.status === "abertos" || !params.status) q = q.not("status", "in", "(done,wont_do)");
  else if (params.status !== "todos") q = q.eq("status", params.status);
  const [{ data }, refs] = await Promise.all([q, loadRefs(ctx.scopeIds, ["profiles", "projects", "releases"])]);
  const ent = new Map(ctx.entities.map((x) => [x.id, x]));
  const versions = new Map((refs.releases ?? []).map(([id, v]) => [id, v]));
  const rank = { critical: 0, high: 1, medium: 2, low: 3 } as Record<string, number>;
  const prio = { urgent: 0, high: 1, medium: 2, low: 3 } as Record<string, number>;
  const rows = (data ?? []).sort((a, b) => (rank[a.severity ?? "low"] ?? 4) - (rank[b.severity ?? "low"] ?? 4) || prio[a.priority] - prio[b.priority]);

  return (
    <>
      <div className="st-page-head">
        <div>
          <p className="st-eyebrow">Desenvolvimento · {ctx.filter.label}</p>
          <h1>Backlog e bugs</h1>
          <p>Funcionalidades, melhorias e correções. Feedback de testadores entra aqui já marcado com o produto.</p>
        </div>
      </div>
      <form method="get" className="st-actions">
        {params.e && <input type="hidden" name="e" value={params.e} />}
        <select name="tipo" defaultValue={params.tipo ?? ""} className="st-input" style={{ maxWidth: "12rem" }} aria-label="Tipo">
          <option value="">Todos os tipos</option>
          {BACKLOG_TYPE.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={params.status ?? "abertos"} className="st-input" style={{ maxWidth: "14rem" }} aria-label="Situação">
          <option value="abertos">Em aberto</option>
          <option value="todos">Todos</option>
          {BACKLOG_STATUS.map(([v, l]) => (
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
              <th scope="col">Item</th>
              <th scope="col">Produto</th>
              <th scope="col">Tipo</th>
              <th scope="col">Gravidade / prioridade</th>
              <th scope="col">Versão</th>
              <th scope="col">Situação</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.id}>
                <td>
                  <Link href={`/studio/desenvolvimento/backlog/${x.id}`}>{x.title}</Link>
                  <br />
                  <small className="st-hint">
                    {br(x.created_at)}
                    {x.source === "feedback" ? " · via formulário de feedback" : ""}
                  </small>
                </td>
                <td>{ent.get(x.entity_id)?.name}</td>
                <td>{label(BACKLOG_TYPE, x.type)}</td>
                <td>
                  {x.severity && (
                    <span className="st-status" data-tone={x.severity === "critical" ? "bad" : x.severity === "high" ? "warn" : "neutral"}>
                      {label(SEVERITY, x.severity)}
                    </span>
                  )}{" "}
                  <small className="st-hint">{label(PRIORITY, x.priority)}</small>
                </td>
                <td>{x.release_id ? versions.get(x.release_id) ?? "—" : "—"}</td>
                <td>
                  <QuickSelect kind="backlog_items" id={x.id} field="status" value={x.status} options={BACKLOG_STATUS} label={`Situação de ${x.title}`} disabled={!ctx.canWrite} />
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={6}>Nada por aqui com esses filtros.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {ctx.canWrite && (
        <article className="st-card">
          <h2>Novo item</h2>
          <RecordForm kind="backlog_items" entities={ctx.entityOptions.filter(([id]) => ctx.entities.find((x) => x.id === id)?.kind !== "shared")} refs={refs} defaults={{ type: "feature", status: "new", priority: "medium" }} back="/studio/desenvolvimento/backlog/{id}" />
        </article>
      )}
    </>
  );
}
