import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { lintCaption } from "@shared/social/lint";
import { BUSY, dateTimeBR, formatLabel, statusLabel, statusTone, typeLabel } from "@/lib/social/labels";
import { loadAccount, requireWorkspace, signedUrls } from "@/lib/social/server";
import { createClient } from "@/lib/supabase/server";
import { SubmitButton } from "@/components/studio/SubmitButton";
import { approvePost, changeTemplate, deletePost, editPost, redoPost, setStatus } from "../../../actions";
import { AutoRefresh, CopyButton, FeedPreview, StateForm } from "../../../ui";
import { CopyEditor } from "./CopyEditor";
import { VideoUpload } from "./VideoUpload";

export const metadata: Metadata = { title: "Post · Redes Sociais" };

const STEPS = [
  ["generating", "Gerando texto"],
  ["rendering", "Renderizando"],
  ["review", "Pronto para revisão"],
] as const;

export default async function PostPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { ctx, entity } = await requireWorkspace(slug);
  const supabase = await createClient();
  const { data: post } = await supabase.from("social_posts").select("*").eq("id", id).eq("entity_id", entity.id).maybeSingle();
  if (!post) notFound();
  const [{ data: assets }, { data: brand }, { data: templates }, { data: jobs }, { data: metrics }, acc] = await Promise.all([
    supabase.from("social_assets").select("*").eq("post_id", id).order("idx"),
    supabase.from("brand_profiles").select("max_hashtags,banned_words").eq("entity_id", entity.id).maybeSingle(),
    supabase.from("social_templates").select("key,name,format").eq("entity_id", entity.id).eq("active", true),
    supabase.from("social_jobs").select("kind,status,attempts,last_error,updated_at").eq("post_id", id).order("created_at", { ascending: false }).limit(8),
    supabase.from("social_metrics").select("*").eq("post_id", id).order("collected_at", { ascending: false }).limit(1),
    loadAccount(entity.id),
  ]);
  const A = assets ?? [];
  const images = A.filter((a) => a.kind === "image");
  const video = A.find((a) => a.kind === "video");
  const cover = A.find((a) => a.kind === "cover");
  const urls = await signedUrls(A.map((a) => a.storage_path), 900);
  const busy = BUSY.includes(post.status);
  const issues = post.caption ? lintCaption(post.caption, post.hashtags, { maxHashtags: brand?.max_hashtags ?? 5, bannedWords: brand?.banned_words ?? [] }) : [];
  const stepIdx = STEPS.findIndex(([s]) => s === post.status);
  const editable = ctx.canWrite && !["publishing", "published"].includes(post.status);
  const yt = post.copy?.youtube as { title?: string; description?: string; tags?: string[]; chapters?: { time: string; label: string }[] } | undefined;
  const m = metrics?.[0];
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

  return (
    <>
      <AutoRefresh active={busy} />
      <div className="st-actions" style={{ margin: "1rem 0" }}>
        <Link href={`/studio/social/${slug}/revisao`}>← Revisão</Link>
        <span className="st-status" data-tone={statusTone(post.status)}>
          {statusLabel(post.status)}
        </span>
        <span className="st-tag">{formatLabel(post.format)}</span>
        <span className="st-tag">{typeLabel(post.post_type)}</span>
        {post.template_key && <span className="st-tag">{post.template_key}</span>}
        <span className="st-hint">revisão {post.revision}</span>
        {post.scheduled_at && <span className="st-tag">Agendado: {dateTimeBR(post.scheduled_at)}</span>}
        {post.permalink && (
          <a href={post.permalink} target="_blank" rel="noreferrer" className="st-btn">
            Ver no Instagram
          </a>
        )}
      </div>
      {(busy || post.status === "draft") && (
        <ol className="st-progress" aria-label="Progresso">
          {STEPS.map(([s, l], i) => (
            <li key={s} data-state={stepIdx > i || (post.status === "review" && i < 2) ? "done" : stepIdx === i ? "now" : undefined}>
              {l}
            </li>
          ))}
        </ol>
      )}
      {post.error && <p className="st-alert">{post.error}</p>}

      <div className="st-grid" data-cols="2-1">
        <section className="st-grid">
          <article className="st-card">
            <h2>{post.theme}</h2>
            <div className="st-actions" style={{ alignItems: "flex-start", gap: "1.5rem" }}>
              <FeedPreview
                images={images.map((a) => urls.get(a.storage_path) ?? "").filter(Boolean)}
                video={video ? urls.get(video.storage_path) : null}
                username={acc?.username ?? entity.name}
                avatar={acc?.profile_picture_url}
                caption={post.hashtags.length ? `${post.caption}\n\n${post.hashtags.join(" ")}` : post.caption}
              />
              {cover && (
                <div>
                  <p className="st-hint">Capa do vídeo</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={urls.get(cover.storage_path)} alt="Capa" style={{ width: 140, borderRadius: 8 }} />
                </div>
              )}
            </div>
            {issues.length > 0 && (
              <ul className="st-list" aria-label="Lint da legenda">
                {issues.map((i) => (
                  <li key={i.code}>
                    <span className="st-status" data-tone={i.level === "error" ? "bad" : "warn"}>
                      {i.level === "error" ? "Corrigir" : "Atenção"}
                    </span>
                    <span className="st-grow">{i.message}</span>
                  </li>
                ))}
              </ul>
            )}
            {post.alt_texts?.length > 0 && <p className="st-hint">Texto alternativo: {post.alt_texts.join(" · ")}</p>}
          </article>

          {yt && (
            <article className="st-card">
              <h2>YouTube</h2>
              <ul className="st-list">
                <li>
                  <span className="st-grow">
                    <b>Título:</b> {yt.title}
                  </span>
                  <CopyButton text={yt.title ?? ""} />
                </li>
                <li>
                  <span className="st-grow" style={{ whiteSpace: "pre-wrap" }}>
                    <b>Descrição:</b> {yt.description}
                    {yt.chapters?.length ? `\n\n${yt.chapters.map((c) => `${c.time} ${c.label}`).join("\n")}` : ""}
                  </span>
                  <CopyButton text={`${yt.description ?? ""}${yt.chapters?.length ? `\n\n${yt.chapters.map((c) => `${c.time} ${c.label}`).join("\n")}` : ""}`} />
                </li>
                <li>
                  <span className="st-grow">
                    <b>Tags:</b> {(yt.tags ?? []).join(", ")}
                  </span>
                  <CopyButton text={(yt.tags ?? []).join(", ")} />
                </li>
              </ul>
              <p className="st-hint">A publicação no YouTube é manual por enquanto: baixe o pacote (vídeo, miniatura e textos) e envie pelo YouTube Studio.</p>
            </article>
          )}

          {editable && (
            <article className="st-card">
              <h2>Editar texto</h2>
              <p className="st-hint">Salvar re-renderiza as artes sem chamar a IA.</p>
              <StateForm action={editPost.bind(null, slug, id)} submit="Salvar e re-renderizar" pending="Salvando…">
                <div className="st-field">
                  <label htmlFor="caption">Legenda</label>
                  <textarea id="caption" name="caption" rows={8} className="st-input" defaultValue={post.caption} />
                </div>
                <div className="st-field">
                  <label htmlFor="hashtags">Hashtags (até {brand?.max_hashtags ?? 5})</label>
                  <input id="hashtags" name="hashtags" className="st-input" defaultValue={post.hashtags.join(" ")} />
                </div>
                <div className="st-field">
                  <label htmlFor="alt">Texto alternativo (um por imagem, por linha)</label>
                  <textarea id="alt" name="alt_texts" rows={3} className="st-input" defaultValue={(post.alt_texts ?? []).join("\n")} />
                </div>
                {post.copy && Object.keys(post.copy).length > 0 && <CopyEditor initial={post.copy} />}
              </StateForm>
            </article>
          )}
        </section>

        <aside className="st-grid">
          {ctx.canWrite && ["review", "failed", "approved", "scheduled"].includes(post.status) && (
            <article className="st-card">
              <h2>{post.status === "scheduled" ? "Reagendar" : "Aprovar"}</h2>
              <StateForm action={approvePost.bind(null, slug, id)} submit={post.status === "scheduled" ? "Reagendar" : "Aprovar"} pending="Aprovando…">
                <fieldset className="st-field" style={{ border: 0, padding: 0 }}>
                  <legend>Quando publicar</legend>
                  <label className="st-check">
                    <input type="radio" name="when" value="next" defaultChecked /> Próximo horário livre das regras
                  </label>
                  <label className="st-check">
                    <input type="radio" name="when" value="date" /> Data e hora:
                  </label>
                  <div className="st-actions">
                    <input type="date" name="date" min={today} defaultValue={today} className="st-input" style={{ width: "auto" }} aria-label="Data" />
                    <input type="time" name="time" defaultValue="19:00" className="st-input" style={{ width: "auto" }} aria-label="Hora" />
                  </div>
                  <label className="st-check">
                    <input type="radio" name="when" value="now" /> Agora (em até 1 minuto)
                  </label>
                </fieldset>
                {issues.some((i) => i.level === "error") && <p className="st-alert">A legenda tem pendências do lint. Você pode aprovar mesmo assim, mas revise antes.</p>}
                {post.format.startsWith("youtube") && <p className="st-hint">YouTube: aprovar só marca o post como pronto; o envio é manual.</p>}
              </StateForm>
            </article>
          )}

          {ctx.canWrite && (
            <article className="st-card">
              <h2>Ações</h2>
              <div className="st-actions">
                <a className="st-btn" data-variant="ghost" href={`/studio/social/${slug}/post/${id}/pacote`}>
                  Baixar pacote (ZIP)
                </a>
                {["approved", "scheduled", "rejected", "failed"].includes(post.status) && (
                  <form action={setStatus.bind(null, slug, id)}>
                    <input type="hidden" name="to" value="review" />
                    <SubmitButton variant="ghost">Voltar para revisão</SubmitButton>
                  </form>
                )}
                {["review", "failed", "approved", "scheduled", "draft"].includes(post.status) && (
                  <form action={setStatus.bind(null, slug, id)}>
                    <input type="hidden" name="to" value="rejected" />
                    <SubmitButton variant="danger">Rejeitar</SubmitButton>
                  </form>
                )}
                {!["publishing", "published", "scheduled"].includes(post.status) && (
                  <form action={deletePost.bind(null, slug, id)}>
                    <SubmitButton variant="danger" pendingLabel="Excluindo…">
                      Excluir
                    </SubmitButton>
                  </form>
                )}
              </div>
            </article>
          )}

          {editable && (
            <article className="st-card">
              <h2>Refazer com instrução</h2>
              <StateForm action={redoPost.bind(null, slug, id)} submit="Refazer (1 chamada de IA)" pending="Enviando…">
                <div className="st-field">
                  <label htmlFor="instruction">O que mudar</label>
                  <textarea id="instruction" name="instruction" rows={3} className="st-input" placeholder="ex.: gancho mais forte, exemplo com reforma de cozinha" />
                </div>
              </StateForm>
            </article>
          )}

          {editable && (
            <article className="st-card">
              <h2>Trocar template</h2>
              <form action={changeTemplate.bind(null, slug, id)} className="st-form">
                <select name="template_key" className="st-input" defaultValue={post.template_key ?? ""} aria-label="Template">
                  <option value="">Padrão do formato</option>
                  {(templates ?? [])
                    .filter((t) => t.format === post.format || (post.format === "youtube_video" && t.format === "youtube_thumbnail"))
                    .map((t) => (
                      <option key={t.key} value={t.key}>
                        {t.name}
                      </option>
                    ))}
                </select>
                <SubmitButton variant="ghost" pendingLabel="Re-renderizando…">
                  Aplicar e re-renderizar
                </SubmitButton>
              </form>
            </article>
          )}

          {editable && ["reel", "story", "youtube_video"].includes(post.format) && (
            <article className="st-card">
              <h2>Usar vídeo gravado</h2>
              <p className="st-hint">
                Opcional: envie um MP4 (gravação de tela ou câmera). O worker normaliza para H.264/AAC, 30 fps e, se marcar, gera legendas da fala. Sem vídeo, o Reels é animado a partir do
                roteiro.
              </p>
              <VideoUpload slug={slug} id={id} />
            </article>
          )}

          {m && (
            <article className="st-card">
              <h2>Métricas</h2>
              <ul className="st-list">
                {(
                  [
                    ["Alcance", m.reach],
                    ["Visualizações", m.views],
                    ["Curtidas", m.likes],
                    ["Comentários", m.comments],
                    ["Salvamentos", m.saves],
                    ["Compartilhamentos", m.shares],
                  ] as const
                ).map(([l, v]) => (
                  <li key={l}>
                    <span className="st-grow">{l}</span>
                    <strong>{v ?? "—"}</strong>
                  </li>
                ))}
              </ul>
              <p className="st-hint">Coletado em {dateTimeBR(m.collected_at)}</p>
            </article>
          )}

          <article className="st-card">
            <h2>Trabalhos do worker</h2>
            <ul className="st-list">
              {(jobs ?? []).map((j, i) => (
                <li key={i}>
                  <span className="st-grow">
                    {j.kind} · tentativa {j.attempts}
                    {j.last_error ? ` · ${j.last_error.slice(0, 140)}` : ""}
                  </span>
                  <span className="st-status" data-tone={j.status === "done" ? "ok" : j.status === "failed" ? "bad" : "warn"}>
                    {j.status}
                  </span>
                </li>
              ))}
              {!jobs?.length && <li className="st-hint">Nenhum.</li>}
            </ul>
          </article>
        </aside>
      </div>
    </>
  );
}
