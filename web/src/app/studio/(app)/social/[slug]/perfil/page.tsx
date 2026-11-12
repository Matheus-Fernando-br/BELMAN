import type { Metadata } from "next";
import QRCode from "qrcode";
import { dateTimeBR } from "@/lib/social/labels";
import { loadAccount, requireWorkspace, signedUrls } from "@/lib/social/server";
import { createClient } from "@/lib/supabase/server";
import { SubmitButton } from "@/components/studio/SubmitButton";
import { profileCheckNow, profileUploadUrl, saveProfileTarget, setProfilePhoto, suggestBio } from "../../actions";
import { CirclePreview, CopyButton, CountedText, StateForm, Uploader } from "../../ui";

export const metadata: Metadata = { title: "Perfil · Redes Sociais" };

const EDIT_URL = "https://www.instagram.com/accounts/edit/";

export default async function ProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { ctx, entity } = await requireWorkspace(slug);
  const supabase = await createClient();
  const [acc, { data: target }, { data: bioJob }] = await Promise.all([
    loadAccount(entity.id),
    supabase.from("profile_targets").select("*").eq("entity_id", entity.id).maybeSingle(),
    supabase.from("social_jobs").select("status,payload,updated_at,last_error").eq("entity_id", entity.id).eq("kind", "generate_copy").eq("payload->>purpose", "bio").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const photo = target?.desired_photo_path ? (await signedUrls([target.desired_photo_path])).get(target.desired_photo_path) : null;
  const qr = await QRCode.toString(EDIT_URL, { type: "svg", margin: 1, width: 132 });
  const suggestions = (bioJob?.payload?.result?.suggestions ?? []) as string[];
  const fields = [
    ["Nome", acc?.name, target?.desired_name],
    ["Bio", acc?.biography, target?.desired_biography],
    ["Site", acc?.website, target?.desired_website],
  ] as const;
  return (
    <div className="st-grid" data-cols="2-1">
      <section className="st-grid">
        <article className="st-card">
          <div className="st-card-head">
            <h2>Perfil atual (lido da API)</h2>
            <span className="st-status" data-tone={target?.status === "applied" ? "ok" : "warn"}>
              {target?.status === "applied" ? "Alvo aplicado" : "Alvo pendente"}
            </span>
          </div>
          {acc && acc.status !== "disconnected" ? (
            <div className="st-actions" style={{ alignItems: "flex-start", gap: "1rem" }}>
              {acc.profile_picture_url && <CirclePreview src={acc.profile_picture_url} />}
              <ul className="st-list" style={{ flex: 1, minWidth: 240 }}>
                <li>
                  <span className="st-grow">@</span>
                  <strong>{acc.username}</strong>
                </li>
                <li>
                  <span className="st-grow">Seguidores</span>
                  <strong>{acc.followers_count?.toLocaleString("pt-BR") ?? "—"}</strong>
                </li>
                <li>
                  <span className="st-grow">Posts</span>
                  <strong>{acc.media_count ?? "—"}</strong>
                </li>
                <li>
                  <span className="st-grow">Conferido em</span>
                  <span>{dateTimeBR(target?.checked_at ?? acc.last_checked_at)}</span>
                </li>
              </ul>
            </div>
          ) : (
            <p className="st-hint">Conecte o Instagram para ler o perfil.</p>
          )}
          <div className="st-table-wrap">
            <table className="st-table">
              <thead>
                <tr>
                  <th scope="col">Campo</th>
                  <th scope="col">Atual</th>
                  <th scope="col">Desejado</th>
                  <th scope="col" />
                </tr>
              </thead>
              <tbody>
                {fields.map(([name, now, want]) => (
                  <tr key={name}>
                    <th scope="row">{name}</th>
                    <td style={{ whiteSpace: "pre-wrap" }}>{now || "—"}</td>
                    <td style={{ whiteSpace: "pre-wrap" }}>
                      {want || "—"}
                      {want && now && want.trim() === now.trim() && (
                        <span className="st-status" data-tone="ok" style={{ marginLeft: 6 }}>
                          igual
                        </span>
                      )}
                    </td>
                    <td>{want && <CopyButton text={want} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="st-hint">
            A Graph API não permite alterar nome, bio, site nem foto de perfil. Copie os valores desejados, aplique no Instagram e o Studio confere sozinho a cada 6 horas.
          </p>
          <div className="st-actions">
            <a className="st-btn" href={EDIT_URL} target="_blank" rel="noreferrer">
              Abrir edição no Instagram
            </a>
            {ctx.canWrite && (
              <form action={profileCheckNow.bind(null, slug)}>
                <SubmitButton variant="ghost" pendingLabel="Pedindo…">
                  Conferir agora
                </SubmitButton>
              </form>
            )}
          </div>
        </article>

        {ctx.canWrite && (
          <article className="st-card">
            <h2>Assistente de perfil</h2>
            <StateForm action={saveProfileTarget.bind(null, slug)} submit="Salvar alvo">
              <CountedText id="pn" name="desired_name" label="Nome (aparece na busca)" max={64} rows={1} defaultValue={target?.desired_name} />
              <CountedText id="pb" name="desired_biography" label="Bio" max={150} rows={4} defaultValue={target?.desired_biography} />
              <div className="st-field">
                <label htmlFor="pw">Site</label>
                <input id="pw" name="desired_website" className="st-input" defaultValue={target?.desired_website ?? ""} placeholder="https://" />
              </div>
            </StateForm>
          </article>
        )}
      </section>

      <aside className="st-grid">
        <article className="st-card">
          <h2>Abrir no celular</h2>
          <div dangerouslySetInnerHTML={{ __html: qr }} style={{ width: 132 }} aria-label="QR code para abrir a edição de perfil do Instagram" role="img" />
          <p className="st-hint">Aponte a câmera: abre a edição de perfil no app do Instagram.</p>
        </article>
        <article className="st-card">
          <h2>Foto desejada</h2>
          {photo ? <CirclePreview src={photo} /> : <p className="st-hint">Nenhuma foto enviada.</p>}
          {ctx.canWrite && (
            <Uploader
              accept="image/png,image/jpeg"
              label="Enviar foto (PNG ou JPG, quadrada)"
              maxMb={8}
              preview="circle"
              getUrl={profileUploadUrl.bind(null, slug, "photo")}
              onUploaded={setProfilePhoto.bind(null, slug)}
            />
          )}
          <p className="st-hint">A troca da foto é manual no app. Quando a foto do perfil mudar, o Studio marca como aplicado.</p>
        </article>
        {ctx.canWrite && (
          <article className="st-card">
            <h2>Sugerir bio com IA</h2>
            <StateForm action={suggestBio.bind(null, slug)} submit="Gerar 3 sugestões" pending="Pedindo…">
              <div className="st-field">
                <label htmlFor="hint">Foco (opcional)</label>
                <input id="hint" name="hint" className="st-input" placeholder="ex.: destacar o PDF pro cliente" />
              </div>
            </StateForm>
            {bioJob && bioJob.status !== "done" && <p className="st-hint">{bioJob.status === "failed" ? `Falhou: ${bioJob.last_error}` : "Gerando…"}</p>}
            {suggestions.map((s) => (
              <div key={s} className="st-card" style={{ padding: "0.7rem" }}>
                <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{s}</p>
                <div className="st-actions">
                  <span className="st-hint">{[...s].length}/150</span>
                  <CopyButton text={s} />
                </div>
              </div>
            ))}
          </article>
        )}
      </aside>
    </div>
  );
}
