import type { Metadata } from "next";
import { WEEKDAYS } from "@/lib/social/labels";
import { requireWorkspace } from "@/lib/social/server";
import { createClient } from "@/lib/supabase/server";
import { saveAutomation, saveBrand } from "../../actions";
import { StateForm } from "../../ui";

export const metadata: Metadata = { title: "Automático · Redes Sociais" };

export default async function AutomationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { ctx, entity } = await requireWorkspace(slug);
  const supabase = await createClient();
  const [{ data: rules }, { data: b }] = await Promise.all([
    supabase.from("content_rules").select("*").eq("entity_id", entity.id).eq("active", true),
    supabase.from("brand_profiles").select("*").eq("entity_id", entity.id).maybeSingle(),
  ]);
  const R = rules ?? [];
  const on = R.some((r) => r.auto_generate);
  const days = new Set(R.map((r) => r.weekday));
  const time = R[0]?.local_time?.slice(0, 5) ?? "19:00";
  const format = R[0]?.format ?? "carousel";
  const review = R.length ? R.every((r) => r.require_review) : true;
  const lead = R[0]?.lead_days ?? 2;
  const images = R[0]?.images ?? "";
  const pal = (b?.palette ?? {}) as Record<string, string>;
  const lines = (a?: string[] | null) => (a ?? []).join("\n");
  return (
    <fieldset disabled={!ctx.canWrite} style={{ border: 0, padding: 0, margin: "1rem 0 0" }}>
      <div className="st-grid" data-cols="2-1">
        <article className="st-card">
          <h2>Postar automaticamente</h2>
          <StateForm action={saveAutomation.bind(null, slug)} submit="Salvar" pending="Salvando…">
            <label className="st-check" style={{ fontSize: "1rem", fontWeight: 700 }}>
              <input type="checkbox" name="on" defaultChecked={on} /> Ligado
            </label>
            <fieldset className="st-field" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend>Dias</legend>
              <div className="st-actions">
                {WEEKDAYS.map((d, i) => (
                  <label key={d} className="st-check">
                    <input type="checkbox" name="weekday" value={i} defaultChecked={days.has(i)} /> {d.slice(0, 3)}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="st-row">
              <div className="st-field">
                <label htmlFor="time">Horário</label>
                <input id="time" name="time" type="time" defaultValue={time} className="st-input" />
              </div>
              <div className="st-field">
                <label htmlFor="format">Tipo de post</label>
                <select id="format" name="format" defaultValue={format} className="st-input">
                  <option value="carousel">Carrossel</option>
                  <option value="post">Imagem única</option>
                </select>
              </div>
            </div>
<div className="st-field" style={{ maxWidth: 260 }}>
                  <label htmlFor="images">Imagens no carrossel</label>
                  <select id="images" name="images" className="st-input" defaultValue={String(images)}>
                    <option value="">A IA decide (9 a 11)</option>
                    <option value="4">4</option>
                    <option value="5">5</option>
                    <option value="6">6</option>
                    <option value="7">7</option>
                    <option value="8">8</option>
                    <option value="10">10</option>
                  </select>
                </div>
            <fieldset className="st-field" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend>Antes de publicar</legend>
              <label className="st-check">
                <input type="radio" name="review" value="on" defaultChecked={review} /> Eu reviso e aprovo cada post (recomendado)
              </label>
              <label className="st-check">
                <input type="radio" name="review" value="off" defaultChecked={!review} /> Publicar sozinho, sem minha revisão
              </label>
            </fieldset>
            <div className="st-field" style={{ maxWidth: 260 }}>
              <label htmlFor="lead_days">Criar o post com quantos dias de antecedência</label>
              <input id="lead_days" name="lead_days" type="number" min={1} max={7} defaultValue={lead} className="st-input" />
            </div>
          </StateForm>
        </article>
        <aside className="st-card">
          <h2>Como funciona</h2>
          <ol className="st-hint" style={{ paddingLeft: "1.1rem", lineHeight: 1.7, margin: 0 }}>
            <li>Nos dias escolhidos, a IA escolhe um tema novo e escreve o post.</li>
            <li>As imagens saem com as cores e o @ da marca.</li>
            <li>O post aparece em Posts → Para revisar. Você pode mudar a legenda, os textos das imagens e a data.</li>
            <li>Aprovado, ele é publicado sozinho no horário.</li>
          </ol>
        </aside>
      </div>

      <details className="st-card" style={{ marginTop: "1rem" }}>
        <summary style={{ cursor: "pointer", fontWeight: 700 }}>Estilo da marca (o que a IA segue)</summary>
        <div style={{ marginTop: "1rem" }}>
          <StateForm action={saveBrand.bind(null, slug)} submit="Salvar estilo" pending="Salvando…">
            <div className="st-row">
              <div className="st-field">
                <label htmlFor="handle">@ da conta</label>
                <input id="handle" name="handle" className="st-input" defaultValue={b?.handle ?? ""} />
              </div>
              <div className="st-field">
                <label htmlFor="cta_default">Chamada para ação</label>
                <input id="cta_default" name="cta_default" className="st-input" defaultValue={b?.cta_default ?? ""} />
              </div>
            </div>
            <div className="st-field">
              <label htmlFor="voice">Como a marca fala</label>
              <textarea id="voice" name="voice" rows={4} className="st-input" defaultValue={b?.voice ?? ""} />
            </div>
            <div className="st-field">
              <label htmlFor="audience">Para quem</label>
              <textarea id="audience" name="audience" rows={3} className="st-input" defaultValue={b?.audience ?? ""} />
            </div>
            <div className="st-row">
              <div className="st-field">
                <label htmlFor="banned_words">Palavras proibidas (uma por linha)</label>
                <textarea id="banned_words" name="banned_words" rows={4} className="st-input" defaultValue={lines(b?.banned_words)} />
              </div>
              <div className="st-field">
                <label htmlFor="hashtag_bank">Hashtags que usamos (uma por linha)</label>
                <textarea id="hashtag_bank" name="hashtag_bank" rows={4} className="st-input" defaultValue={lines(b?.hashtag_bank)} />
              </div>
            </div>
            <div className="st-field">
              <label htmlFor="extra_rules">Regras fixas</label>
              <textarea id="extra_rules" name="extra_rules" rows={3} className="st-input" defaultValue={b?.extra_rules ?? ""} />
            </div>
            <div className="st-actions">
              {[
                ["primary", "Cor principal", "#C2570C"],
                ["accent", "Cor de destaque", "#F08A3C"],
                ["bg", "Fundo escuro", "#141110"],
              ].map(([k, l, d]) => (
                <label key={k} className="st-check">
                  <input type="color" name={k} className="st-input" defaultValue={pal[k] ?? d} /> {l}
                </label>
              ))}
            </div>
          </StateForm>
        </div>
      </details>
    </fieldset>
  );
}
