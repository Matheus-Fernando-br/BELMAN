import type { Metadata } from "next";
import Link from "next/link";
import { BACKLOG_STATUS, label, RELEASE_STATUS, SEVERITY } from "@/lib/studio/records";
import { br, daysAgoISO, requireScope } from "@/lib/studio/scope";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Desenvolvimento" };

export default async function DevOverview({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  const ctx = await requireScope(e);
  const supabase = await createClient();
  const d90 = daysAgoISO(90);
  const [{ data: items }, { data: releases }, { data: projects }] = await Promise.all([
    supabase.from("backlog_items").select("id,title,type,status,severity,priority,created_at,resolved_at,entity_id").in("entity_id", ctx.scopeIds),
    supabase.from("releases").select("id,version,title,status,target_date,released_at,entity_id").in("entity_id", ctx.scopeIds).order("target_date"),
    supabase.from("projects").select("id,name,status,due_date").in("entity_id", ctx.scopeIds).eq("status", "active"),
  ]);
  const all = items ?? [];
  const open = (x: (typeof all)[number]) => !["done", "wont_do"].includes(x.status);
  const bugs = all.filter((x) => x.type === "bug" && open(x));
  const critical = bugs.filter((x) => x.severity === "critical" || x.severity === "high");
  const inProgress = all.filter((x) => x.type !== "bug" && ["in_progress", "testing"].includes(x.status));
  const fixed = all.filter((x) => x.type === "bug" && x.resolved_at && x.resolved_at >= d90);
  const avgFix = fixed.length ? fixed.reduce((s, x) => s + (Date.parse(x.resolved_at!) - Date.parse(x.created_at)) / 864e5, 0) / fixed.length : null;
  const delivered = all.filter((x) => x.type !== "bug" && x.status === "done" && x.resolved_at && x.resolved_at >= d90).length;
  const shipped = (releases ?? []).filter((r) => r.status === "released");
  const onTime = shipped.filter((r) => !r.target_date || (r.released_at && r.released_at <= r.target_date));
  const upcoming = (releases ?? []).filter((r) => r.status !== "released");
  const ent = new Map(ctx.entities.map((x) => [x.id, x]));

  return (
    <>
      <div className="st-page-head">
        <div>
          <p className="st-eyebrow">Desenvolvimento · {ctx.filter.label}</p>
          <h1>Visão geral técnica</h1>
        </div>
        <div className="st-actions">
          {ctx.scope
            .filter((x) => x.kind === "product" && x.admin_url)
            .map((x) => (
              <a key={x.id} className="st-btn" data-variant="ghost" href={x.admin_url!} target="_blank" rel="noopener noreferrer">
                Admin {x.name} ↗
              </a>
            ))}
        </div>
      </div>
      <dl className="st-kpis">
        <div className="st-kpi">
          <dt>Bugs abertos</dt>
          <dd>{bugs.length}</dd>
          <span className="st-delta" data-tone={critical.length ? "down" : undefined}>{critical.length} alto/crítico</span>
        </div>
        <div className="st-kpi">
          <dt>Funcionalidades em andamento</dt>
          <dd>{inProgress.length}</dd>
        </div>
        <div className="st-kpi">
          <dt>Entregas (90 dias)</dt>
          <dd>{delivered}</dd>
        </div>
        <div className="st-kpi">
          <dt>Tempo médio para corrigir bug</dt>
          <dd>{avgFix == null ? "—" : `${avgFix.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} d`}</dd>
        </div>
        <div className="st-kpi">
          <dt>Versões no prazo</dt>
          <dd>{shipped.length ? `${Math.round((onTime.length / shipped.length) * 100)}%` : "—"}</dd>
          <span className="st-delta">{shipped.length} publicada(s)</span>
        </div>
        <div className="st-kpi">
          <dt>Projetos ativos</dt>
          <dd>{projects?.length ?? 0}</dd>
        </div>
      </dl>
      <div className="st-grid" data-cols="3">
        <article className="st-card">
          <h2>Bugs críticos e altos</h2>
          <ul className="st-list">
            {critical.slice(0, 8).map((b) => (
              <li key={b.id}>
                <span className="st-status" data-tone={b.severity === "critical" ? "bad" : "warn"}>
                  {label(SEVERITY, b.severity)}
                </span>
                <Link className="st-grow" href={`/studio/desenvolvimento/backlog/${b.id}`}>
                  {b.title}
                </Link>
              </li>
            ))}
            {!critical.length && <li>Nenhum.</li>}
          </ul>
        </article>
        <article className="st-card">
          <h2>Em andamento</h2>
          <ul className="st-list">
            {inProgress.slice(0, 8).map((x) => (
              <li key={x.id}>
                <Link className="st-grow" href={`/studio/desenvolvimento/backlog/${x.id}`}>
                  {x.title}
                </Link>
                <small>{label(BACKLOG_STATUS, x.status)}</small>
              </li>
            ))}
            {!inProgress.length && <li>Nada em andamento.</li>}
          </ul>
        </article>
        <article className="st-card">
          <h2>Próximas versões</h2>
          <ul className="st-list">
            {upcoming.slice(0, 8).map((r) => (
              <li key={r.id}>
                <span className="st-dot" style={{ background: ent.get(r.entity_id)?.color }} aria-hidden="true" />
                <span className="st-grow">
                  {ent.get(r.entity_id)?.name} {r.version}
                  {r.title ? ` · ${r.title}` : ""}
                </span>
                <small>
                  {label(RELEASE_STATUS, r.status)} · {br(r.target_date)}
                </small>
              </li>
            ))}
            {!upcoming.length && <li>Nenhuma planejada.</li>}
          </ul>
        </article>
      </div>
    </>
  );
}
