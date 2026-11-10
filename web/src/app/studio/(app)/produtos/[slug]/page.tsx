import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LineChart, StackedColumns } from "@/components/studio/charts";
import { formatCents, monthLabel } from "@/lib/studio/finance-math";
import { secretEnvName } from "@/lib/studio/product-link";
import { requireStudio } from "@/lib/studio/session";
import { createClient } from "@/lib/supabase/server";
import { SyncButton } from "../SyncButton";

export const metadata: Metadata = { title: "Produto" };

type Usage = { users: { total: number; verified: number; active7d: number; active30d: number; newInPeriod: number }; monthly: { month: string; newUsers: number }[]; captured_at: string };
type Revenue = {
  subscriptions: { active: number; trialing: number; pastDue: number; newInPeriod: number; canceledInPeriod: number; byPlan: { planId: string; planName: string; priceCents: number; active: number; mrrCents: number }[] };
  mrr_cents: number;
  revenue_month_cents: number;
  monthly: { month: string; newSubscriptions: number; canceledSubscriptions: number; activeSubscriptionsAtEnd: number; revenueCents: number }[];
};

const when = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "nunca";

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireStudio();
  const product = ctx.visible.find((e) => e.slug === slug && e.kind === "product");
  if (!product) notFound();

  const supabase = await createClient();
  const [{ data: usage }, { data: revenue }, { data: state }, { data: runs }] = await Promise.all([
    supabase.from("product_usage_snapshots").select("users,monthly,captured_at").eq("entity_id", product.id).order("day", { ascending: false }).limit(1).maybeSingle(),
    ctx.canSeeFinance
      ? supabase.from("product_revenue_snapshots").select("subscriptions,mrr_cents,revenue_month_cents,monthly").eq("entity_id", product.id).order("day", { ascending: false }).limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("product_sync_state").select("*").eq("entity_id", product.id).maybeSingle(),
    ctx.isAdmin
      ? supabase.from("product_sync_runs").select("at,trigger,ok,message").eq("entity_id", product.id).order("at", { ascending: false }).limit(5)
      : Promise.resolve({ data: [] }),
  ]);
  const u = usage as Usage | null;
  const r = revenue as Revenue | null;
  const integrated = Boolean(product.metrics_url);
  const months = (r?.monthly ?? u?.monthly ?? []).slice(-6).map((x) => x.month);

  return (
    <>
      <div className="st-page-head">
        <div>
          <p className="st-eyebrow">Produto</p>
          <h1 style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <span className="st-dot" style={{ background: product.color, width: "0.9rem", height: "0.9rem" }} aria-hidden="true" />
            {product.name}
          </h1>
          {product.description && <p>{product.description}</p>}
        </div>
        <div className="st-actions">
          {product.site_url && (
            <a className="st-btn" data-variant="ghost" href={product.site_url} target="_blank" rel="noopener noreferrer">
              Abrir site ↗
            </a>
          )}
          {product.admin_url && (
            <a className="st-btn" href={product.admin_url} target="_blank" rel="noopener noreferrer">
              Abrir admin do {product.name} ↗
            </a>
          )}
        </div>
      </div>

      {!integrated ? (
        <div className="st-grid" data-cols="2">
          <article className="st-card">
            <div className="st-card-head">
              <h2>Integração de métricas</h2>
              <span className="st-tag">Em breve</span>
            </div>
            <p>
              Usuários, assinaturas, MRR e pagamentos do {product.name} vão aparecer aqui, somente leitura, quando o backend do
              produto expuser os endpoints internos assinados e cifrados (o mesmo padrão já em uso no Obra Fácil).
            </p>
          </article>
          <article className="st-card">
            <h2>Divisão de responsabilidades</h2>
            <p>
              Usuários do app, planos e preços, Mercado Pago, webhooks, chaves e configurações continuam no admin do {product.name}.
            </p>
          </article>
        </div>
      ) : (
        <>
          <p className="st-banner" data-tone="info">
            <span>
              Dados reais do {product.name}, lidos por canal assinado e cifrado, somente agregados (sem dados pessoais). Última
              atualização: <strong>{when(state?.last_ok_at)}</strong>
              {state?.last_error && <> · último erro: {state.last_error}</>}. Atualiza sozinho todo dia às 6h.
            </span>
          </p>
          {ctx.isAdmin && <SyncButton slug={product.slug} />}

          {u ? (
            <dl className="st-kpis">
              <div className="st-kpi">
                <dt>Usuários cadastrados</dt>
                <dd>{u.users.total.toLocaleString("pt-BR")}</dd>
                <span className="st-delta">{u.users.verified.toLocaleString("pt-BR")} com e-mail verificado</span>
              </div>
              <div className="st-kpi">
                <dt>Ativos em 30 dias</dt>
                <dd>{u.users.active30d.toLocaleString("pt-BR")}</dd>
                <span className="st-delta">{u.users.active7d.toLocaleString("pt-BR")} nos últimos 7 dias</span>
              </div>
              <div className="st-kpi">
                <dt>Novos cadastros no mês</dt>
                <dd>{u.users.newInPeriod.toLocaleString("pt-BR")}</dd>
              </div>
              {r && (
                <>
                  <div className="st-kpi">
                    <dt>Assinantes ativos</dt>
                    <dd>{r.subscriptions.active.toLocaleString("pt-BR")}</dd>
                    <span className="st-delta" data-tone={r.subscriptions.pastDue ? "down" : undefined}>
                      {r.subscriptions.pastDue} inadimplente(s)
                    </span>
                  </div>
                  <div className="st-kpi">
                    <dt>MRR</dt>
                    <dd>{formatCents(r.mrr_cents, { whole: true })}</dd>
                    <span className="st-delta">receita recorrente mensal</span>
                  </div>
                  <div className="st-kpi">
                    <dt>Receita no mês</dt>
                    <dd>{formatCents(r.revenue_month_cents, { whole: true })}</dd>
                    <span className="st-delta">pagamentos aprovados</span>
                  </div>
                </>
              )}
            </dl>
          ) : (
            <p className="st-restricted">Ainda sem dados. {ctx.isAdmin ? "Clique em “Sincronizar agora”." : "Aguarde a próxima sincronização."}</p>
          )}

          <div className="st-grid" data-cols="2">
            {u && (
              <article className="st-card">
                <div className="st-card-head">
                  <h2>Novos cadastros por mês</h2>
                  <span>últimos 6 meses</span>
                </div>
                <StackedColumns
                  title="Novos cadastros por mês"
                  labels={u.monthly.slice(-6).map((x) => monthLabel(x.month))}
                  series={[{ label: "Cadastros", color: product.color, values: u.monthly.slice(-6).map((x) => x.newUsers) }]}
                  money={false}
                />
              </article>
            )}
            {r && (
              <article className="st-card">
                <div className="st-card-head">
                  <h2>Assinantes ativos e receita</h2>
                  <span>últimos 6 meses</span>
                </div>
                <LineChart
                  title="Assinantes ativos no fim de cada mês"
                  labels={months.map((m) => monthLabel(m))}
                  series={[{ label: "Assinantes ativos", color: product.color, values: r.monthly.slice(-6).map((x) => x.activeSubscriptionsAtEnd) }]}
                  money={false}
                />
              </article>
            )}
            {r && (
              <article className="st-card">
                <h2>Assinaturas por plano</h2>
                <div className="st-table-wrap">
                  <table className="st-table">
                    <thead>
                      <tr>
                        <th scope="col">Plano</th>
                        <th scope="col" style={{ textAlign: "right" }}>Preço</th>
                        <th scope="col" style={{ textAlign: "right" }}>Ativas</th>
                        <th scope="col" style={{ textAlign: "right" }}>MRR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.subscriptions.byPlan.map((p) => (
                        <tr key={p.planId}>
                          <th scope="row">{p.planName}</th>
                          <td className="st-num">{formatCents(p.priceCents)}</td>
                          <td className="st-num">{p.active}</td>
                          <td className="st-num">{formatCents(p.mrrCents)}</td>
                        </tr>
                      ))}
                      {!r.subscriptions.byPlan.length && (
                        <tr>
                          <td colSpan={4}>Nenhuma assinatura ativa.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <p className="st-hint">
                  No mês: {r.subscriptions.newInPeriod} nova(s), {r.subscriptions.canceledInPeriod} cancelada(s), {r.subscriptions.trialing} aguardando
                  pagamento. Pagamentos aprovados entram sozinhos no Financeiro como receita realizada do {product.name}.
                </p>
              </article>
            )}
            {ctx.isAdmin && (
              <article className="st-card">
                <h2>Sincronizações recentes</h2>
                <ul className="st-list">
                  {(runs ?? []).map((run, i) => (
                    <li key={i}>
                      <span className="st-status" data-tone={run.ok ? "ok" : "bad"}>
                        {run.ok ? "OK" : "Erro"}
                      </span>
                      <span className="st-grow">{run.message}</span>
                      <small>
                        {run.trigger === "cron" ? "automática" : "manual"} · {when(run.at)}
                      </small>
                    </li>
                  ))}
                  {!runs?.length && <li>Nenhuma ainda.</li>}
                </ul>
                <p className="st-hint">Segredo do canal: variável {secretEnvName(product.slug)} no servidor (nunca no navegador).</p>
              </article>
            )}
          </div>
        </>
      )}
    </>
  );
}
