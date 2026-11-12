import type { Metadata } from "next";
import { requireWorkspace } from "@/lib/social/server";
import { createClient } from "@/lib/supabase/server";
import { SubmitButton } from "@/components/studio/SubmitButton";
import { deleteLibraryItem } from "../../actions";
import { LibraryUpload } from "./LibraryUpload";

export const metadata: Metadata = { title: "Acervo · Redes Sociais" };

const KIND: Record<string, string> = { music: "Trilha", screen_recording: "Gravação de tela", logo: "Logo", photo: "Foto" };

export default async function LibraryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { ctx, entity } = await requireWorkspace(slug);
  const supabase = await createClient();
  const { data } = await supabase.from("media_library").select("*").eq("entity_id", entity.id).order("created_at", { ascending: false });
  return (
    <div className="st-grid" data-cols="2-1">
      <article className="st-card">
        <h2>Acervo de mídia</h2>
        <p className="st-hint">
          Trilhas com licença, gravações de tela do app (para Reels de demonstração), logos e fotos. A API do Instagram não dá acesso às músicas do próprio Instagram: o áudio dos vídeos sai
          só daqui.
        </p>
        <div className="st-table-wrap">
          <table className="st-table">
            <thead>
              <tr>
                <th scope="col">Arquivo</th>
                <th scope="col">Tipo</th>
                <th scope="col">Licença</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((m) => (
                <tr key={m.id}>
                  <th scope="row">{m.title || m.storage_path.split("/").pop()}</th>
                  <td>{KIND[m.kind]}</td>
                  <td>{m.license_note || "—"}</td>
                  <td>
                    {ctx.canWrite && (
                      <form action={deleteLibraryItem.bind(null, slug)}>
                        <input type="hidden" name="id" value={m.id} />
                        <SubmitButton variant="danger" pendingLabel="…">
                          Remover
                        </SubmitButton>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
              {!data?.length && (
                <tr>
                  <td colSpan={4}>Acervo vazio.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
      {ctx.canWrite && (
        <aside className="st-card">
          <h2>Adicionar</h2>
          <LibraryUpload slug={slug} />
        </aside>
      )}
    </div>
  );
}
