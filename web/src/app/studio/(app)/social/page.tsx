import type { Metadata } from "next";
import Link from "next/link";
import { ACCOUNT_STATUS, dateTimeBR } from "@/lib/social/labels";
import { daysAgoISO } from "@/lib/studio/scope";
import { requireStudio } from "@/lib/studio/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Redes Sociais" };

export default async function SocialHome() {
  const ctx = await requireStudio();
  const supabase = await createClient();
  const ids = ctx.visible.filter((e) => e.kind !== "shared").map((e) => e.id);
  const [{ data: accounts }, { data: posts }, { data: brands }] = await Promise.all([
    supabase.from("social_accounts").select("entity_id,username,status,profile_picture_url,followers_count,token_expires_at").in("entity_id", ids),
    supabase.from("social_posts").select("entity_id,status,scheduled_at,published_at").in("entity_id", ids).in("status", ["review", "scheduled", "approved", "failed", "published"]),
    supabase.from("brand_profiles").select("entity_id").in("entity_id", ids),
  ]);
  const weekAgo = daysAgoISO(7);
  const workspaces = ctx.visible.filter((e) => e.kind !== "shared");
  return (
    <>
      <div className="st-page-head">
        <div>
          <p className="st-eyebrow">Redes Sociais</p>
          <h1>Workspaces</h1>
          <p className="st-hint">Cada produto tem a própria conta, marca, fila, calendário e métricas, isolados.</p>
        </div>
      </div>
      <div className="st-grid" data-cols="3">
        {workspaces.map((e) => {
          const acc = accounts?.find((a) => a.entity_id === e.id);
          const p = (posts ?? []).filter((x) => x.entity_id === e.id);
          const [label, tone] = ACCOUNT_STATUS[acc?.status ?? "disconnected"];
          const configured = brands?.some((b) => b.entity_id === e.id);
          return (
            <article key={e.id} className="st-card st-ws">
              <div className="st-ws-head">
                {acc?.profile_picture_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={acc.profile_picture_url} alt="" />
                ) : (
                  <span className="st-dot" style={{ background: e.color, width: 44, height: 44 }} aria-hidden="true" />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2 style={{ margin: 0 }}>{e.name}</h2>
                  <span className="st-hint">{acc?.username ? `@${acc.username}` : "Instagram não conectado"}</span>
                </div>
                <span className="st-status" data-tone={tone}>
                  {label}
                </span>
              </div>
              <ul className="st-list">
                <li>
                  <span className="st-grow">Aguardando revisão</span>
                  <strong>{p.filter((x) => x.status === "review").length}</strong>
                </li>
                <li>
                  <span className="st-grow">Agendados</span>
                  <strong>{p.filter((x) => x.status === "scheduled" || x.status === "approved").length}</strong>
                </li>
                <li>
                  <span className="st-grow">Publicados (7 dias)</span>
                  <strong>{p.filter((x) => x.status === "published" && (x.published_at ?? "") >= weekAgo).length}</strong>
                </li>
                {p.some((x) => x.status === "failed") && (
                  <li>
                    <span className="st-grow">Falhas</span>
                    <span className="st-status" data-tone="bad">
                      {p.filter((x) => x.status === "failed").length}
                    </span>
                  </li>
                )}
              </ul>
              {acc?.token_expires_at && acc.status !== "connected" && <p className="st-hint">Token vence em {dateTimeBR(acc.token_expires_at)}</p>}
              <div className="st-actions">
                <Link className="st-btn" href={`/studio/social/${e.slug}/revisao`}>
                  Abrir
                </Link>
                {!configured && (
                  <Link className="st-btn" data-variant="ghost" href={`/studio/social/${e.slug}/marca`}>
                    Configurar marca
                  </Link>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
