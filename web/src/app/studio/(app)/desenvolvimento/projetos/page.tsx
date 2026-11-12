import type { Metadata } from "next";
import Link from "next/link";
import { QuickSelect, RecordForm } from "@/components/studio/RecordForm";
import { PROJECT_STATUS } from "@/lib/studio/records";
import { br, loadRefs, requireScope, todayLocal } from "@/lib/studio/scope";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Projetos" };

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ e?: string; editar?: string }> }) {
  const params = await searchParams;
  const ctx = await requireScope(params.e);
  const supabase = await createClient();
  const [{ data: projects }, { data: tasks }, refs] = await Promise.all([
    supabase.from("projects").select("*").in("entity_id", ctx.scopeIds).order("status").order("due_date"),
    supabase.from("tasks").select("project_id,status").in("entity_id", ctx.scopeIds).not("project_id", "is", null),
    loadRefs(ctx.scopeIds, ["profiles"]),
  ]);
  const people = new Map((refs.profiles ?? []).map(([id, n]) => [id, n]));
  const ent = new Map(ctx.entities.map((x) => [x.id, x.name]));
  const today = todayLocal();
  const editing = (projects ?? []).find((p) => p.id === params.editar);
  return (
    <>
      <div className="st-page-head">
        <div>
          <p className="st-eyebrow">Desenvolvimento · {ctx.filter.label}</p>
          <h1>Projetos</h1>
          <p>Projetos maiores, com responsável, prazo e etapas (as tarefas vinculadas aparecem como progresso).</p>
        </div>
      </div>
      <div className="st-grid" data-cols="2-1">
        <div className="st-table-wrap">
          <table className="st-table">
            <thead>
              <tr>
                <th scope="col">Projeto</th>
                <th scope="col">Responsável</th>
                <th scope="col">Prazo</th>
                <th scope="col">Progresso</th>
                <th scope="col">Situação</th>
              </tr>
            </thead>
            <tbody>
              {(projects ?? []).map((p) => {
                const t = (tasks ?? []).filter((x) => x.project_id === p.id);
                const pct = t.length ? Math.round((t.filter((x) => x.status === "done").length / t.length) * 100) : null;
                return (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/studio/desenvolvimento/projetos?editar=${p.id}`}>{p.name}</Link>
                      <br />
                      <small className="st-hint">{ent.get(p.entity_id)}</small>
                    </td>
                    <td>{p.owner_id ? people.get(p.owner_id) : "—"}</td>
                    <td style={p.status !== "done" && p.due_date && p.due_date < today ? { color: "#b42318" } : undefined}>{br(p.due_date)}</td>
                    <td>{pct == null ? <span className="st-hint">sem tarefas</span> : `${pct}% (${t.length} tarefas)`}</td>
                    <td>
                      <QuickSelect kind="projects" id={p.id} field="status" value={p.status} options={PROJECT_STATUS} label={`Situação de ${p.name}`} disabled={!ctx.canWrite} />
                    </td>
                  </tr>
                );
              })}
              {!projects?.length && (
                <tr>
                  <td colSpan={5}>Nenhum projeto.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {ctx.canWrite && (
          <article className="st-card">
            <h2>{editing ? "Editar projeto" : "Novo projeto"}</h2>
            <RecordForm kind="projects" record={editing} entities={ctx.entityOptions} refs={refs} defaults={{ status: "planned" }} back="/studio/desenvolvimento/projetos" />
          </article>
        )}
      </div>
    </>
  );
}
