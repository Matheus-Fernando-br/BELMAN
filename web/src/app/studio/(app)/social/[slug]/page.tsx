import type { Metadata } from "next";
import Link from "next/link";
import { BUSY, dateTimeBR, formatLabel, statusLabel, statusTone } from "@/lib/social/labels";
import { loadAccount, requireWorkspace, signedUrls } from "@/lib/social/server";
import { createClient } from "@/lib/supabase/server";
import { createPost } from "../actions";
import { AutoRefresh, StateForm } from "../ui";

export const metadata: Metadata = { title: "Posts · Redes Sociais" };

const FILTERS = [
  ["revisar", "Para revisar", ["review", "failed", "generating", "rendering", "draft"]],
  ["agendados", "Agendados", ["approved", "scheduled", "publishing"]],
  ["publicados", "Publicados", ["published"]],
] as const;

export default async function PostsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ver?: string; dia?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { ctx, entity } = await requireWorkspace(slug);
  const supabase = await createClient();
  const [acc, { data: all }, { data: aiKey }, { data: rules }] = await Promise.all([
    loadAccount(entity.id),
    supabase.from("social_posts").select("id,format,theme,status,scheduled_at,published_at,error,created_at,permalink").eq("entity_id", entity.id).neq("status", "rejected").order("created_at", { ascending: false }).limit(150),
    supabase.rpc("social_secret_status"),
    supabase.from("content_rules").select("auto_generate").eq("entity_id", entity.id).eq("active", true).limit(1),
  ]);
  const posts = all ?? [];
  const filter = FILTERS.find(([k]) => k === sp.ver) ?? FILTERS[0];
  const list = posts.filter((p) => (filter[2] as readonly string[]).includes(p.status));
  if (filter[0] === "agendados") list.sort((a, b) => (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? ""));
  const ids = list.map((p) => p.id);
  const [{ data: thumbs }, { data: metrics }] = await Promise.all([
    ids.length ? supabase.from("social_assets").select("post_id,storage_path").in("post_id", ids).eq("kind", "preview").eq("idx", 0) : Promise.resolve({ data: [] as { post_id: string; storage_path: string }[] }),
    filter[0] === "publicados" && ids.length ? supabase.from("social_metrics").select("post_id,reach,likes,saves,collected_at").in("post_id", ids).order("collected_at", { ascending: false }) : Promise.resolve({ data: [] as { post_id: string; reach: number | null; likes: number | null; saves: number | null }[] }),
  ]);
  const thumbOf = new Map((thumbs ?? []).map((t) => [t.post_id, t.storage_path]));
  const urls = await signedUrls([...thumbOf.values()]);
  const metricOf = new Map<string, { reach: number | null; likes: number | null; saves: number | null }>();
  for (const m of metrics ?? []) if (!metricOf.has(m.post_id)) metricOf.set(m.post_id, m);
  const hasKey = ((aiKey ?? []) as { name: string }[]).some((s) => s.name === "anthropic_api_key");
  const writer = hasKey ? "O post fica pronto em cerca de 1 minuto." : "O Claude do seu plano escreve o texto em até 1 hora (das 7h às 23h), sem custo por post.";
  const connected = acc && acc.status !== "disconnected";
  const automatic = Boolean(rules?.[0]?.auto_generate);
  const busy = posts.some((p) => BUSY.includes(p.status) && p.status !== "draft");
  const b = `/studio/social/${slug}`;

  return (
    <>
      <AutoRefresh active={busy} />
      {!connected && (
        <article className="st-card" style={{ marginTop: "1rem" }}>
          <h2>Falta pouco para começar</h2>
          <ol style={{ margin: 0, paddingLeft: "1.2rem", lineHeight: 1.9 }}>
            <li>
              {connected ? "✓ Instagram conectado" : <Link href={`${b}/conexao`}>Colar o token do Instagram</Link>}
            </li>
            <li>
              {automatic ? "✓ Automático ligado" : <Link href={`${b}/automatico`}>Escolher dias e horário do automático</Link>} <span className="st-hint">(opcional)</span>
            </li>
          </ol>
        </article>
      )}

      {ctx.canWrite && (
        <details className="st-card" style={{ marginTop: "1rem" }} open={Boolean(sp.dia) || !posts.length}>
          <summary style={{ cursor: "pointer", fontWeight: 700 }}>+ Criar um post agora</summary>
          <div style={{ marginTop: "1rem" }}>
            <StateForm action={createPost.bind(null, slug)} submit="Criar post" pending="Criando…">
              <p className="st-hint" style={{ margin: 0 }}>{writer}</p>
              <div className="st-field">
                <label htmlFor="theme">Sobre o que? (opcional)</label>
                <input id="theme" name="theme" className="st-input" placeholder="Deixe em branco e a IA escolhe um tema" />
              </div>
              <div className="st-row">
                <fieldset className="st-field" style={{ border: 0, padding: 0, margin: 0 }}>
                  <legend>Tipo</legend>
                  <div className="st-actions">
                    <label className="st-check">
                      <input type="radio" name="format" value="carousel" defaultChecked /> Carrossel
                    </label>
                    <label className="st-check">
                      <input type="radio" name="format" value="post" /> Imagem única
                    </label>
                  </div>
                </fieldset>
<div className="st-field">
                  <label htmlFor="images">Imagens no carrossel</label>
                  <select id="images" name="images" className="st-input" defaultValue="">
                    <option value="">A IA decide (9 a 11)</option>
                    <option value="4">4</option>
                    <option value="5">5</option>
                    <option value="6">6</option>
                    <option value="7">7</option>
                    <option value="8">8</option>
                    <option value="10">10</option>
                  </select>
                </div>
                <div className="st-field">
                  <label htmlFor="date">Publicar em (opcional, você confirma depois)</label>
                  <div className="st-actions">
                    <input id="date" name="date" type="date" defaultValue={sp.dia ?? ""} className="st-input" style={{ width: "auto" }} />
                    <input name="time" type="time" defaultValue="19:00" className="st-input" style={{ width: "auto" }} aria-label="Hora" />
                  </div>
                </div>
              </div>
            </StateForm>
          </div>
        </details>
      )}

      <nav className="st-actions" aria-label="Filtro" style={{ margin: "1.25rem 0 1rem" }}>
        {FILTERS.map(([k, l, st]) => (
          <Link key={k} href={`?ver=${k}`} className="st-tag" aria-current={k === filter[0] ? "true" : undefined}>
            {l} · {posts.filter((p) => (st as readonly string[]).includes(p.status)).length}
          </Link>
        ))}
      </nav>

      <div className="st-grid" data-cols="3">
        {list.map((p) => {
          const src = thumbOf.get(p.id);
          const m = metricOf.get(p.id);
          return (
            <Link key={p.id} href={`${b}/post/${p.id}`} className="st-card" style={{ textDecoration: "none", color: "inherit" }}>
              <div style={{ aspectRatio: "4 / 5", background: "#111", borderRadius: 8, overflow: "hidden", display: "grid", placeItems: "center" }}>
                {src && urls.get(src) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={urls.get(src)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span style={{ color: "#bbb", fontSize: 13 }}>{p.status === "draft" ? "Na fila do Claude" : BUSY.includes(p.status) ? "Preparando…" : "Sem imagem"}</span>
                )}
              </div>
              <div className="st-actions" style={{ gap: "0.4rem" }}>
                <span className="st-status" data-tone={statusTone(p.status)}>
                  {statusLabel(p.status)}
                </span>
                <span className="st-tag">{formatLabel(p.format)}</span>
              </div>
              <strong>{p.theme ?? "A IA está escolhendo o tema…"}</strong>
              <span className="st-hint">
                {p.status === "published" ? `Publicado ${dateTimeBR(p.published_at)}` : p.scheduled_at ? `Para ${dateTimeBR(p.scheduled_at)}` : "Sem data"}
                {m ? ` · ${m.reach ?? 0} alcance · ${m.likes ?? 0} curtidas · ${m.saves ?? 0} salvos` : ""}
              </span>
              {p.status === "failed" && p.error && <span className="st-status" data-tone="bad">{p.error.slice(0, 120)}</span>}
            </Link>
          );
        })}
        {!list.length && <p className="st-hint">Nada aqui por enquanto.</p>}
      </div>
    </>
  );
}
