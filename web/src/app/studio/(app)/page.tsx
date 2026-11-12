import type { Metadata } from "next";
import { LineChart, StackedColumns } from "@/components/studio/charts";
import { brl } from "@/lib/studio/format";
import { Icon } from "@/components/studio/Icon";
import { CONSOLIDATED, filterOptions, resolveFilter } from "@/lib/studio/filter";
import { cashToday, loadAllocated, loadTransactions, todayISO } from "@/lib/studio/finance";
import { addMonths, cashFlow, lastDayOfMonth, monthKey, monthLabel, monthsBetween } from "@/lib/studio/finance-math";
import { liveDashboard } from "@/lib/studio/dashboard-live";
import { sampleDashboard } from "@/lib/studio/sample-data";
import { requireStudio, type Entity } from "@/lib/studio/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard" };

function Delta({ now, prev, invert = false }: { now: number; prev: number; invert?: boolean }) {
  if (!prev) return <span className="st-delta">sem base anterior</span>;
  const pct = ((now - prev) / prev) * 100;
  const good = invert ? pct <= 0 : pct >= 0;
  return (
    <span className="st-delta" data-tone={good ? "up" : "down"}>
      {pct >= 0 ? "▲" : "▼"} {Math.abs(pct).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% vs. mês anterior
    </span>
  );
}

function EntityTag({ entity }: { entity?: Entity }) {
  if (!entity) return null;
  return (
    <span className="st-tag">
      <span className="st-dot" style={{ background: entity.color }} aria-hidden="true" />
      {entity.name}
    </span>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ e?: string; erro?: string }> }) {
  const ctx = await requireStudio();
  const params = await searchParams;
  const options = filterOptions(ctx.visible, ctx.fullAccess);
  const current = resolveFilter(params.e, options);
  const scope = current.slug === CONSOLIDATED ? ctx.visible.map((e) => e.slug) : [current.slug];
  const data = sampleDashboard(scope);
  const bySlug = new Map(ctx.entities.map((e) => [e.slug, e]));
  const scopeEntities = ctx.visible.filter((e) => scope.includes(e.slug));
  const scopeIds = scopeEntities.map((e) => e.id);

  // Tarefas, funil, desenvolvimento, entregas, conteúdo e alertas: dados reais (Fases 2 a 5).
  const live = await liveDashboard(scopeIds, new Map(ctx.entities.map((e) => [e.id, e.slug])));
  Object.assign(data, { funnel: live.funnel, conversion: live.conversion, tasks: live.tasks, features: live.features, bugs: live.bugs, deliveries: live.deliveries, content: live.content });
  data.alerts = live.alerts;

  // Financeiro com dados reais (Fase 1).
  let realAlerts: { tone: "bad" | "warn"; text: string; entity: string }[] = [];
  if (ctx.canSeeFinance && scopeIds.length) {
    const today = todayISO();
    const month = monthKey(today);
    const months = monthsBetween(addMonths(month, -5), month);
    const in3 = new Date(Date.parse(today) + 3 * 864e5).toISOString().slice(0, 10);
    const [allocated, cash, open] = await Promise.all([
      loadAllocated(scopeIds, `${months[0]}-01`, lastDayOfMonth(month)),
      cashToday(scopeIds),
      loadTransactions(scopeIds, "2000-01-01", in3),
    ]);
    const flows = cashFlow(allocated, months);
    data.months = months.map((m) => monthLabel(m));
    data.revenue = flows.map((f) => f.realizedIn / 100);
    data.expenses = flows.map((f) => f.realizedOut / 100);
    data.revenueByProduct = scopeEntities
      .filter((e) => e.kind === "product")
      .map((e) => ({
        slug: e.slug,
        values: months.map(
          (m) =>
            allocated
              .filter((r) => r.entity_id === e.id && r.type === "income" && !r.cancelled && r.paid_date?.startsWith(m))
              .reduce((sum, r) => sum + (r.paid_amount_cents ?? 0), 0) / 100,
        ),
      }));
    const now = flows.at(-1)!;
    const prev = flows.at(-2)!;
    data.kpis = {
      ...data.kpis,
      revenue: now.realizedIn / 100,
      prevRevenue: prev.realizedIn / 100,
      expenses: now.realizedOut / 100,
      prevExpenses: prev.realizedOut / 100,
      result: (now.realizedIn - now.realizedOut) / 100,
      cash: cash / 100,
    };
    const overdueIn = open.filter((t) => t.status === "overdue" && t.type === "income");
    const overdueOut = open.filter((t) => t.status === "overdue" && t.type === "expense");
    const dueSoon = open.filter((t) => t.status === "planned" && t.type === "expense" && t.due_date >= today && t.due_date <= in3);
    realAlerts = [
      ...(overdueIn.length ? [{ tone: "bad" as const, text: `${overdueIn.length} recebimento(s) em atraso`, entity: overdueIn[0].entity_slug }] : []),
      ...(overdueOut.length ? [{ tone: "bad" as const, text: `${overdueOut.length} conta(s) a pagar em atraso`, entity: overdueOut[0].entity_slug }] : []),
      ...dueSoon.map((t) => ({ tone: "warn" as const, text: `${t.description} vence em ${t.due_date.split("-").reverse().slice(0, 2).join("/")}`, entity: t.entity_slug })),
    ];
    data.alerts = [...realAlerts, ...data.alerts];
  }

  // Clientes e MRR reais dos produtos integrados (canal assinado e cifrado).
  const integrated = scopeEntities.filter((e) => e.kind === "product" && e.metrics_url);
  const pending = scopeEntities.filter((e) => e.kind === "product" && !e.metrics_url);
  let customersReal = false;
  if (integrated.length) {
    const supabase = await createClient();
    const ids = integrated.map((e) => e.id);
    const [{ data: revenueSnaps }, { data: usageSnaps }] = await Promise.all([
      ctx.canSeeFinance
        ? supabase.from("product_revenue_snapshots").select("entity_id,day,subscriptions,mrr_cents,monthly").in("entity_id", ids).order("day", { ascending: false })
        : Promise.resolve({ data: null }),
      supabase.from("product_usage_snapshots").select("entity_id,day,users").in("entity_id", ids).order("day", { ascending: false }),
    ]);
    const latest = <T extends { entity_id: string }>(rows: T[] | null) => ids.map((id) => rows?.find((r) => r.entity_id === id)).filter(Boolean) as T[];
    const rev = latest(revenueSnaps as { entity_id: string; subscriptions: { active: number }; mrr_cents: number; monthly: { month: string; activeSubscriptionsAtEnd: number }[] }[] | null);
    const use = latest(usageSnaps as { entity_id: string; users: { total: number; active30d: number } }[] | null);
    if (rev.length) {
      const today = todayISO();
      const keys = monthsBetween(addMonths(monthKey(today), -5), monthKey(today));
      const at = (r: (typeof rev)[number]) => keys.map((k) => r.monthly.find((m) => m.month === k)?.activeSubscriptionsAtEnd ?? 0);
      const totals = keys.map((_, i) => rev.reduce((sum, r) => sum + at(r)[i], 0));
      data.kpis.customers = rev.reduce((sum, r) => sum + r.subscriptions.active, 0);
      data.kpis.prevCustomers = totals.at(-2) ?? 0;
      data.kpis.mrr = rev.reduce((sum, r) => sum + r.mrr_cents, 0) / 100;
      data.customersByProduct = rev.map((r) => ({ slug: ctx.entities.find((e) => e.id === r.entity_id)!.slug, values: at(r) }));
      customersReal = true;
    } else if (use.length) {
      data.kpis.customers = use.reduce((sum, u) => sum + u.users.active30d, 0);
      data.kpis.prevCustomers = 0;
      customersReal = true;
    }
  }
  const customersNote = customersReal
    ? `${integrated.map((e) => e.name).join(", ")}${pending.length ? ` · ${pending.map((e) => e.name).join(", ")} em breve` : ""}`
    : "exemplo";
  const productSeries = data.revenueByProduct.map((p) => ({
    label: bySlug.get(p.slug)?.name ?? p.slug,
    color: bySlug.get(p.slug)?.color ?? "#777777",
    values: p.values,
  }));
  const customerSeries = data.customersByProduct.map((p) => ({
    label: bySlug.get(p.slug)?.name ?? p.slug,
    color: bySlug.get(p.slug)?.color ?? "#777777",
    values: p.values,
  }));
  const share = data.revenueByProduct.map((p) => ({ entity: bySlug.get(p.slug), value: p.values.at(-1) ?? 0 }));
  const shareTotal = share.reduce((s, x) => s + x.value, 0);
  const lateTasks = data.tasks.filter((t) => t.late);

  return (
    <>
      <div className="st-page-head">
        <div>
          <p className="st-eyebrow">Visão geral · {current.label}</p>
          <h1>Dashboard</h1>
        </div>
      </div>

      {params.erro === "restrito" && (
        <p className="st-alert" role="alert">
          Essa área é restrita ao Sócio/Admin.
        </p>
      )}
      <p className="st-banner" data-tone="info" role="note">
        <Icon name="alert" className="st-swatch" />
        <span>
          {ctx.canSeeFinance ? (
            <>
              <strong>Todos os números são reais</strong>: Financeiro, produtos integrados, Vendas, Operações, Desenvolvimento e Redes
              Sociais. Produtos ainda sem integração aparecem como “em breve”.
            </>
          ) : (
            <>
              <strong>Dados reais</strong> das áreas que você pode ver. Valores financeiros são restritos ao Sócio/Admin.
            </>
          )}
        </span>
      </p>

      {ctx.canSeeFinance ? (
        <dl className="st-kpis">
          <div className="st-kpi">
            <dt>Receita do mês</dt>
            <dd>{brl(data.kpis.revenue)}</dd>
            <Delta now={data.kpis.revenue} prev={data.kpis.prevRevenue} />
          </div>
          <div className="st-kpi">
            <dt>Despesas do mês</dt>
            <dd>{brl(data.kpis.expenses)}</dd>
            <Delta now={data.kpis.expenses} prev={data.kpis.prevExpenses} invert />
          </div>
          <div className="st-kpi">
            <dt>Resultado operacional</dt>
            <dd>{brl(data.kpis.result)}</dd>
            <span className="st-delta" data-tone={data.kpis.result >= 0 ? "up" : "down"}>
              {data.kpis.result >= 0 ? "lucro" : "prejuízo"} no mês
            </span>
          </div>
          <div className="st-kpi">
            <dt>Saldo em caixa</dt>
            <dd>{brl(data.kpis.cash)}</dd>
            <span className="st-delta">disponível hoje</span>
          </div>
          <div className="st-kpi">
            <dt>{ctx.canSeeFinance ? "Assinantes ativos" : "Clientes ativos"} · {customersNote}</dt>
            <dd>{data.kpis.customers.toLocaleString("pt-BR")}</dd>
            <Delta now={data.kpis.customers} prev={data.kpis.prevCustomers} />
          </div>
          <div className="st-kpi">
            <dt>MRR · {customersNote}</dt>
            <dd>{brl(data.kpis.mrr)}</dd>
            <span className="st-delta">receita recorrente mensal</span>
          </div>
        </dl>
      ) : (
        <dl className="st-kpis">
          <div className="st-kpi">
            <dt>{customersReal ? "Usuários ativos (30 dias)" : "Clientes ativos"} · {customersNote}</dt>
            <dd>{data.kpis.customers.toLocaleString("pt-BR")}</dd>
            <Delta now={data.kpis.customers} prev={data.kpis.prevCustomers} />
          </div>
          <div className="st-kpi">
            <dt>Tarefas atrasadas</dt>
            <dd>{lateTasks.length}</dd>
          </div>
          <div className="st-kpi">
            <dt>Bugs abertos</dt>
            <dd>{data.bugs.length}</dd>
          </div>
        </dl>
      )}

      <section className="st-grid" data-cols="2" aria-label="Indicadores financeiros e de clientes">
        <article className="st-card">
          <div className="st-card-head">
            <h2>Receitas x despesas</h2>
            <span>últimos 6 meses</span>
          </div>
          {ctx.canSeeFinance ? (
            <LineChart
              title="Receitas e despesas nos últimos 6 meses"
              labels={data.months}
              series={[
                { label: "Receitas", color: "#0b0b0b", values: data.revenue },
                { label: "Despesas", color: "#8a8a8a", values: data.expenses, dashed: true },
              ]}
            />
          ) : (
            <Restricted />
          )}
        </article>

        <article className="st-card">
          <div className="st-card-head">
            <h2>{productSeries.length > 1 ? "Receita por produto" : "Receita"}</h2>
            <span>últimos 6 meses</span>
          </div>
          {!ctx.canSeeFinance ? (
            <Restricted />
          ) : productSeries.length ? (
            <StackedColumns title="Receita mensal por produto" labels={data.months} series={productSeries} />
          ) : (
            <p className="st-hint">Sem receita registrada para {current.label}.</p>
          )}
        </article>

        <article className="st-card">
          <div className="st-card-head">
            <h2>Evolução de clientes</h2>
            <span>{customersReal ? `assinantes no fim do mês · ${customersNote}` : "exemplo · Fase 3"}</span>
          </div>
          {customerSeries.length ? (
            <LineChart title="Clientes ativos por produto" labels={data.months} series={customerSeries} money={false} />
          ) : (
            <p className="st-hint">Sem clientes para {current.label}.</p>
          )}
        </article>

        <div className="st-grid">
          {ctx.canSeeFinance && share.length > 1 && (
            <article className="st-card">
              <div className="st-card-head">
                <h2>Participação no faturamento</h2>
                <span>{data.months.at(-1)}</span>
              </div>
              <div className="st-share" role="img" aria-label={share.map((s) => `${s.entity?.name} ${Math.round((s.value / shareTotal) * 100)}%`).join(", ")}>
                {share.map((s) => (
                  <span key={s.entity?.slug} style={{ width: `${(s.value / shareTotal) * 100}%`, background: s.entity?.color }} />
                ))}
              </div>
              <ul className="st-legend" role="list">
                {share.map((s) => (
                  <li key={s.entity?.slug}>
                    <span className="st-swatch" style={{ background: s.entity?.color }} />
                    {s.entity?.name} · <strong>{Math.round((s.value / shareTotal) * 100)}%</strong> ({brl(s.value)})
                  </li>
                ))}
              </ul>
            </article>
          )}
          <article className="st-card">
            <div className="st-card-head">
              <h2>Desempenho comercial</h2>
              <span>conversão {(data.conversion * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</span>
            </div>
            <div className="st-funnel">
              {data.funnel.map((f) => (
                <div key={f.stage} className="st-funnel-row">
                  <span>{f.stage}</span>
                  <span className="st-funnel-bar" aria-hidden="true">
                    <span style={{ width: `${data.funnel[0].count ? (f.count / data.funnel[0].count) * 100 : 0}%` }} />
                  </span>
                  <b>{f.count}</b>
                </div>
              ))}
            </div>
          </article>
        </div>
      </section>

      <section className="st-grid" data-cols="3" aria-label="Operação, desenvolvimento e conteúdo">
        <article className="st-card">
          <div className="st-card-head">
            <h2>Alertas</h2>
            <span>{data.alerts.length}</span>
          </div>
          <ul className="st-list">
            {data.alerts.map((a) => (
              <li key={a.text}>
                <span className="st-status" data-tone={a.tone}>
                  {a.tone === "bad" ? "Urgente" : "Atenção"}
                </span>
                <span className="st-grow">{a.text}</span>
                <EntityTag entity={bySlug.get(a.entity)} />
              </li>
            ))}
            {!data.alerts.length && <li>Nenhum alerta.</li>}
          </ul>
        </article>

        <article className="st-card">
          <div className="st-card-head">
            <h2>Tarefas</h2>
            <span>{lateTasks.length} atrasada(s)</span>
          </div>
          <ul className="st-list">
            {data.tasks.map((t) => (
              <li key={t.title}>
                <span className="st-grow" title={t.title}>
                  {t.title}
                </span>
                <span className="st-status" data-tone={t.late ? "bad" : "neutral"}>
                  {t.late ? "Atrasada" : t.due}
                </span>
              </li>
            ))}
            {!data.tasks.length && <li>Nenhuma tarefa.</li>}
          </ul>
        </article>

        <article className="st-card">
          <div className="st-card-head">
            <h2>Conteúdo</h2>
            <span>esta semana</span>
          </div>
          <dl className="st-kpis" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: "0.5rem" }}>
            <div>
              <dt className="st-hint">Posts</dt>
              <dd style={{ margin: 0, fontWeight: 800, fontSize: "1.4rem" }}>{data.content.week}</dd>
            </div>
            <div>
              <dt className="st-hint">Em revisão</dt>
              <dd style={{ margin: 0, fontWeight: 800, fontSize: "1.4rem" }}>{data.content.awaiting}</dd>
            </div>
            <div>
              <dt className="st-hint">Publicados</dt>
              <dd style={{ margin: 0, fontWeight: 800, fontSize: "1.4rem" }}>{data.content.published}</dd>
            </div>
          </dl>
        </article>

        <article className="st-card">
          <div className="st-card-head">
            <h2>Em desenvolvimento</h2>
            <span>{data.features.length}</span>
          </div>
          <ul className="st-list">
            {data.features.map((f) => (
              <li key={f.title}>
                <span className="st-grow">{f.title}</span>
                <small>{f.status}</small>
              </li>
            ))}
            {!data.features.length && <li>Nada em andamento.</li>}
          </ul>
        </article>

        <article className="st-card">
          <div className="st-card-head">
            <h2>Bugs críticos</h2>
            <span>{data.bugs.length} aberto(s)</span>
          </div>
          <ul className="st-list">
            {data.bugs.map((b) => (
              <li key={b.title}>
                <span className="st-status" data-tone={b.severity === "crítico" ? "bad" : "warn"}>
                  {b.severity}
                </span>
                <span className="st-grow" title={b.title}>
                  {b.title}
                </span>
              </li>
            ))}
            {!data.bugs.length && <li>Nenhum bug aberto.</li>}
          </ul>
        </article>

        <article className="st-card">
          <div className="st-card-head">
            <h2>Próximas entregas</h2>
          </div>
          <ul className="st-list">
            {data.deliveries.map((d) => (
              <li key={d.title}>
                <span className="st-grow">{d.title}</span>
                <small>{d.date}</small>
              </li>
            ))}
            {!data.deliveries.length && <li>Nada agendado.</li>}
          </ul>
        </article>
      </section>
    </>
  );
}

function Restricted() {
  return (
    <p className="st-restricted">
      <Icon name="lock" className="st-swatch" />
      Números financeiros visíveis apenas para Sócio/Admin.
    </p>
  );
}
