import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/studio/Icon";
import { label, RELEASE_STATUS, SEVERITY } from "@/lib/studio/records";
import { br, requireScope } from "@/lib/studio/scope";
import { isClosed, TICKET_STATUS, ticketLabel, ticketTone } from "@/lib/studio/ticket-labels";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Desenvolvimento" };

// Início do Desenvolvimento: duas partes bem separadas.
// 1) Chamados: qualquer pessoa sugere melhorias ou avisa de problemas; Sócio/Admin trata.
// 2) Engenharia: o trabalho técnico (backlog, versões, projetos, infraestrutura).
export default async function DevHome({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  const ctx = await requireScope(e);
  const supabase = await createClient();
  let tq = supabase.from("tickets").select("id,number,title,status,entity_id,created_at").in("entity_id", ctx.scopeIds).order("created_at", { ascending: false }).limit(200);
  if (!ctx.isAdmin) tq = tq.eq("created_by", ctx.profile.id);
  const [{ data: tickets }, { data: items }, { data: releases }] = await Promise.all([
    tq,
    supabase.from("backlog_items").select("id,title,type,status,severity").in("entity_id", ctx.scopeIds).not("status", "in", "(done,wont_do)"),
    supabase.from("releases").select("id,version,title,status,target_date,entity_id").in("entity_id", ctx.scopeIds).neq("status", "released").order("target_date").limit(3),
  ]);
  const open = (tickets ?? []).filter((t) => !isClosed(t.status));
  const bugs = (items ?? []).filter((x) => x.type === "bug");
  const critical = bugs.filter((x) => x.severity === "critical" || x.severity === "high");
  const doing = (items ?? []).filter((x) => x.type !== "bug" && ["in_progress", "testing"].includes(x.status));
  const ent = new Map(ctx.entities.map((x) => [x.id, x]));
  const products = ctx.visible.filter((x) => x.kind === "product");
  const q = e ? `?e=${e}` : "";

  return (
    <>
      <div className="st-page-head">
        <div>
          <p className="st-eyebrow">Desenvolvimento · {ctx.filter.label}</p>
          <h1>Desenvolvimento</h1>
          <p>Dois lados: os chamados que a equipe abre (ideias e problemas) e o trabalho técnico que vem deles.</p>
        </div>
      </div>

      <div className="st-grid" data-cols="2">
        {/* 1. Chamados */}
        <article className="st-card st-hub">
          <div className="st-hub-head">
            <span className="st-hub-icon">
              <Icon name="chat" />
            </span>
            <div>
              <h2>Chamados</h2>
              <p className="st-hint">Sugestão de melhoria, problema ou dúvida sobre qualquer sistema, com até 2 imagens.</p>
            </div>
          </div>
          <div className="st-hub-number">
            <b>{open.length}</b>
            <span>{ctx.isAdmin ? "em aberto na fila" : "seus em aberto"}</span>
          </div>
          <ul className="st-list">
            {open.slice(0, 4).map((t) => (
              <li key={t.id}>
                <Link className="st-grow" href={`/studio/desenvolvimento/chamados/${t.id}`}>
                  #{t.number} {t.title}
                </Link>
                <span className="st-status" data-tone={ticketTone(t.status)}>
                  {ticketLabel(TICKET_STATUS, t.status)}
                </span>
              </li>
            ))}
            {!open.length && <li className="st-hint">Nenhum chamado em aberto.</li>}
          </ul>
          <div className="st-actions" style={{ marginTop: "auto" }}>
            <Link className="st-btn" href="/studio/desenvolvimento/chamados?novo=1">
              + Abrir chamado
            </Link>
            <Link className="st-btn" data-variant="ghost" href="/studio/desenvolvimento/chamados">
              {ctx.isAdmin ? "Ver fila" : "Meus chamados"}
            </Link>
          </div>
        </article>

        {/* 2. Engenharia */}
        <article className="st-card st-hub">
          <div className="st-hub-head">
            <span className="st-hub-icon">
              <Icon name="dev" />
            </span>
            <div>
              <h2>Engenharia</h2>
              <p className="st-hint">O que está sendo feito nos sistemas: bugs, melhorias, versões e infraestrutura.</p>
            </div>
          </div>
          <dl className="st-hub-stats">
            <div>
              <dt>Bugs abertos</dt>
              <dd>{bugs.length}</dd>
              <span className="st-hint">{critical.length} alto/crítico</span>
            </div>
            <div>
              <dt>Em andamento</dt>
              <dd>{doing.length}</dd>
              <span className="st-hint">melhorias e funções</span>
            </div>
            <div>
              <dt>Próxima versão</dt>
              <dd>{releases?.[0] ? releases[0].version : "—"}</dd>
              <span className="st-hint">{releases?.[0] ? `${ent.get(releases[0].entity_id)?.name} · ${label(RELEASE_STATUS, releases[0].status)} · ${br(releases[0].target_date)}` : "nenhuma planejada"}</span>
            </div>
          </dl>
          <ul className="st-list">
            {critical.slice(0, 3).map((b) => (
              <li key={b.id}>
                <span className="st-status" data-tone={b.severity === "critical" ? "bad" : "warn"}>
                  {label(SEVERITY, b.severity)}
                </span>
                <Link className="st-grow" href={`/studio/desenvolvimento/backlog/${b.id}`}>
                  {b.title}
                </Link>
              </li>
            ))}
          </ul>
          <div className="st-actions" style={{ marginTop: "auto" }}>
            <Link className="st-btn" data-variant="ghost" href={`/studio/desenvolvimento/backlog${q}`}>
              Backlog e bugs
            </Link>
            <Link className="st-btn" data-variant="ghost" href={`/studio/desenvolvimento/versoes${q}`}>
              Versões
            </Link>
            <Link className="st-btn" data-variant="ghost" href={`/studio/desenvolvimento/infraestrutura${q}`}>
              Infraestrutura
            </Link>
          </div>
        </article>
      </div>

      {/* painéis administrativos dos produtos */}
      {products.length > 0 && (
        <article className="st-card">
          <div className="st-card-head">
            <h2>Painéis dos produtos</h2>
            <span>abrem em nova aba</span>
          </div>
          <div className="st-links">
            {products.map((p) => (
              <div key={p.id} className="st-link-tile">
                <span className="st-dot" style={{ background: p.color }} aria-hidden="true" />
                <strong>{p.name}</strong>
                {p.admin_url ? (
                  <a className="st-btn" href={p.admin_url} target="_blank" rel="noopener noreferrer">
                    Abrir admin ↗<span className="visually-hidden"> (nova aba)</span>
                  </a>
                ) : (
                  <Link className="st-btn" data-variant="ghost" href="/studio/configuracoes/produtos">
                    Cadastrar link do admin
                  </Link>
                )}
                <Link className="st-linkbtn" href={`/studio/produtos/${p.slug}`}>
                  Página do produto
                </Link>
              </div>
            ))}
          </div>
        </article>
      )}
    </>
  );
}
