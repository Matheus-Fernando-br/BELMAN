import type { Metadata } from "next";
import { ACCOUNT_STATUS, dateTimeBR } from "@/lib/social/labels";
import { loadAccount, requireWorkspace } from "@/lib/social/server";
import { daysUntil } from "@/lib/studio/scope";
import { createClient } from "@/lib/supabase/server";
import { SubmitButton } from "@/components/studio/SubmitButton";
import { connectAction, disconnectAction, saveAiKey, testConnectionAction } from "../../actions";
import { StateForm } from "../../ui";

export const metadata: Metadata = { title: "Conexão · Redes Sociais" };

export default async function ConnectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { ctx, entity } = await requireWorkspace(slug);
  const supabase = await createClient();
  const [acc, { data: secrets }] = await Promise.all([loadAccount(entity.id), supabase.rpc("social_secret_status")]);
  const ai = ((secrets ?? []) as { name: string; hint: string | null; updated_at: string }[]).find((s) => s.name === "anthropic_api_key");
  const connected = acc && acc.status !== "disconnected";
  const days = acc?.token_expires_at ? daysUntil(acc.token_expires_at) : null;
  if (!ctx.isAdmin) return <p className="st-restricted">Somente Sócio/Admin cuida das conexões.</p>;
  return (
    <div className="st-grid" data-cols="2" style={{ marginTop: "1rem" }}>
      <article className="st-card">
        <div className="st-card-head">
          <h2>1. Instagram</h2>
          <span className="st-status" data-tone={ACCOUNT_STATUS[acc?.status ?? "disconnected"][1]}>
            {ACCOUNT_STATUS[acc?.status ?? "disconnected"][0]}
          </span>
        </div>
        {connected && (
          <p>
            <strong>@{acc.username}</strong>
            <br />
            <span className="st-hint">
              {acc.token_expires_at ? `Token vale até ${dateTimeBR(acc.token_expires_at)} (${days} dias). Você será avisado 10 dias antes.` : "Token que não expira."}
            </span>
          </p>
        )}
        {acc?.last_error && acc.status !== "connected" && <p className="st-alert">{acc.last_error}</p>}
        <StateForm action={connectAction.bind(null, slug)} submit={connected ? "Trocar token" : "Conectar"} pending="Conferindo com a Meta…">
          <div className="st-field">
            <label htmlFor="token">{connected ? "Cole o token novo (quando o atual vencer)" : "Cole o seu token de acesso do Instagram"}</label>
            <input id="token" name="token" type="password" autoComplete="off" spellCheck={false} className="st-input" placeholder="EAA…" />
            <span className="st-hint">Fica guardado cifrado e nunca aparece de novo na tela.</span>
          </div>
          <details>
            <summary className="st-hint" style={{ cursor: "pointer" }}>
              Opções avançadas
            </summary>
            <div className="st-field" style={{ marginTop: "0.5rem" }}>
              <label htmlFor="ig_id">ID da conta do Instagram</label>
              <input id="ig_id" name="ig_id" inputMode="numeric" className="st-input" defaultValue={acc?.external_id ?? (slug === "obra-facil" ? "17841471283814167" : "")} />
              <span className="st-hint">Só se a conexão pedir. Para a Obra Fácil já vem preenchido.</span>
            </div>
          </details>
        </StateForm>
        {connected && (
          <div className="st-actions">
            <StateForm action={testConnectionAction.bind(null, slug)} submit="Testar" pending="Testando…" variant="ghost" inline>
              <input type="hidden" name="account_id" value={acc.id} />
            </StateForm>
            <form action={disconnectAction.bind(null, slug)}>
              <input type="hidden" name="account_id" value={acc.id} />
              <SubmitButton variant="danger">Desconectar</SubmitButton>
            </form>
          </div>
        )}
        <details>
          <summary className="st-hint" style={{ cursor: "pointer" }}>
            Quer um token que nunca vence?
          </summary>
          <p className="st-hint">
            No Business Manager da Meta: Usuários do sistema → Adicionar → atribua o app e a conta do Instagram → Gerar token com as permissões do Instagram e validade “Nunca”. Cole
            aqui no lugar do atual.
          </p>
        </details>
      </article>

      <article className="st-card">
        <div className="st-card-head">
          <h2>2. Chave da IA</h2>
          <span className="st-status" data-tone={ai ? "ok" : "neutral"}>
            {ai ? `Salva (${ai.hint})` : "Não configurada"}
          </span>
        </div>
        <p className="st-hint">
          A IA (Claude, da Anthropic) escreve os textos dos posts. Crie a chave em console.anthropic.com → API Keys e cole aqui. Cada post custa poucos centavos de dólar; o gasto aparece
          no Financeiro.
        </p>
        <StateForm action={saveAiKey.bind(null, slug)} submit={ai ? "Trocar chave" : "Salvar chave"} pending="Salvando…">
          <div className="st-field">
            <label htmlFor="key">Chave da API</label>
            <input id="key" name="key" type="password" autoComplete="off" spellCheck={false} className="st-input" placeholder="sk-ant-…" />
          </div>
        </StateForm>
      </article>
    </div>
  );
}
