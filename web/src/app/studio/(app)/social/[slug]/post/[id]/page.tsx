import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BUSY, dateTimeBR, formatLabel, statusLabel, statusTone } from "@/lib/social/labels";
import { loadAccount, requireWorkspace, signedUrls } from "@/lib/social/server";
import { createClient } from "@/lib/supabase/server";
import { SubmitButton } from "@/components/studio/SubmitButton";
import { approvePost, deletePost, editPost, redoPost, retryPost, setStatus } from "../../../actions";
import { AutoRefresh, FeedPreview, StateForm } from "../../../ui";
import { CopyEditor } from "./CopyEditor";

export const metadata: Metadata = { title: "Post · Redes Sociais" };

export default async function PostPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { ctx, entity } = await requireWorkspace(slug);
  const supabase = await createClient();
  const { data: post } = await supabase.from("social_posts").select("*").eq("id", id).eq("entity_id", entity.id).maybeSingle();
  if (!post) notFound();
  const [{ data: assets }, { data: metrics }, acc] = await Promise.all([
    supabase.from("social_assets").select("kind,idx,storage_path").eq("post_id", id).eq("kind", "image").order("idx"),
    supabase.from("social_metrics").select("*").eq("post_id", id).order("collected_at", { ascending: false }).limit(1),
    loadAccount(entity.id),
  ]);
  const urls = await signedUrls((assets ?? []).map((a) => a.storage_path), 900);
  const images = (assets ?? []).map((a) => urls.get(a.storage_path) ?? "").filter(Boolean);
  const busy = BUSY.includes(post.status);
  const editable = ctx.canWrite && !busy && !["published"].includes(post.status);
  const scheduled = ["approved", "scheduled"].includes(post.status);
  const sched = post.scheduled_at ? new Date(post.scheduled_at) : null;
  const local = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo", ...o });
  const today = local(new Date(), { year: "numeric", month: "2-digit", day: "2-digit" });
  const defDate = sched ? local(sched, { year: "numeric", month: "2-digit", day: "2-digit" }) : today;
  const defTime = sched ? local(sched, { hour: "2-digit", minute: "2-digit" }) : "19:00";
  const m = metrics?.[0];
  const imageCopy = post.copy?.carousel || post.copy?.post ? { ...(post.copy.carousel ? { carousel: post.copy.carousel } : {}), ...(post.copy.post ? { post: post.copy.post } : {}) } : null;

  return (
    <>
      <AutoRefresh active={busy} />
      <div className="st-actions" style={{ margin: "1rem 0" }}>
        <Link href={`/studio/social/${slug}`}>← Posts</Link>
        <span className="st-status" data-tone={statusTone(post.status)}>
          {statusLabel(post.status)}
        </span>
        <span className="st-tag">{formatLabel(post.format)}</span>
        {sched && post.status !== "published" && <span className="st-tag">Para {dateTimeBR(post.scheduled_at)}</span>}
        {post.permalink && (
          <a href={post.permalink} target="_blank" rel="noreferrer" className="st-btn">
            Ver no Instagram
          </a>
        )}
      </div>

      {busy && (
        <p className="st-banner" data-tone="info">
          {post.status === "generating" ? "A IA está escrevendo o post…" : post.status === "rendering" ? "Desenhando as imagens…" : "Publicando no Instagram…"} Esta página atualiza
          sozinha.
        </p>
      )}
      {post.status === "failed" && (
        <div className="st-alert" role="alert">
          <p style={{ margin: "0 0 0.5rem" }}>{post.error ?? "Algo deu errado."}</p>
          {ctx.canWrite && (
            <form action={retryPost.bind(null, slug, id)}>
              <SubmitButton variant="ghost">Tentar de novo</SubmitButton>
            </form>
          )}
        </div>
      )}

      <div className="st-grid" data-cols="2">
        <section>
          <FeedPreview
            images={images}
            username={acc?.username ?? entity.name}
            avatar={acc?.profile_picture_url}
            caption={post.hashtags.length ? `${post.caption}\n\n${post.hashtags.join(" ")}` : post.caption}
          />
          {m && (
            <p className="st-hint">
              Alcance {m.reach ?? 0} · curtidas {m.likes ?? 0} · comentários {m.comments ?? 0} · salvos {m.saves ?? 0} · compartilhamentos {m.shares ?? 0} (em {dateTimeBR(m.collected_at)})
            </p>
          )}
        </section>

        <section className="st-grid">
          {ctx.canWrite && ["review", "failed", "approved", "scheduled"].includes(post.status) && images.length > 0 && (
            <article className="st-card">
              <h2>{scheduled ? "Agendado" : "Aprovar e agendar"}</h2>
              <StateForm action={approvePost.bind(null, slug, id)} submit={scheduled ? "Mudar data" : "Aprovar"} pending="Salvando…">
                <label className="st-check">
                  <input type="radio" name="when" value="date" defaultChecked /> Em
                  <input type="date" name="date" min={today} defaultValue={defDate} className="st-input" style={{ width: "auto" }} aria-label="Data" />
                  <input type="time" name="time" defaultValue={defTime} className="st-input" style={{ width: "auto" }} aria-label="Hora" />
                </label>
                <label className="st-check">
                  <input type="radio" name="when" value="next" /> No próximo horário do Automático
                </label>
                <label className="st-check">
                  <input type="radio" name="when" value="now" /> Agora
                </label>
              </StateForm>
              {scheduled && (
                <form action={setStatus.bind(null, slug, id)}>
                  <input type="hidden" name="to" value="review" />
                  <SubmitButton variant="ghost">Cancelar agendamento</SubmitButton>
                </form>
              )}
            </article>
          )}

          {editable && (
            <article className="st-card">
              <h2>Editar</h2>
              <StateForm action={editPost.bind(null, slug, id)} submit="Salvar" pending="Salvando…">
                <div className="st-field">
                  <label htmlFor="caption">Legenda</label>
                  <textarea id="caption" name="caption" rows={9} className="st-input" defaultValue={post.caption} />
                </div>
                <div className="st-field">
                  <label htmlFor="hashtags">Hashtags (até 5)</label>
                  <input id="hashtags" name="hashtags" className="st-input" defaultValue={post.hashtags.join(" ")} />
                </div>
                {imageCopy && (
                  <details>
                    <summary style={{ cursor: "pointer", fontWeight: 600 }}>Textos das imagens</summary>
                    <div className="st-form" style={{ marginTop: "0.75rem" }}>
                      <CopyEditor initial={imageCopy} full={post.copy} />
                    </div>
                  </details>
                )}
              </StateForm>
            </article>
          )}

          {editable && (
            <details className="st-card">
              <summary style={{ cursor: "pointer", fontWeight: 700 }}>Pedir para a IA refazer</summary>
              <div style={{ marginTop: "0.75rem" }}>
                <StateForm action={redoPost.bind(null, slug, id)} submit="Refazer" pending="Enviando…">
                  <div className="st-field">
                    <label htmlFor="instruction">O que mudar?</label>
                    <textarea id="instruction" name="instruction" rows={3} className="st-input" placeholder="ex.: gancho mais forte, exemplo com reforma de banheiro" />
                  </div>
                </StateForm>
              </div>
            </details>
          )}

          {ctx.canWrite && (
            <div className="st-actions">
              {images.length > 0 && (
                <a className="st-btn" data-variant="ghost" href={`/studio/social/${slug}/post/${id}/pacote`}>
                  Baixar imagens e legenda
                </a>
              )}
              {!["publishing", "published"].includes(post.status) && (
                <form action={deletePost.bind(null, slug, id)}>
                  <SubmitButton variant="danger" pendingLabel="Excluindo…">
                    Excluir post
                  </SubmitButton>
                </form>
              )}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
