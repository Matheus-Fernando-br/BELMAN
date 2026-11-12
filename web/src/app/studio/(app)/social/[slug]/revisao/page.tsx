import type { Metadata } from "next";
import Link from "next/link";
import { BUSY, dateTimeBR, formatLabel, STATUS, statusLabel, statusTone, typeLabel } from "@/lib/social/labels";
import { requireWorkspace, signedUrls } from "@/lib/social/server";
import { createClient } from "@/lib/supabase/server";
import { AutoRefresh } from "../../ui";

export const metadata: Metadata = { title: "Revisão · Redes Sociais" };

const FILTERS = [
  ["fila", "Para revisar", ["review", "failed"]],
  ["andamento", "Em produção", ["draft", "generating", "rendering"]],
  ["agendados", "Aprovados e agendados", ["approved", "scheduled", "publishing"]],
  ["rejeitados", "Rejeitados", ["rejected"]],
] as const;

export default async function ReviewList({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ver?: string }> }) {
  const { slug } = await params;
  const { ver = "fila" } = await searchParams;
  const { entity } = await requireWorkspace(slug);
  const filter = FILTERS.find(([k]) => k === ver) ?? FILTERS[0];
  const supabase = await createClient();
  const [{ data: posts }, { data: counts }] = await Promise.all([
    supabase.from("social_posts").select("id,format,theme,post_type,status,caption,scheduled_at,error,created_at,updated_at").eq("entity_id", entity.id).in("status", filter[2] as unknown as string[]).order("created_at", { ascending: false }).limit(60),
    supabase.from("social_posts").select("status").eq("entity_id", entity.id).neq("status", "published"),
  ]);
  const ids = (posts ?? []).map((p) => p.id);
  const { data: covers } = ids.length
    ? await supabase.from("social_assets").select("post_id,storage_path,kind,idx").in("post_id", ids).in("kind", ["preview", "image", "cover"]).order("idx")
    : { data: [] };
  const firstOf = new Map<string, string>();
  for (const k of ["preview", "cover", "image"]) for (const c of covers ?? []) if (c.kind === k && !firstOf.has(c.post_id)) firstOf.set(c.post_id, c.storage_path);
  const urls = await signedUrls([...firstOf.values()]);
  const count = (st: readonly string[]) => (counts ?? []).filter((c) => st.includes(c.status)).length;
  const busy = (posts ?? []).some((p) => BUSY.includes(p.status));
  return (
    <>
      <AutoRefresh active={busy} />
      <nav className="st-actions" aria-label="Filtro" style={{ margin: "1rem 0" }}>
        {FILTERS.map(([k, l, st]) => (
          <Link key={k} href={`?ver=${k}`} className="st-tag" aria-current={k === filter[0] ? "true" : undefined}>
            {l} · {count(st)}
          </Link>
        ))}
        <Link className="st-btn" href={`/studio/social/${slug}/criar`} style={{ marginLeft: "auto" }}>
          + Novo post
        </Link>
      </nav>
      <div className="st-grid" data-cols="3">
        {(posts ?? []).map((p) => {
          const src = firstOf.get(p.id);
          return (
            <Link key={p.id} href={`/studio/social/${slug}/post/${p.id}`} className="st-card" style={{ textDecoration: "none", color: "inherit" }}>
              <div style={{ aspectRatio: "4 / 5", background: "#111", borderRadius: 8, overflow: "hidden", display: "grid", placeItems: "center" }}>
                {src && urls.get(src) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={urls.get(src)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span style={{ color: "#aaa", fontSize: 13 }}>{statusLabel(p.status)}…</span>
                )}
              </div>
              <div className="st-actions" style={{ gap: "0.4rem" }}>
                <span className="st-status" data-tone={statusTone(p.status)}>
                  {statusLabel(p.status)}
                </span>
                <span className="st-tag">{formatLabel(p.format)}</span>
                <span className="st-tag">{typeLabel(p.post_type)}</span>
              </div>
              <strong>{p.theme ?? "Sem tema"}</strong>
              <span className="st-hint">{p.scheduled_at ? `Agendado: ${dateTimeBR(p.scheduled_at)}` : `Criado: ${dateTimeBR(p.created_at)}`}</span>
              {p.error && <span className="st-status" data-tone="bad">{p.error.slice(0, 120)}</span>}
            </Link>
          );
        })}
        {!posts?.length && <p className="st-hint">Nada aqui. {STATUS.length && filter[0] === "fila" ? "Crie um post ou ligue a geração automática em Regras." : ""}</p>}
      </div>
    </>
  );
}
