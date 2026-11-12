import type { Metadata } from "next";
import { requireWorkspace, signedUrls } from "@/lib/social/server";
import { createClient } from "@/lib/supabase/server";
import { profileUploadUrl, saveBrand, setLogo } from "../../actions";
import { StateForm, Uploader } from "../../ui";

export const metadata: Metadata = { title: "Marca · Redes Sociais" };

const MODELS = [
  ["claude-opus-5-5", "Claude Opus 5.5 (melhor texto · US$ 4 / 20 por milhão de tokens)"],
  ["claude-sonnet-5-5", "Claude Sonnet 5.5 (mais barato)"],
  ["claude-haiku-5-5", "Claude Haiku 5.5 (o mais barato)"],
];

export default async function BrandPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { ctx, entity } = await requireWorkspace(slug);
  const supabase = await createClient();
  const { data: b } = await supabase.from("brand_profiles").select("*").eq("entity_id", entity.id).maybeSingle();
  const logo = b?.logo_path ? (await signedUrls([b.logo_path])).get(b.logo_path) : null;
  const pal = (b?.palette ?? {}) as Record<string, string>;
  const ro = !ctx.canWrite;
  const lines = (a?: string[] | null) => (a ?? []).join("\n");
  return (
    <div className="st-grid" data-cols="2-1">
      <article className="st-card">
        <h2>Perfil de marca</h2>
        <p className="st-hint">É o que a IA lê antes de escrever e o que os templates usam para desenhar.</p>
        <fieldset disabled={ro} style={{ border: 0, padding: 0, margin: 0 }}>
          <StateForm action={saveBrand.bind(null, slug)} submit="Salvar marca">
            <div className="st-row">
              <div className="st-field">
                <label htmlFor="handle">@ da conta</label>
                <input id="handle" name="handle" className="st-input" defaultValue={b?.handle ?? ""} />
              </div>
              <div className="st-field">
                <label htmlFor="link_in_bio">Link da bio</label>
                <input id="link_in_bio" name="link_in_bio" className="st-input" defaultValue={b?.link_in_bio ?? ""} />
              </div>
            </div>
            <div className="st-field">
              <label htmlFor="voice">Voz (como soamos)</label>
              <textarea id="voice" name="voice" rows={5} className="st-input" defaultValue={b?.voice ?? ""} />
            </div>
            <div className="st-field">
              <label htmlFor="audience">Com quem falamos</label>
              <textarea id="audience" name="audience" rows={3} className="st-input" defaultValue={b?.audience ?? ""} />
            </div>
            <div className="st-row">
              <div className="st-field">
                <label htmlFor="positions">Posições (uma por linha)</label>
                <textarea id="positions" name="positions" rows={5} className="st-input" defaultValue={lines(b?.positions)} />
              </div>
              <div className="st-field">
                <label htmlFor="banned_words">Palavras proibidas (uma por linha)</label>
                <textarea id="banned_words" name="banned_words" rows={5} className="st-input" defaultValue={lines(b?.banned_words)} />
              </div>
            </div>
            <div className="st-row">
              <div className="st-field">
                <label htmlFor="hashtag_bank">Banco de hashtags (uma por linha)</label>
                <textarea id="hashtag_bank" name="hashtag_bank" rows={5} className="st-input" defaultValue={lines(b?.hashtag_bank)} />
              </div>
              <div className="st-form">
                <div className="st-field">
                  <label htmlFor="max_hashtags">Máximo de hashtags (regra da casa: até 5)</label>
                  <input id="max_hashtags" name="max_hashtags" type="number" min={0} max={5} className="st-input" defaultValue={b?.max_hashtags ?? 5} />
                </div>
                <div className="st-field">
                  <label htmlFor="emoji_policy">Emoji</label>
                  <input id="emoji_policy" name="emoji_policy" className="st-input" defaultValue={b?.emoji_policy ?? ""} />
                </div>
                <div className="st-field">
                  <label htmlFor="cta_default">Chamada padrão</label>
                  <input id="cta_default" name="cta_default" className="st-input" defaultValue={b?.cta_default ?? ""} />
                </div>
              </div>
            </div>
            <div className="st-field">
              <label htmlFor="extra_rules">Regras fixas</label>
              <textarea id="extra_rules" name="extra_rules" rows={4} className="st-input" defaultValue={b?.extra_rules ?? ""} />
            </div>
            <fieldset className="st-field" style={{ border: 0, padding: 0 }}>
              <legend>Paleta</legend>
              <div className="st-actions">
                {[
                  ["primary", "Principal", "#C2570C"],
                  ["accent", "Destaque", "#F08A3C"],
                  ["bg", "Fundo", "#141110"],
                  ["text", "Texto", "#FFFFFF"],
                ].map(([k, l, d]) => (
                  <label key={k} className="st-check">
                    <input type="color" name={k} className="st-input" defaultValue={pal[k] ?? d} /> {l}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="st-row">
              {(["heading", "body"] as const).map((k) => (
                <div key={k} className="st-field">
                  <label htmlFor={`font_${k}`}>Fonte {k === "heading" ? "dos títulos" : "do texto"}</label>
                  <select id={`font_${k}`} name={`font_${k}`} className="st-input" defaultValue={(b?.fonts as Record<string, string> | undefined)?.[k] ?? "Inter"}>
                    <option>Inter</option>
                    <option>Manrope</option>
                  </select>
                </div>
              ))}
            </div>
            <div className="st-field">
              <label htmlFor="ai_model">Modelo de IA (custo é decisão do Sócio/Admin)</label>
              <select id="ai_model" name="ai_model" className="st-input" defaultValue={b?.ai_model ?? "claude-opus-5-5"} disabled={!ctx.isAdmin}>
                {MODELS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          </StateForm>
        </fieldset>
      </article>
      <aside className="st-card">
        <h2>Logo</h2>
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt={`Logo ${entity.name}`} style={{ width: 96, height: 96, objectFit: "contain", background: pal.bg ?? "#000", borderRadius: 12, padding: 8 }} />
        ) : (
          <p className="st-hint">Sem logo. Os templates usam só o @.</p>
        )}
        {ctx.canWrite && b && (
          <Uploader accept="image/png,image/jpeg" label="Enviar logo (PNG com fundo transparente)" maxMb={4} getUrl={profileUploadUrl.bind(null, slug, "logo")} onUploaded={setLogo.bind(null, slug)} />
        )}
      </aside>
    </div>
  );
}
