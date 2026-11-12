import type { Metadata } from "next";
import { saveMetaAppAction } from "@/app/studio/(app)/social/actions";
import { StateForm } from "@/app/studio/(app)/social/ui";
import { requireAdmin } from "@/lib/studio/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Meta · Configurações" };

type Status = { id: string; label: string; app_id: string | null; ig_app_id: string | null; has_app_secret: boolean; has_ig_app_secret: boolean; updated_at: string };

export default async function MetaSettings() {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase.rpc("social_meta_app_status");
  const app = ((data ?? []) as Status[])[0];
  const saved = (has: boolean) => (has ? `••• salvo em ${new Date(app.updated_at).toLocaleDateString("pt-BR")}` : "não cadastrado");
  return (
    <div className="st-grid" data-cols="2-1">
      <article className="st-card">
        <h2>App da Meta</h2>
        <StateForm action={saveMetaAppAction} submit="Salvar">
          <input type="hidden" name="id" value={app?.id ?? ""} />
          <div className="st-field">
            <label htmlFor="label">Nome</label>
            <input id="label" name="label" className="st-input" defaultValue={app?.label ?? "Bellman Studio"} />
          </div>
          <div className="st-row" data-cols="2">
            <div className="st-field">
              <label htmlFor="app_id">App ID (Facebook)</label>
              <input id="app_id" name="app_id" inputMode="numeric" className="st-input" defaultValue={app?.app_id ?? ""} />
            </div>
            <div className="st-field">
              <label htmlFor="app_secret">App Secret</label>
              <input id="app_secret" name="app_secret" type="password" autoComplete="off" className="st-input" placeholder={app ? saved(app.has_app_secret) : ""} />
              <span className="st-hint">Deixe em branco para manter o atual.</span>
            </div>
            <div className="st-field">
              <label htmlFor="ig_app_id">Instagram App ID</label>
              <input id="ig_app_id" name="ig_app_id" inputMode="numeric" className="st-input" defaultValue={app?.ig_app_id ?? ""} />
            </div>
            <div className="st-field">
              <label htmlFor="ig_app_secret">Instagram App Secret</label>
              <input id="ig_app_secret" name="ig_app_secret" type="password" autoComplete="off" className="st-input" placeholder={app ? saved(app.has_ig_app_secret) : ""} />
              <span className="st-hint">Só para tokens do login do Instagram (IG…).</span>
            </div>
          </div>
        </StateForm>
      </article>
      <aside className="st-card">
        <h2>Onde encontrar</h2>
        <p className="st-hint">
          developers.facebook.com → Meus apps → Bellman Studio → Configurações do app → Básico (App ID e Chave secreta). Para o login do Instagram: Casos de uso → Instagram → Configuração da API
          com login do Instagram (ID e chave secreta do app do Instagram).
        </p>
        <p className="st-hint">
          Os segredos são cifrados (AES-256-GCM) antes de ir ao banco e ficam numa área sem acesso pelo navegador. Depois de salvos, aparecem só como “••• salvo”. Toda troca fica na auditoria,
          sem o valor.
        </p>
      </aside>
    </div>
  );
}
