import type { Metadata } from "next";
import Link from "next/link";
import { dateTimeBR, formatLabel, typeLabel } from "@/lib/social/labels";
import { requireWorkspace } from "@/lib/social/server";
import { daysAgoISO, todayLocal } from "@/lib/studio/scope";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Publicados · Redes Sociais" };

type M = { post_id: string; collected_at: string; reach: number | null; views: number | null; likes: number | null; comments: number | null; saves: number | null; shares: number | null };

export default async function PublishedPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ordem?: string }> }) {
  const { slug } = await params;
  const { ordem = "ranking" } = await searchParams;
  const { ctx, entity } = await requireWorkspace(slug);
  const supabase = await createClient();
  const { data: posts } = await supabase
    .from("social_posts")
    .select("id,theme,format,post_type,published_at,permalink")
    .eq("entity_id", entity.id)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(200);
  const ids = (posts ?? []).map((p) => p.id);
  const [{ data: metrics }, { data: usage }] = await Promise.all([
    ids.length ? supabase.from("social_metrics").select("post_id,collected_at,reach,views,likes,comments,saves,shares").in("post_id", ids).order("collected_at", { ascending: false }) : Promise.resolve({ data: [] as M[] }),
    ctx.isAdmin
      ? supabase.from("ai_usage").select("cost_usd,created_at").eq("entity_id", entity.id).gte("created_at", daysAgoISO(31))
      : Promise.resolve({ data: null }),
  ]);
  const latest = new Map<string, M>();
  for (const m of (metrics ?? []) as M[]) if (!latest.has(m.post_id)) latest.set(m.post_id, m);
  const score = (m?: M) => (m && m.reach ? ((m.saves ?? 0) + (m.shares ?? 0)) / m.reach : -1);
  const rows = (posts ?? []).map((p) => ({ ...p, m: latest.get(p.id) }));
  if (ordem === "ranking") rows.sort((a, b) => score(b.m) - score(a.m));
  const month = todayLocal().slice(0, 7);
  const cost = (usage ?? []).filter((u) => u.created_at.startsWith(month)).reduce((s, u) => s + Number(u.cost_usd), 0);
  const tot = (k: keyof M) => rows.reduce((s, r) => s + Number(r.m?.[k] ?? 0), 0);
  const pct = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
  return (
    <>
      <dl className="st-kpis" style={{ marginTop: "1rem" }}>
        <div className="st-kpi">
          <dt>Publicados</dt>
          <dd>{rows.length}</dd>
        </div>
        <div className="st-kpi">
          <dt>Alcance somado</dt>
          <dd>{tot("reach").toLocaleString("pt-BR")}</dd>
        </div>
        <div className="st-kpi">
          <dt>Salvamentos</dt>
          <dd>{tot("saves").toLocaleString("pt-BR")}</dd>
        </div>
        <div className="st-kpi">
          <dt>Compartilhamentos</dt>
          <dd>{tot("shares").toLocaleString("pt-BR")}</dd>
        </div>
        {ctx.isAdmin && (
          <div className="st-kpi">
            <dt>Gasto com IA no mês</dt>
            <dd>US$ {cost.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</dd>
          </div>
        )}
      </dl>
      <article className="st-card">
        <div className="st-card-head">
          <h2>Publicados</h2>
          <div className="st-actions">
            <Link className="st-tag" aria-current={ordem === "ranking" ? "true" : undefined} href="?ordem=ranking">
              Ranking (salv. + compart.) ÷ alcance
            </Link>
            <Link className="st-tag" aria-current={ordem === "data" ? "true" : undefined} href="?ordem=data">
              Mais recentes
            </Link>
          </div>
        </div>
        <div className="st-table-wrap">
          <table className="st-table">
            <thead>
              <tr>
                <th scope="col">Post</th>
                <th scope="col">Publicado</th>
                {["Alcance", "Views", "Curtidas", "Coment.", "Salv.", "Compart.", "Índice"].map((h) => (
                  <th key={h} scope="col" style={{ textAlign: "right" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <th scope="row">
                    <Link href={`/studio/social/${slug}/post/${r.id}`}>{r.theme ?? "—"}</Link>
                    <div className="st-hint">
                      {formatLabel(r.format)} · {typeLabel(r.post_type)}
                      {r.permalink && (
                        <>
                          {" · "}
                          <a href={r.permalink} target="_blank" rel="noreferrer">
                            abrir
                          </a>
                        </>
                      )}
                    </div>
                  </th>
                  <td>{dateTimeBR(r.published_at)}</td>
                  {(["reach", "views", "likes", "comments", "saves", "shares"] as const).map((k) => (
                    <td key={k} className="st-num">
                      {r.m?.[k] ?? "—"}
                    </td>
                  ))}
                  <td className="st-num">{score(r.m) >= 0 ? pct(score(r.m)) : "—"}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={9}>Nada publicado ainda.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="st-hint">Métricas coletadas 24 h, 72 h e 7 dias depois de publicar, e depois toda semana até 30 dias.</p>
      </article>
    </>
  );
}
