import type { Metadata } from "next";
import Link from "next/link";
import { br, requireScope } from "@/lib/studio/scope";
import { isClosed, TICKET_KIND, TICKET_STATUS, ticketLabel, ticketTone } from "@/lib/studio/ticket-labels";
import { createClient } from "@/lib/supabase/server";
import { OpenTicketForm } from "./TicketForms";

export const metadata: Metadata = { title: "Chamados" };

type Row = { id: string; number: number; title: string; kind: string; status: string; priority: string | null; entity_id: string; created_by: string; created_at: string; attachments: unknown[]; answer: string | null };

export default async function TicketsPage({ searchParams }: { searchParams: Promise<{ e?: string; ver?: string; s?: string; novo?: string }> }) {
  const params = await searchParams;
  const ctx = await requireScope(params.e);
  const supabase = await createClient();
  const fila = ctx.isAdmin && params.ver !== "meus";
  const situacao = params.s === "fechados" ? "fechados" : params.s === "todos" ? "todos" : "abertos";

  let q = supabase.from("tickets").select("id,number,title,kind,status,priority,entity_id,created_by,created_at,attachments,answer").in("entity_id", ctx.scopeIds).order("created_at", { ascending: false }).limit(300);
  if (!fila) q = q.eq("created_by", ctx.profile.id);
  const [{ data, error }, { data: people }] = await Promise.all([q, supabase.from("profiles").select("id,full_name,email")]);
  const all = (data ?? []) as Row[];
  const rows = all.filter((t) => (situacao === "todos" ? true : situacao === "fechados" ? isClosed(t.status) : !isClosed(t.status)));
  const name = new Map((people ?? []).map((p) => [p.id, p.full_name || p.email]));
  const ent = new Map(ctx.entities.map((x) => [x.id, x]));
  const abertos = all.filter((t) => t.status === "aberto").length;
  const analise = all.filter((t) => t.status === "em_analise").length;
  const fechados = all.filter((t) => isClosed(t.status)).length;

  const qs = (extra: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    Object.entries({ e: params.e, ver: params.ver, s: params.s, ...extra }).forEach(([k, v]) => v && sp.set(k, v));
    const s = sp.toString();
    return `/studio/desenvolvimento/chamados${s ? `?${s}` : ""}`;
  };
  const showForm = params.novo === "1" || (!fila && !all.length);

  return (
    <>
      <div className="st-page-head">
        <div>
          <p className="st-eyebrow">Desenvolvimento · Chamados</p>
          <h1>{fila ? "Fila de chamados" : "Meus chamados"}</h1>
          <p>{fila ? "Sugestões e problemas abertos pela equipe. Trate, responda e feche: ao fechar, as imagens são apagadas." : "Sugira uma melhoria ou avise de um problema em qualquer sistema. A resposta aparece aqui."}</p>
        </div>
        <div className="st-actions">
          {ctx.isAdmin && (
            <div className="st-segment" role="tablist" aria-label="Visão">
              <Link role="tab" aria-selected={fila} aria-current={fila ? "true" : undefined} href={qs({ ver: undefined })}>
                Fila {abertos + analise > 0 && fila ? <b className="st-count">{abertos + analise}</b> : null}
              </Link>
              <Link role="tab" aria-selected={!fila} aria-current={!fila ? "true" : undefined} href={qs({ ver: "meus" })}>
                Meus chamados
              </Link>
            </div>
          )}
          <Link className="st-btn" href={showForm ? qs({ novo: undefined }) : qs({ novo: "1" })}>
            {showForm ? "Fechar formulário" : "+ Abrir chamado"}
          </Link>
        </div>
      </div>

      {error && <p className="st-banner">Os chamados ainda não foram ativados no banco (migração 0015).</p>}

      {showForm && (
        <article className="st-card">
          <div className="st-card-head">
            <h2>Abrir chamado</h2>
            <span>leva menos de 1 minuto</span>
          </div>
          <OpenTicketForm entities={ctx.visible.filter((e) => e.kind !== "shared").map((e) => ({ id: e.id, name: e.kind === "holding" ? `${e.name} Studio (este sistema)` : e.name }))} defaultEntity={ctx.scope.length === 1 ? ctx.scope[0].id : undefined} />
        </article>
      )}

      <dl className="st-kpis">
        <div className="st-kpi">
          <dt>Abertos</dt>
          <dd>{abertos}</dd>
          <span className="st-delta">aguardando análise</span>
        </div>
        <div className="st-kpi">
          <dt>Em análise</dt>
          <dd>{analise}</dd>
          <span className="st-delta">sendo avaliados ou feitos</span>
        </div>
        <div className="st-kpi">
          <dt>Fechados</dt>
          <dd>{fechados}</dd>
          <span className="st-delta">concluídos ou recusados</span>
        </div>
      </dl>

      <div className="st-actions">
        {[
          ["abertos", "Em aberto"],
          ["fechados", "Fechados"],
          ["todos", "Todos"],
        ].map(([v, l]) => (
          <Link key={v} className="st-tag" href={qs({ s: v === "abertos" ? undefined : v })} aria-current={situacao === v ? "true" : undefined}>
            {l}
          </Link>
        ))}
      </div>

      <ul role="list" className="st-tickets">
        {rows.map((t) => {
          const e = ent.get(t.entity_id);
          return (
            <li key={t.id}>
              <Link href={`/studio/desenvolvimento/chamados/${t.id}`} className="st-ticket">
                <span className="st-ticket-num">#{t.number}</span>
                <span className="st-ticket-main">
                  <strong>{t.title}</strong>
                  <small>
                    <span className="st-dot" style={{ background: e?.color }} aria-hidden="true" /> {e?.kind === "holding" ? "Bellman Studio" : e?.name} · {ticketLabel(TICKET_KIND, t.kind)}
                    {fila ? ` · ${name.get(t.created_by) ?? "—"}` : ""} · {br(t.created_at)}
                    {t.attachments?.length ? ` · ${t.attachments.length} imagem(ns)` : ""}
                    {t.answer ? " · respondido" : ""}
                  </small>
                </span>
                {t.priority === "alta" && <span className="st-tag">Prioridade alta</span>}
                <span className="st-status" data-tone={ticketTone(t.status)}>
                  {ticketLabel(TICKET_STATUS, t.status)}
                </span>
              </Link>
            </li>
          );
        })}
        {!rows.length && <li className="st-restricted">{situacao === "abertos" ? "Nenhum chamado em aberto." : "Nenhum chamado aqui."}</li>}
      </ul>
    </>
  );
}
