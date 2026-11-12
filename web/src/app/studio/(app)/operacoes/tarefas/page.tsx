import type { Metadata } from "next";
import Link from "next/link";
import { QuickSelect, RecordForm } from "@/components/studio/RecordForm";
import { label, PRIORITY, TASK_STATUS } from "@/lib/studio/records";
import { br, loadRefs, requireScope, todayLocal } from "@/lib/studio/scope";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Tarefas" };

type Task = { id: string; title: string; status: string; priority: string; due_date: string | null; assignee_id: string | null; entity_id: string; description: string | null; project_id: string | null; customer_id: string | null };

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ e?: string; ver?: string; quem?: string; editar?: string }> }) {
  const params = await searchParams;
  const ctx = await requireScope(params.e);
  const supabase = await createClient();
  let q = supabase.from("tasks").select("*").in("entity_id", ctx.scopeIds).order("due_date", { ascending: true, nullsFirst: false }).limit(500);
  if (params.quem === "eu") q = q.eq("assignee_id", ctx.profile.id);
  const [{ data }, refs] = await Promise.all([q, loadRefs(ctx.scopeIds, ["profiles", "projects", "customers"])]);
  const tasks = (data ?? []) as Task[];
  const today = todayLocal();
  const people = new Map((refs.profiles ?? []).map(([id, n]) => [id, n]));
  const ent = new Map(ctx.entities.map((x) => [x.id, x]));
  const list = params.ver === "lista";
  const editing = tasks.find((t) => t.id === params.editar);
  const qs = (extra: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    Object.entries({ e: params.e, ver: params.ver, quem: params.quem, ...extra }).forEach(([k, v]) => v && sp.set(k, v));
    const s = sp.toString();
    return `/studio/operacoes/tarefas${s ? `?${s}` : ""}`;
  };

  const Card = ({ t }: { t: Task }) => {
    const late = t.status !== "done" && t.due_date && t.due_date < today;
    return (
      <li className="st-card" style={{ padding: "0.8rem", gap: "0.5rem", background: "#fff" }}>
        <Link href={qs({ editar: t.id })} style={{ fontWeight: 600, textDecoration: "none" }}>
          {t.title}
        </Link>
        <div className="st-actions" style={{ gap: "0.4rem" }}>
          <span className="st-tag">
            <span className="st-dot" style={{ background: ent.get(t.entity_id)?.color }} aria-hidden="true" />
            {ent.get(t.entity_id)?.name}
          </span>
          <span className="st-status" data-tone={t.priority === "urgent" ? "bad" : t.priority === "high" ? "warn" : "neutral"}>
            {label(PRIORITY, t.priority)}
          </span>
          {t.due_date && (
            <span className="st-status" data-tone={late ? "bad" : "neutral"}>
              {late ? "Atrasada · " : ""}
              {br(t.due_date)}
            </span>
          )}
        </div>
        <div className="st-actions" style={{ justifyContent: "space-between" }}>
          <small className="st-hint">{t.assignee_id ? people.get(t.assignee_id) : "Sem responsável"}</small>
          <QuickSelect kind="tasks" id={t.id} field="status" value={t.status} options={TASK_STATUS} label={`Situação de ${t.title}`} disabled={!ctx.canWrite} />
        </div>
      </li>
    );
  };

  return (
    <>
      <div className="st-page-head">
        <div>
          <p className="st-eyebrow">Operações · {ctx.filter.label}</p>
          <h1>Tarefas</h1>
        </div>
        <div className="st-actions">
          <Link className="st-tag" href={qs({ ver: undefined })} aria-current={!list ? "true" : undefined}>
            Quadro
          </Link>
          <Link className="st-tag" href={qs({ ver: "lista" })} aria-current={list ? "true" : undefined}>
            Lista
          </Link>
          <Link className="st-tag" href={qs({ quem: params.quem === "eu" ? undefined : "eu" })} aria-current={params.quem === "eu" ? "true" : undefined}>
            Só minhas
          </Link>
        </div>
      </div>

      {editing && (
        <article className="st-card" style={{ borderColor: "#0b0b0b" }}>
          <div className="st-card-head">
            <h2>Editar tarefa</h2>
            <Link href={qs({ editar: undefined })}>Fechar</Link>
          </div>
          <RecordForm kind="tasks" record={editing} entities={ctx.entityOptions} refs={refs} back={qs({ editar: undefined })} readOnly={!ctx.canWrite} />
        </article>
      )}

      {list ? (
        <div className="st-table-wrap">
          <table className="st-table">
            <thead>
              <tr>
                <th scope="col">Tarefa</th>
                <th scope="col">Entidade</th>
                <th scope="col">Responsável</th>
                <th scope="col">Prazo</th>
                <th scope="col">Prioridade</th>
                <th scope="col">Situação</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link href={qs({ editar: t.id })}>{t.title}</Link>
                  </td>
                  <td>{ent.get(t.entity_id)?.name}</td>
                  <td>{t.assignee_id ? people.get(t.assignee_id) : "—"}</td>
                  <td style={t.status !== "done" && t.due_date && t.due_date < today ? { color: "#b42318" } : undefined}>{br(t.due_date)}</td>
                  <td>{label(PRIORITY, t.priority)}</td>
                  <td>
                    <QuickSelect kind="tasks" id={t.id} field="status" value={t.status} options={TASK_STATUS} label={`Situação de ${t.title}`} disabled={!ctx.canWrite} />
                  </td>
                </tr>
              ))}
              {!tasks.length && (
                <tr>
                  <td colSpan={6}>Nenhuma tarefa.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="st-grid st-kanban">
          {TASK_STATUS.map(([status, name]) => {
            const col = tasks.filter((t) => t.status === status);
            return (
              <section key={status} className="st-card" style={{ background: "#f7f7f6", alignContent: "start" }} aria-label={name}>
                <div className="st-card-head">
                  <h2>{name}</h2>
                  <span>{col.length}</span>
                </div>
                <ul role="list" className="st-grid" style={{ gap: "0.6rem", margin: 0, padding: 0 }}>
                  {(status === "done" ? col.slice(-15) : col).map((t) => (
                    <Card key={t.id} t={t} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {ctx.canWrite && (
        <article className="st-card" id="nova">
          <h2>Nova tarefa</h2>
          <RecordForm kind="tasks" entities={ctx.entityOptions} refs={refs} defaults={{ status: "todo", priority: "medium", assignee_id: ctx.profile.id }} />
        </article>
      )}
    </>
  );
}
