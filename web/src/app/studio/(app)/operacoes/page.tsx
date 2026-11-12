import type { Metadata } from "next";
import Link from "next/link";
import { CUSTOMER_STATUS, label, PRIORITY } from "@/lib/studio/records";
import { br, daysAgoISO, requireScope, todayLocal } from "@/lib/studio/scope";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Operações" };

export default async function OperationsOverview({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  const ctx = await requireScope(e);
  const supabase = await createClient();
  const today = todayLocal();
  const d30 = daysAgoISO(30);
  const [{ data: tasks }, { data: customers }, { data: runs }] = await Promise.all([
    supabase.from("tasks").select("id,title,status,priority,due_date,completed_at,entity_id,created_at").in("entity_id", ctx.scopeIds),
    supabase.from("customers").select("id,status,started_at,entity_id").in("entity_id", ctx.scopeIds),
    supabase.from("onboarding_runs").select("id,items,started_at,completed_at,customer_id,customers(name)").in("entity_id", ctx.scopeIds).order("started_at", { ascending: false }).limit(50),
  ]);
  const t = tasks ?? [];
  const open = t.filter((x) => x.status !== "done");
  const late = open.filter((x) => x.due_date && x.due_date < today);
  const done30 = t.filter((x) => x.completed_at && x.completed_at >= d30);
  const doneOnTime = done30.filter((x) => !x.due_date || x.completed_at!.slice(0, 10) <= x.due_date);
  const runsOpen = (runs ?? []).filter((r) => !r.completed_at);
  const runsDone = (runs ?? []).filter((r) => r.completed_at);
  const avgImpl = runsDone.length
    ? runsDone.reduce((s, r) => s + (Date.parse(r.completed_at!) - Date.parse(r.started_at)) / 864e5, 0) / runsDone.length
    : null;
  const byStatus = (s: string) => (customers ?? []).filter((c) => c.status === s).length;
  const urgent = open.filter((x) => x.priority === "urgent" || x.priority === "high").slice(0, 8);

  return (
    <>
      <div className="st-page-head">
        <div>
          <p className="st-eyebrow">Operações · {ctx.filter.label}</p>
          <h1>Visão geral operacional</h1>
        </div>
        {ctx.canWrite && (
          <Link className="st-btn" href={`/studio/operacoes/tarefas${e ? `?e=${e}` : ""}#nova`}>
            + Tarefa
          </Link>
        )}
      </div>
      <dl className="st-kpis">
        <div className="st-kpi">
          <dt>Tarefas em andamento</dt>
          <dd>{open.filter((x) => x.status === "doing").length}</dd>
          <span className="st-delta">{open.length} em aberto</span>
        </div>
        <div className="st-kpi">
          <dt>Atrasadas</dt>
          <dd>{late.length}</dd>
          <span className="st-delta" data-tone={late.length ? "down" : "up"}>{late.length ? "precisa de atenção" : "tudo no prazo"}</span>
        </div>
        <div className="st-kpi">
          <dt>Concluídas no prazo (30 dias)</dt>
          <dd>{done30.length ? `${Math.round((doneOnTime.length / done30.length) * 100)}%` : "—"}</dd>
          <span className="st-delta">{done30.length} concluída(s)</span>
        </div>
        <div className="st-kpi">
          <dt>Clientes ativos</dt>
          <dd>{byStatus("active")}</dd>
          <span className="st-delta">{byStatus("onboarding")} em implantação</span>
        </div>
        <div className="st-kpi">
          <dt>Onboardings abertos</dt>
          <dd>{runsOpen.length}</dd>
        </div>
        <div className="st-kpi">
          <dt>Tempo médio de implantação</dt>
          <dd>{avgImpl == null ? "—" : `${avgImpl.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} d`}</dd>
        </div>
      </dl>
      <div className="st-grid" data-cols="3">
        <article className="st-card">
          <div className="st-card-head">
            <h2>Atrasadas</h2>
            <span>{late.length}</span>
          </div>
          <ul className="st-list">
            {late.slice(0, 8).map((x) => (
              <li key={x.id}>
                <span className="st-grow">{x.title}</span>
                <span className="st-status" data-tone="bad">
                  {br(x.due_date)}
                </span>
              </li>
            ))}
            {!late.length && <li>Nada atrasado.</li>}
          </ul>
        </article>
        <article className="st-card">
          <div className="st-card-head">
            <h2>Prioridades</h2>
          </div>
          <ul className="st-list">
            {urgent.map((x) => (
              <li key={x.id}>
                <span className="st-grow">{x.title}</span>
                <span className="st-status" data-tone={x.priority === "urgent" ? "bad" : "warn"}>
                  {label(PRIORITY, x.priority)}
                </span>
              </li>
            ))}
            {!urgent.length && <li>Nenhuma tarefa urgente ou alta.</li>}
          </ul>
        </article>
        <article className="st-card">
          <div className="st-card-head">
            <h2>Implantações em andamento</h2>
          </div>
          <ul className="st-list">
            {runsOpen.slice(0, 8).map((r) => {
              const items = (r.items as { done: boolean }[]) ?? [];
              const pct = items.length ? Math.round((items.filter((i) => i.done).length / items.length) * 100) : 0;
              const name = (r.customers as unknown as { name: string } | null)?.name ?? "Cliente";
              return (
                <li key={r.id}>
                  <Link className="st-grow" href={`/studio/operacoes/clientes/${r.customer_id}`}>
                    {name}
                  </Link>
                  <small>{pct}%</small>
                </li>
              );
            })}
            {!runsOpen.length && <li>Nenhuma implantação aberta.</li>}
          </ul>
          <p className="st-hint">Situação das contas: {CUSTOMER_STATUS.map(([v, l]) => `${l} ${byStatus(v)}`).join(" · ")}</p>
        </article>
      </div>
    </>
  );
}
