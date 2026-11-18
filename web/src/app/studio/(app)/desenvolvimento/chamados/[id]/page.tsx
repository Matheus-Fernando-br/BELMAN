import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStudio } from "@/lib/studio/session";
import { br } from "@/lib/studio/scope";
import { TICKET_KIND, TICKET_PRIORITY, TICKET_STATUS, ticketLabel, ticketTone } from "@/lib/studio/ticket-labels";
import { signedTicketUrls, type TicketFile } from "@/lib/studio/tickets";
import { createClient } from "@/lib/supabase/server";
import { TicketAdminPanel } from "../TicketForms";

export const metadata: Metadata = { title: "Chamado" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const ctx = await requireStudio();
  const supabase = await createClient();
  const { data: t } = await supabase.from("tickets").select("*").eq("id", id).maybeSingle();
  if (!t) notFound(); // RLS: só quem abriu ou Sócio/Admin enxerga
  const files = (t.attachments ?? []) as TicketFile[];
  const ids = [t.created_by, t.closed_by].filter(Boolean);
  const [{ data: people }, urls] = await Promise.all([supabase.from("profiles").select("id,full_name,email").in("id", ids), signedTicketUrls(files.map((f) => f.path))]);
  const name = (uid: string | null) => {
    const p = (people ?? []).find((x) => x.id === uid);
    return p ? p.full_name || p.email : "—";
  };
  const e = ctx.entities.find((x) => x.id === t.entity_id);

  return (
    <>
      <div className="st-page-head">
        <div>
          <p className="st-eyebrow">
            <Link href="/studio/desenvolvimento/chamados">Chamados</Link> · #{t.number}
          </p>
          <h1>{t.title}</h1>
          <p>
            {e?.kind === "holding" ? "Bellman Studio" : e?.name} · {ticketLabel(TICKET_KIND, t.kind)} · aberto por {name(t.created_by)} em {br(t.created_at)}
          </p>
        </div>
        <span className="st-status" data-tone={ticketTone(t.status)} style={{ fontSize: "0.9rem" }}>
          {ticketLabel(TICKET_STATUS, t.status)}
        </span>
      </div>

      <div className="st-grid" data-cols={ctx.isAdmin ? "2-1" : undefined}>
        <div className="st-grid">
          <article className="st-card">
            <h2>Descrição</h2>
            {String(t.description || "Sem descrição.")
              .split(/\n{2,}/)
              .map((p: string, i: number) => (
                <p key={i} style={{ whiteSpace: "pre-wrap", margin: 0 }}>
                  {p}
                </p>
              ))}
          </article>

          <article className="st-card">
            <h2>Imagens</h2>
            {files.length ? (
              <div className="st-drop">
                {files.map((f) =>
                  urls.get(f.path) ? (
                    <a key={f.path} className="st-drop-item st-drop-view" href={urls.get(f.path)} target="_blank" rel="noopener noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element -- link assinado temporário */}
                      <img src={urls.get(f.path)} alt={f.name} />
                    </a>
                  ) : null,
                )}
              </div>
            ) : (
              <p className="st-hint" style={{ margin: 0 }}>
                {t.attachments_purged_at ? `As imagens foram apagadas ao fechar o chamado (${br(t.attachments_purged_at)}), para economizar espaço.` : "Nenhuma imagem anexada."}
              </p>
            )}
          </article>

          <article className="st-card">
            <h2>Resposta</h2>
            <p style={{ whiteSpace: "pre-wrap", margin: 0 }} className={t.answer ? undefined : "st-hint"}>
              {t.answer || "Ainda sem resposta. Assim que for analisado, a resposta aparece aqui."}
            </p>
            {t.closed_at && (
              <small className="st-hint">
                Fechado por {name(t.closed_by)} em {br(t.closed_at)}
                {t.priority ? ` · prioridade ${ticketLabel(TICKET_PRIORITY, t.priority).toLowerCase()}` : ""}
              </small>
            )}
          </article>
        </div>

        {ctx.isAdmin && (
          <article className="st-card" style={{ alignSelf: "start" }}>
            <h2>Tratar chamado</h2>
            <TicketAdminPanel id={t.id} status={t.status} priority={t.priority} answer={t.answer} backlogId={t.backlog_item_id} hasFiles={files.length > 0} />
          </article>
        )}
      </div>
    </>
  );
}
