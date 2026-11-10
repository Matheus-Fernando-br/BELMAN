import type { Metadata } from "next";
import { LineChart, StackedColumns } from "@/components/studio/charts";
import { brl } from "@/lib/studio/format";
import { Icon } from "@/components/studio/Icon";
import { CONSOLIDATED, filterOptions, resolveFilter } from "@/lib/studio/filter";
import { sampleDashboard } from "@/lib/studio/sample-data";
import { requireStudio, type Entity } from "@/lib/studio/session";

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
          <strong>Dados de exemplo.</strong> Os números reais entram a partir da Fase 1 (financeiro) e da Fase 3
          (vendas e métricas dos produtos).
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
            <dt>Clientes ativos</dt>
            <dd>{data.kpis.customers.toLocaleString("pt-BR")}</dd>
            <Delta now={data.kpis.customers} prev={data.kpis.prevCustomers} />
          </div>
          <div className="st-kpi">
            <dt>MRR</dt>
            <dd>{brl(data.kpis.mrr)}</dd>
            <span className="st-delta">receita recorrente mensal</span>
          </div>
        </dl>
      ) : (
        <dl className="st-kpis">
          <div className="st-kpi">
            <dt>Clientes ativos</dt>
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
            <span>ativos no fim do mês</span>
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
