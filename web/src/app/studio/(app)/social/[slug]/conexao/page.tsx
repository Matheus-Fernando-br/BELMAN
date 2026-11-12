import type { Metadata } from "next";
import Link from "next/link";
import { PUBLISH_SCOPES } from "@shared/social/meta-client";
import { ACCOUNT_STATUS, dateTimeBR, TOKEN_KIND } from "@/lib/social/labels";
import { loadAccount, loadMetaApp, requireWorkspace } from "@/lib/social/server";
import { daysUntil } from "@/lib/studio/scope";
import { SubmitButton } from "@/components/studio/SubmitButton";
import { connectAction, disconnectAction, testConnectionAction } from "../../actions";
import { StateForm } from "../../ui";

export const metadata: Metadata = { title: "Conexão · Redes Sociais" };

export default async function ConnectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { ctx, entity } = await requireWorkspace(slug);
  const [acc, app] = await Promise.all([loadAccount(entity.id), ctx.isAdmin ? loadMetaApp().catch(() => null) : Promise.resolve(null)]);
  const connected = acc && acc.status !== "disconnected";
  const missing = connected && !acc.scopes.some((s) => PUBLISH_SCOPES.includes(s));
  const days = acc?.token_expires_at ? daysUntil(acc.token_expires_at) : null;
  return (
    <div className="st-grid" data-cols="2-1">
      <section className="st-grid">
        <article className="st-card">
          <h2>Instagram</h2>
          {connected ? (
            <ul className="st-list">
              <li>
                <span className="st-grow">Conta</span>
                <strong>@{acc.username}</strong>
              </li>
              <li>
                <span className="st-grow">Situação</span>
                <span className="st-status" data-tone={ACCOUNT_STATUS[acc.status][1]}>
                  {ACCOUNT_STATUS[acc.status][0]}
                </span>
              </li>
              <li>
                <span className="st-grow">Tipo do token</span>
                <span>{acc.token_kind ? TOKEN_KIND[acc.token_kind] : "—"}</span>
              </li>
              <li>
                <span className="st-grow">Expira em</span>
                <span>{acc.token_expires_at ? `${dateTimeBR(acc.token_expires_at)} (${days} dias)` : "Não expira"}</span>
              </li>
              <li>
                <span className="st-grow">Próxima renovação</span>
                <span>
                  {acc.token_kind === "ig_user"
                    ? "Automática (job diário, aos 50 dias)"
                    : acc.token_kind === "fb_user"
                      ? "Sem renovação automática: troque por um token de System User"
                      : "Não precisa (checagem diária)"}
                </span>
              </li>
              <li>
                <span className="st-grow">Escopos</span>
                <span style={{ textAlign: "right" }}>{acc.scopes.join(", ") || "—"}</span>
              </li>
              <li>
                <span className="st-grow">Última checagem</span>
                <span>{dateTimeBR(acc.last_checked_at)}</span>
              </li>
              {acc.last_error && (
                <li>
                  <span className="st-grow">Último erro</span>
                  <span className="st-status" data-tone="bad">
                    {acc.last_error}
                  </span>
                </li>
              )}
            </ul>
          ) : (
            <p className="st-hint">Nenhuma conta conectada para {entity.name}.</p>
          )}
          {missing && <p className="st-alert">Falta a permissão de publicação (instagram_business_content_publish ou instagram_content_publish). Gere o token de novo marcando essa permissão.</p>}
          {connected && ctx.isAdmin && (
            <div className="st-actions">
              <StateForm action={testConnectionAction.bind(null, slug)} submit="Testar conexão" pending="Testando…" variant="ghost" inline>
                <input type="hidden" name="account_id" value={acc.id} />
              </StateForm>
              <form action={disconnectAction.bind(null, slug)}>
                <input type="hidden" name="account_id" value={acc.id} />
                <SubmitButton variant="danger" pendingLabel="Desconectando…">
                  Desconectar
                </SubmitButton>
              </form>
            </div>
          )}
        </article>

        {ctx.isAdmin ? (
          <article className="st-card">
            <h2>{connected ? "Trocar o token" : "Conectar"}</h2>
            {!app?.appId && (
              <p className="st-banner">
                Antes, cadastre o app da Meta em <Link href="/studio/configuracoes/meta">Configurações → Meta</Link>.
              </p>
            )}
            <StateForm action={connectAction.bind(null, slug)} submit="Conectar" pending="Validando com a Meta…">
              <div className="st-field">
                <label htmlFor="token">Cole o token de acesso</label>
                <input id="token" name="token" type="password" autoComplete="off" spellCheck={false} className="st-input" placeholder="EAA… ou IG…" />
                <span className="st-hint">
                  O token é validado na Meta, trocado por um de longa duração e guardado cifrado (AES-256-GCM). Ele nunca volta para esta tela.
                </span>
              </div>
            </StateForm>
          </article>
        ) : (
          <p className="st-restricted">Somente Sócio/Admin conecta ou troca tokens.</p>
        )}
      </section>

      <aside className="st-grid">
        {(acc?.token_kind === "fb_user" || !connected) && (
          <article className="st-card">
            <h2>Recomendado: token de System User (não expira)</h2>
            <ol className="st-hint" style={{ paddingLeft: "1.1rem", lineHeight: 1.6 }}>
              <li>
                Abra o <a href="https://business.facebook.com/settings/system-users" target="_blank" rel="noreferrer">Business Manager → Usuários do sistema</a>.
              </li>
              <li>Adicionar → nome “Bellman Studio”, função Admin.</li>
              <li>Atribuir ativos: o app “Bellman Studio” (controle total) e a conta do Instagram (@obra.facil.app).</li>
              <li>
                Gerar token → escolha o app e marque <code>instagram_basic</code>, <code>instagram_content_publish</code>, <code>instagram_manage_comments</code>,{" "}
                <code>instagram_manage_insights</code>, <code>pages_show_list</code> e <code>business_management</code>. Validade: nunca.
              </li>
              <li>Cole o token aqui ao lado. Pronto: sem renovação manual.</li>
            </ol>
          </article>
        )}
        <article className="st-card">
          <h2>O que o Studio faz e não faz</h2>
          <p className="st-hint">
            Usa só APIs oficiais da Meta: publica posts aprovados, lê métricas e, se você ativar, responde comentários nos seus próprios posts. Nunca curte, segue, comenta em perfis de
            terceiros, manda DM em massa nem faz login no instagram.com.
          </p>
        </article>
      </aside>
    </div>
  );
}
