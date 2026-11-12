import type { Metadata } from "next";
import Link from "next/link";
import { FORMATS, POST_TYPES } from "@/lib/social/labels";
import { requireWorkspace } from "@/lib/social/server";
import { createClient } from "@/lib/supabase/server";
import { createPost } from "../../actions";
import { StateForm } from "../../ui";

export const metadata: Metadata = { title: "Criar · Redes Sociais" };

export default async function CreatePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ dia?: string }> }) {
  const { slug } = await params;
  const { dia } = await searchParams;
  const { ctx, entity } = await requireWorkspace(slug);
  const supabase = await createClient();
  const [{ data: templates }, { data: brand }, { data: recent }] = await Promise.all([
    supabase.from("social_templates").select("key,name,format,is_default").eq("entity_id", entity.id).eq("active", true).order("format"),
    supabase.from("brand_profiles").select("entity_id,ai_model").eq("entity_id", entity.id).maybeSingle(),
    supabase.from("social_posts").select("theme").eq("entity_id", entity.id).not("theme", "is", null).order("created_at", { ascending: false }).limit(10),
  ]);
  if (!ctx.canWrite) return <p className="st-restricted">Seu acesso é somente leitura.</p>;
  if (!brand)
    return (
      <p className="st-banner">
        Configure o <Link href={`/studio/social/${slug}/marca`}>perfil de marca</Link> antes de gerar posts.
      </p>
    );
  return (
    <div className="st-grid" data-cols="2-1">
      <article className="st-card">
        <h2>Tema → post</h2>
        <StateForm action={createPost.bind(null, slug)} submit="Gerar" pending="Enviando para a fila…">
          <div className="st-field">
            <label htmlFor="theme">Tema</label>
            <textarea id="theme" name="theme" rows={3} className="st-input" placeholder="ex.: como calcular o BDI de uma reforma de banheiro" required />
            {dia && <span className="st-hint">Depois de gerar, aprove escolhendo o dia {dia.split("-").reverse().join("/")}.</span>}
          </div>
          <div className="st-row">
            <div className="st-field">
              <label htmlFor="format">Formato</label>
              <select id="format" name="format" className="st-input" defaultValue="auto">
                <option value="auto">Automático</option>
                {FORMATS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="st-field">
              <label htmlFor="post_type">Tipo (opcional)</label>
              <select id="post_type" name="post_type" className="st-input" defaultValue="">
                <option value="">Automático</option>
                {POST_TYPES.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="st-field">
            <label htmlFor="template_key">Template</label>
            <select id="template_key" name="template_key" className="st-input" defaultValue="">
              <option value="">Padrão do formato</option>
              {(templates ?? []).map((t) => (
                <option key={t.key} value={t.key}>
                  {t.name} ({t.key})
                </option>
              ))}
            </select>
          </div>
          <ol className="st-progress" aria-label="Etapas">
            <li>Gerando texto</li>
            <li>Renderizando</li>
            <li>Pronto para revisão</li>
          </ol>
        </StateForm>
      </article>
      <aside className="st-grid">
        <article className="st-card">
          <h2>Como funciona</h2>
          <p className="st-hint">
            A IA ({brand.ai_model}) escreve só o texto, em formato estruturado e com as regras da marca. O lint local confere travessão, uma chamada para ação, hashtags, primeira linha e
            palavras proibidas; se algo falhar, há no máximo 1 correção. As artes e vídeos saem dos templates no worker, sem IA.
          </p>
        </article>
        {!!recent?.length && (
          <article className="st-card">
            <h2>Últimos temas</h2>
            <ul className="st-list">
              {recent.map((r, i) => (
                <li key={i}>{r.theme}</li>
              ))}
            </ul>
          </article>
        )}
      </aside>
    </div>
  );
}
