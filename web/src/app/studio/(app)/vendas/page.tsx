import type { Metadata } from "next";
import Link from "next/link";
import { formatCents } from "@/lib/studio/finance-math";
import { CONTACT_CATEGORY, DOCUMENT_KIND, label, LEAD_SOURCE, LEAD_STAGE, MATERIAL_PURPOSE } from "@/lib/studio/records";
import { br, daysAgoISO, requireScope, todayLocal } from "@/lib/studio/scope";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Vendas" };

const monthly = (k: { value_cents: number; cycle: string }) =>
  k.cycle === "monthly" ? Number(k.value_cents) : k.cycle === "yearly" ? Number(k.value_cents) / 12 : 0;

export default async function SalesDashboard({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  const ctx = await requireScope(e);
  const supabase = await createClient();
  const today = todayLocal();
  const month = today.slice(0, 7);
  const d90 = daysAgoISO(90);
  const d30 = daysAgoISO(30).slice(0, 10);
  const in30 = new Date(Date.parse(today) + 30 * 864e5).toISOString().slice(0, 10);
  const [{ data: contacts }, { data: docs }, { data: mats }, { data: camps }] = await Promise.all([
    supabase.from("contacts").select("category,person_type,entity_id,status").in("entity_id", ctx.scopeIds),
    supabase.from("documents").select("id,title,kind,status,valid_until,storage_path,contact_id").in("entity_id", ctx.scopeIds),
    supabase.from("materials").select("purpose,created_at").in("entity_id", ctx.scopeIds),
    supabase.from("campaigns").select("id,name,status,budget_cents,end_date").in("entity_id", ctx.scopeIds),
  ]);
  const C = (contacts ?? []).filter((c) => c.status === "ativo");
  const D = docs ?? [];
  const vigentes = D.filter((d) => d.status === "vigente");
  const expiring = vigentes.filter((d) => d.valid_until && d.valid_until <= in30).sort((a, b) => (a.valid_until ?? "").localeCompare(b.valid_until ?? ""));
  const noFile = D.filter((d) => !d.storage_path);
  const activeCamps = (camps ?? []).filter((k) => k.status === "active");
  const byCat = CONTACT_CATEGORY.map(([v, l]) => ({ v, l, pj: C.filter((c) => c.category === v && c.person_type === "pj").length, pf: C.filter((c) => c.category === v && c.person_type === "pf").length })).filter((r) => r.pj + r.pf);
  const [{ data: leads }, { data: contracts }, marketing] = await Promise.all([
    supabase.from("leads").select("id,stage,source,value_cents,won_at,lost_at,created_at,entity_id").in("entity_id", ctx.scopeIds),
    supabase.from("contracts").select("value_cents,cycle,status,start_date,canceled_at,entity_id").in("entity_id", ctx.scopeIds),
    ctx.canSeeFinance
      ? supabase
          .from("fin_transactions_view")
          .select("paid_amount_cents,category_name,paid_date")
          .in("entity_id", ctx.scopeIds)
          .eq("type", "expense")
          .eq("category_name", "Marketing e anúncios")
          .gte("paid_date", d90.slice(0, 10))
      : Promise.resolve({ data: [] }),
  ]);
  const L = leads ?? [];
  const K = contracts ?? [];
  const open = L.filter((l) => !["won", "lost"].includes(l.stage));
  const negotiating = L.filter((l) => ["proposal", "negotiation"].includes(l.stage));
  const won90 = L.filter((l) => l.won_at && l.won_at >= d90);
  const lost90 = L.filter((l) => l.lost_at && l.lost_at >= d90);
  const wonMonth = L.filter((l) => l.won_at?.startsWith(month));
  const conversion = won90.length + lost90.length ? (won90.length / (won90.length + lost90.length)) * 100 : null;
  const newContractsMonth = K.filter((k) => k.start_date.startsWith(month));
  const mrrAcquired = newContractsMonth.reduce((s, k) => s + monthly(k), 0);
  const newRevenueMonth = newContractsMonth.reduce((s, k) => s + Number(k.value_cents), 0);
  const ticket = newContractsMonth.length ? newRevenueMonth / newContractsMonth.length : null;
  const active = K.filter((k) => k.status === "active");
  const mrr = active.reduce((s, k) => s + monthly(k), 0);
  const canceled30 = K.filter((k) => k.canceled_at && k.canceled_at >= d30).length;
  const activeAtStart = active.length + canceled30;
  const churn = activeAtStart ? (canceled30 / activeAtStart) * 100 : null;
  const arpa = active.length ? mrr / active.length : 0;
  const ltv = churn && churn > 0 ? arpa / (churn / 100) : null;
  const marketingSpend = (marketing.data ?? []).reduce((s, t) => s + Number(t.paid_amount_cents ?? 0), 0);
  const newCustomers90 = K.filter((k) => k.start_date >= d90.slice(0, 10)).length;
  const cac = newCustomers90 ? marketingSpend / newCustomers90 : null;
  const channels = LEAD_SOURCE.map(([source, name]) => {
    const all = L.filter((l) => l.source === source);
    const won = all.filter((l) => l.stage === "won").length;
    const lost = all.filter((l) => l.stage === "lost").length;
    return { source, name, total: all.length, won, rate: won + lost ? (won / (won + lost)) * 100 : null };
  }).filter((c) => c.total);
  const funnel = LEAD_STAGE.filter(([s]) => s !== "lost").map(([, name], i, arr) => ({
    name,
    // quantos chegaram pelo menos até esta etapa
    count: L.filter((l) => l.stage !== "lost" && arr.findIndex(([s]) => s === l.stage) >= i).length,
  }));
  const pct = (v: number | null) => (v == null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
  const money = (v: number | null) => (v == null ? "—" : ctx.canSeeFinance ? formatCents(Math.round(v), { whole: true }) : "•••");

  return (
    <>
      <div className="st-page-head">
        <div>
          <p className="st-eyebrow">Vendas · {ctx.filter.label}</p>
          <h1>Dashboard comercial</h1>
        </div>
        {ctx.canWrite && (
          <div className="st-actions">
            <Link className="st-btn" href="/studio/vendas/contatos#novo">
              + Contato
            </Link>
            <Link className="st-btn" data-variant="ghost" href="/studio/vendas/documentos#novo">
              + Documento
            </Link>
          </div>
        )}
      </div>
      <dl className="st-kpis">
        <div className="st-kpi">
          <dt>Contatos ativos</dt>
          <dd>{C.length}</dd>
          <span className="st-delta">
            {C.filter((c) => c.person_type === "pj").length} PJ · {C.filter((c) => c.person_type === "pf").length} PF
          </span>
        </div>
        <div className="st-kpi">
          <dt>Parceiros comerciais</dt>
          <dd>{C.filter((c) => c.category === "parceiro").length}</dd>
          <span className="st-delta">{C.filter((c) => c.category === "empresa" || c.category === "loja").length} empresas e lojas</span>
        </div>
        <div className="st-kpi">
          <dt>Profissionais e prestadores</dt>
          <dd>{C.filter((c) => c.category === "profissional" || c.category === "prestador").length}</dd>
        </div>
        <div className="st-kpi">
          <dt>Contratos vigentes</dt>
          <dd>{vigentes.length}</dd>
          <span className="st-delta" data-tone={expiring.length ? "down" : undefined}>
            {expiring.length} vencendo em 30 dias
          </span>
        </div>
        <div className="st-kpi">
          <dt>Materiais</dt>
          <dd>{(mats ?? []).length}</dd>
          <span className="st-delta">{noFile.length ? `${noFile.length} documento(s) sem arquivo` : "todos os documentos com arquivo"}</span>
        </div>
        <div className="st-kpi">
          <dt>Campanhas ativas</dt>
          <dd>{activeCamps.length}</dd>
          <span className="st-delta">{money(activeCamps.reduce((s, k) => s + Number(k.budget_cents ?? 0), 0))} de orçamento</span>
        </div>
      </dl>
      <div className="st-grid" data-cols="3">
        <article className="st-card">
          <div className="st-card-head">
            <h2>Contatos por categoria</h2>
            <Link href={`/studio/vendas/contatos${e ? `?e=${e}` : ""}`}>Ver todos</Link>
          </div>
          <div className="st-table-wrap">
            <table className="st-table">
              <thead>
                <tr>
                  <th scope="col">Categoria</th>
                  <th scope="col" style={{ textAlign: "right" }}>
                    PJ
                  </th>
                  <th scope="col" style={{ textAlign: "right" }}>
                    PF
                  </th>
                </tr>
              </thead>
              <tbody>
                {byCat.map((r) => (
                  <tr key={r.v}>
                    <th scope="row">
                      <Link href={`/studio/vendas/contatos?cat=${r.v}${e ? `&e=${e}` : ""}`}>{r.l}</Link>
                    </th>
                    <td className="st-num">{r.pj}</td>
                    <td className="st-num">{r.pf}</td>
                  </tr>
                ))}
                {!byCat.length && (
                  <tr>
                    <td colSpan={3}>
                      Nenhum contato ainda. <Link href="/studio/vendas/contatos#novo">Cadastrar</Link>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
        <article className="st-card">
          <div className="st-card-head">
            <h2>Contratos a vencer</h2>
            <Link href={`/studio/vendas/documentos${e ? `?e=${e}` : ""}`}>Ver todos</Link>
          </div>
          <ul className="st-list">
            {expiring.slice(0, 6).map((d) => (
              <li key={d.id}>
                <span className="st-grow">
                  <Link href={`/studio/vendas/documentos/${d.id}`}>{d.title}</Link>
                  <div className="st-hint">{label(DOCUMENT_KIND, d.kind)}</div>
                </span>
                <span className="st-status" data-tone={(d.valid_until ?? "") < today ? "bad" : "warn"}>
                  {br(d.valid_until)}
                </span>
              </li>
            ))}
            {!expiring.length && <li className="st-hint">Nenhum contrato vence nos próximos 30 dias.</li>}
          </ul>
        </article>
        <article className="st-card">
          <div className="st-card-head">
            <h2>Materiais por finalidade</h2>
            <Link href={`/studio/vendas/materiais${e ? `?e=${e}` : ""}`}>Abrir biblioteca</Link>
          </div>
          <ul className="st-list">
            {MATERIAL_PURPOSE.map(([v, l]) => [v, l, (mats ?? []).filter((m) => m.purpose === v).length] as const)
              .filter(([, , n]) => n)
              .map(([v, l, n]) => (
                <li key={v}>
                  <span className="st-grow">
                    <Link href={`/studio/vendas/materiais?fin=${v}${e ? `&e=${e}` : ""}`}>{l}</Link>
                  </span>
                  <strong>{n}</strong>
                </li>
              ))}
            {!mats?.length && <li className="st-hint">Biblioteca vazia.</li>}
          </ul>
        </article>
      </div>

      <h2 style={{ margin: "2rem 0 0.75rem" }}>Vendas e assinaturas</h2>
      <p className="st-hint" style={{ marginTop: 0 }}>
        Do funil de leads e dos contratos de assinatura dos produtos. <Link href={`/studio/vendas/crm${e ? `?e=${e}` : ""}`}>Abrir o funil de vendas (CRM)</Link> ·{" "}
        <Link href="/studio/vendas/contratos">Assinaturas</Link>
      </p>
      <dl className="st-kpis">
        <div className="st-kpi">
          <dt>Leads em aberto</dt>
          <dd>{open.length}</dd>
          <span className="st-delta">{negotiating.length} em proposta/negociação</span>
        </div>
        <div className="st-kpi">
          <dt>Vendas no mês</dt>
          <dd>{wonMonth.length}</dd>
          <span className="st-delta">{won90.length} em 90 dias</span>
        </div>
        <div className="st-kpi">
          <dt>Taxa de conversão (90 dias)</dt>
          <dd>{pct(conversion)}</dd>
          <span className="st-delta">ganhos ÷ (ganhos + perdidos)</span>
        </div>
        <div className="st-kpi">
          <dt>Receita de novas vendas (mês)</dt>
          <dd>{money(newRevenueMonth)}</dd>
          <span className="st-delta">ticket médio {money(ticket)}</span>
        </div>
        <div className="st-kpi">
          <dt>MRR adquirido (mês)</dt>
          <dd>{money(mrrAcquired)}</dd>
          <span className="st-delta">MRR de contratos {money(mrr)}</span>
        </div>
        <div className="st-kpi">
          <dt>Churn (30 dias)</dt>
          <dd>{pct(churn)}</dd>
          <span className="st-delta">{canceled30} cancelamento(s)</span>
        </div>
      </dl>
      <div className="st-grid" data-cols="3">
        <article className="st-card">
          <h2>Funil</h2>
          <div className="st-funnel">
            {funnel.map((f) => (
              <div key={f.name} className="st-funnel-row">
                <span>{f.name}</span>
                <span className="st-funnel-bar" aria-hidden="true">
                  <span style={{ width: `${funnel[0].count ? (f.count / funnel[0].count) * 100 : 0}%` }} />
                </span>
                <b>{f.count}</b>
              </div>
            ))}
          </div>
          <p className="st-hint">Perdidos: {L.filter((l) => l.stage === "lost").length}</p>
        </article>
        <article className="st-card">
          <h2>Desempenho por canal</h2>
          <div className="st-table-wrap">
            <table className="st-table">
              <thead>
                <tr>
                  <th scope="col">Canal</th>
                  <th scope="col" style={{ textAlign: "right" }}>
                    Leads
                  </th>
                  <th scope="col" style={{ textAlign: "right" }}>
                    Vendas
                  </th>
                  <th scope="col" style={{ textAlign: "right" }}>
                    Conversão
                  </th>
                </tr>
              </thead>
              <tbody>
                {channels.map((c) => (
                  <tr key={c.source}>
                    <th scope="row">{c.name}</th>
                    <td className="st-num">{c.total}</td>
                    <td className="st-num">{c.won}</td>
                    <td className="st-num">{pct(c.rate)}</td>
                  </tr>
                ))}
                {!channels.length && (
                  <tr>
                    <td colSpan={4}>Sem leads ainda.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
        <article className="st-card">
          <h2>Unidade econômica</h2>
          <ul className="st-list">
            <li>
              <span className="st-grow">CAC (90 dias)</span>
              <strong>{money(cac)}</strong>
            </li>
            <li>
              <span className="st-grow">LTV</span>
              <strong>{money(ltv)}</strong>
            </li>
            <li>
              <span className="st-grow">Receita média por cliente (mês)</span>
              <strong>{money(arpa)}</strong>
            </li>
            <li>
              <span className="st-grow">Gasto com marketing (90 dias)</span>
              <strong>{money(marketingSpend)}</strong>
            </li>
          </ul>
          <p className="st-hint">
            CAC = despesas pagas na categoria “Marketing e anúncios” ÷ novos clientes em 90 dias. LTV = receita média por cliente ÷
            churn mensal. Origens dos leads: {LEAD_SOURCE.map(([, n]) => n).join(", ")}. Etapas: {label(LEAD_STAGE, "new")} →{" "}
            {label(LEAD_STAGE, "won")}.
          </p>
        </article>
      </div>
    </>
  );
}
