"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { LineChart } from "@/components/studio/charts";
import { FormMessage } from "@/components/studio/SubmitButton";
import {
  distribute,
  EXPENSE_GROUPS,
  expensesByGroup,
  monthlyOf,
  planPrice,
  planSubscribers,
  projectProduct,
  splitOf,
  sumMonths,
  totals,
  withDefaults,
  type Base,
  type Config,
  type ExpenseGroup,
} from "@/lib/studio/planning-math";
import { createScenario, deleteScenario, saveScenario } from "./actions";

type Scenario = { id: string; name: string; kind: string; config: Partial<Config> };
type State = { error?: string; message?: string } | undefined;

const brl = (cents: number, whole = true) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: whole ? 0 : 2, minimumFractionDigits: whole ? 0 : 2 });
const pct = (v: number | null) => (v == null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
const toCents = (v: string) => Math.round(Number(v.replace(",", ".")) * 100);
const reais = (c: number | undefined) => (c == null ? "" : String(Math.round(c) / 100));

function Num({ value, onChange, step = 1, min, suffix, label, width = "6.5rem" }: { value: number | string; onChange: (v: string) => void; step?: number; min?: number; suffix?: string; label: string; width?: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <input type="number" inputMode="decimal" className="st-input" aria-label={label} value={value} step={step} min={min} onChange={(e) => onChange(e.target.value)} style={{ width, minHeight: "2.2rem", padding: "0.3rem 0.5rem" }} />
      {suffix && <span className="st-hint">{suffix}</span>}
    </span>
  );
}

export function PlanningApp({ base, scenarios, initialId, initialView }: { base: Base; scenarios: Scenario[]; initialId: string; initialView: string }) {
  const router = useRouter();
  const [id, setId] = useState(initialId);
  const current = scenarios.find((s) => s.id === id) ?? scenarios[0];
  const [config, setConfig] = useState<Config>(() => withDefaults(current?.config));
  const [dirty, setDirty] = useState(false);
  const [view, setView] = useState(initialView);
  const [state, setState] = useState<State>();
  const [busy, start] = useTransition();
  const [newName, setNewName] = useState("");

  const patch = (p: Partial<Config>) => {
    setConfig((c) => ({ ...c, ...p }));
    setDirty(true);
  };
  const pickScenario = (sid: string) => {
    if (dirty && !confirm("Há mudanças não salvas neste cenário. Trocar mesmo assim?")) return;
    const s = scenarios.find((x) => x.id === sid);
    setId(sid);
    setConfig(withDefaults(s?.config));
    setDirty(false);
    setState(undefined);
  };

  const viewProducts = view === "consolidado" ? base.products : base.products.filter((p) => p.slug === view);
  const perProduct = useMemo(() => Object.fromEntries(base.products.map((p) => [p.slug, projectProduct(base, config, p.slug)])), [base, config]);
  const months = useMemo(() => sumMonths(viewProducts.map((p) => perProduct[p.slug])), [viewProducts, perProduct]);
  const t = totals(months);
  const first = months[0];
  const last = months.at(-1);
  const H = config.horizon;
  const dist = distribute(t.net, config, H);
  const distMonth = distribute(Math.round(t.net / H), config, 1);
  const split = splitOf(base, config);

  const comparison = useMemo(
    () =>
      scenarios.map((s) => {
        const c = s.id === id ? config : withDefaults(s.config);
        return {
          s,
          rows: ([12, 24, 36] as const).map((h) => {
            const cc = { ...c, horizon: h };
            return totals(sumMonths(viewProducts.map((p) => projectProduct(base, cc, p.slug))));
          }),
        };
      }),
    [scenarios, id, config, base, viewProducts],
  );

  const act = (fn: () => Promise<{ error?: string; message?: string; id?: string } | undefined>, after?: (r: { error?: string; message?: string; id?: string } | undefined) => void) =>
    start(async () => {
      const r = await fn();
      setState(r);
      if (!r?.error) {
        setDirty(false);
        after?.(r);
        router.refresh();
      }
    });

  const setPlan = (planId: string, key: "subscribers" | "priceCents", v: string) =>
    patch({ plans: { ...config.plans, [planId]: { ...config.plans[planId], [key]: v === "" ? undefined : key === "priceCents" ? toCents(v) : Math.max(0, Number(v)) } } });
  const setOverride = (slug: string, g: ExpenseGroup, v: string) =>
    patch({ expenseOverride: { ...config.expenseOverride, [slug]: { ...config.expenseOverride[slug], [g]: v === "" ? undefined : toCents(v) } } });

  const labels = months.map((m) => `M${m.index}`);

  return (
    <>
      {/* barra do cenário */}
      <div className="st-card" style={{ position: "sticky", top: "calc(var(--st-top) + 0.5rem)", zIndex: 5, gap: "0.6rem" }}>
        <div className="st-actions" style={{ gap: "0.5rem" }}>
          <label className="st-check" style={{ fontWeight: 700 }}>
            Cenário
            <select className="st-input" style={{ width: "auto" }} value={id} onChange={(e) => pickScenario(e.target.value)}>
              {scenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="st-btn" disabled={!dirty || busy} onClick={() => act(() => saveScenario(id, config))}>
            {busy ? "Salvando…" : dirty ? "Salvar mudanças" : "Salvo"}
          </button>
          <input className="st-input" style={{ width: "11rem" }} placeholder="Nome do novo cenário" value={newName} onChange={(e) => setNewName(e.target.value)} aria-label="Nome do novo cenário" />
          <button type="button" className="st-btn" data-variant="ghost" disabled={busy} onClick={() => act(() => createScenario(newName, config), (r) => { if (r?.id) { setId(r.id); setNewName(""); } })}>
            Salvar como novo
          </button>
          {scenarios.length > 1 && (
            <button type="button" className="st-btn" data-variant="danger" disabled={busy} onClick={() => confirm(`Excluir o cenário "${current?.name}"?`) && act(() => deleteScenario(id), () => setId(scenarios.find((s) => s.id !== id)!.id))}>
              Excluir
            </button>
          )}
          <span style={{ marginLeft: "auto" }} className="st-actions">
            {[["consolidado", "Consolidado"], ...base.products.map((p) => [p.slug, p.name])].map(([v, l]) => (
              <button key={v} type="button" className="st-tag" aria-current={view === v ? "true" : undefined} onClick={() => setView(v)} style={{ cursor: "pointer" }}>
                {l}
              </button>
            ))}
            {([12, 24, 36] as const).map((h) => (
              <button key={h} type="button" className="st-tag" aria-current={H === h ? "true" : undefined} onClick={() => patch({ horizon: h })} style={{ cursor: "pointer" }}>
                {h} meses
              </button>
            ))}
          </span>
        </div>
        <FormMessage state={state} />
        <nav className="st-actions st-hint" aria-label="Seções">
          <a href="#visao">Visão geral</a>·<a href="#faturamento">Faturamento</a>·<a href="#despesas">Despesas</a>·<a href="#resultado">Resultado</a>·<a href="#socios">Sócios</a>·<a href="#cenarios">Cenários</a>
        </nav>
      </div>

      {/* 1. visão geral */}
      <section id="visao" style={{ scrollMarginTop: "9rem" }}>
        <dl className="st-kpis" style={{ marginTop: "1rem" }}>
          <div className="st-kpi">
            <dt>Faturamento projetado ({H} meses)</dt>
            <dd>{brl(t.revenue)}</dd>
            <span className="st-delta">
              mês 1: {brl(first?.revenue ?? 0)} → mês {H}: {brl(last?.revenue ?? 0)}
            </span>
          </div>
          <div className="st-kpi">
            <dt>Despesas totais</dt>
            <dd>{brl(t.expenses + t.taxes)}</dd>
            <span className="st-delta">
              {brl(t.expenses)} de despesas + {brl(t.taxes)} de impostos
            </span>
          </div>
          <div className="st-kpi">
            <dt>Lucro líquido</dt>
            <dd style={{ color: t.net < 0 ? "var(--st-bad)" : undefined }}>{brl(t.net)}</dd>
            <span className="st-delta">média de {brl(Math.round(t.net / H))} por mês</span>
          </div>
          <div className="st-kpi">
            <dt>Margem líquida</dt>
            <dd>{pct(t.margin)}</dd>
            <span className="st-delta">{Math.round(last?.subscribers ?? 0)} assinantes no mês {H}</span>
          </div>
        </dl>
        <article className="st-card">
          <LineChart
            title={`Faturamento e despesas por mês (${viewProducts.map((p) => p.name).join(" + ")})`}
            labels={labels}
            series={[
              { label: "Faturamento", color: "#16a34a", values: months.map((m) => m.revenue / 100) },
              { label: "Despesas + impostos", color: "#dc2626", values: months.map((m) => (m.expenses + m.taxes) / 100) },
            ]}
          />
        </article>
      </section>

      {/* 2. faturamento */}
      <section id="faturamento" style={{ scrollMarginTop: "9rem" }}>
        <h2 style={{ margin: "2rem 0 0.5rem" }}>Projeção de faturamento</h2>
        <div className="st-actions">
          <span>Crescimento de assinantes</span>
          <Num label="Crescimento ao mês" value={config.growthPct} onChange={(v) => patch({ growthPct: Number(v) })} step={0.5} suffix="% ao mês" />
          <span>Cancelamentos</span>
          <Num label="Cancelamentos ao mês" value={config.churnPct} onChange={(v) => patch({ churnPct: Number(v) })} step={0.5} min={0} suffix="% ao mês" />
        </div>
        {viewProducts.map((p) => {
          const plans = base.plans.filter((x) => x.entity === p.slug);
          const m1 = perProduct[p.slug][0];
          return (
            <article key={p.slug} className="st-card" style={{ marginTop: "1rem" }}>
              <div className="st-card-head">
                <h3 style={{ margin: 0 }}>
                  <span className="st-dot" style={{ background: p.color }} aria-hidden="true" /> {p.name}
                </h3>
                <Link href={`/studio/produtos/${p.slug}#planos`}>Planos e preços</Link>
              </div>
              <div className="st-table-wrap">
                <table className="st-table">
                  <thead>
                    <tr>
                      <th scope="col">Plano</th>
                      <th scope="col">Preço</th>
                      <th scope="col" style={{ textAlign: "right" }}>
                        Assinantes hoje
                      </th>
                      <th scope="col">Assinantes no cenário</th>
                      <th scope="col" style={{ textAlign: "right" }}>
                        Receita mensal
                      </th>
                      <th scope="col" style={{ textAlign: "right" }}>
                        Receita anual
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {plans.map((pl) => {
                      const price = planPrice(pl, config);
                      const subs = planSubscribers(pl, config);
                      const overridden = config.plans[pl.id]?.priceCents != null;
                      return (
                        <tr key={pl.id}>
                          <th scope="row">
                            {pl.name}
                            <div className="st-hint">
                              {pl.source === "sync" ? `preço vindo do ${p.name}` : pl.source === "snapshot" ? "do último retrato do produto" : "cadastrado no Studio"}
                              {pl.billing === "yearly" ? " · anual" : ""}
                            </div>
                          </th>
                          <td>
                            <Num label={`Preço do plano ${pl.name}`} value={reais(price)} onChange={(v) => setPlan(pl.id, "priceCents", v)} step={0.01} min={0} />
                            {overridden && (
                              <div className="st-hint">
                                oficial {brl(pl.priceCents, false)}{" "}
                                <button type="button" className="st-linkbtn" onClick={() => setPlan(pl.id, "priceCents", "")}>
                                  voltar
                                </button>
                              </div>
                            )}
                          </td>
                          <td className="st-num">{pl.subscribers}</td>
                          <td>
                            <Num label={`Assinantes do plano ${pl.name}`} value={subs} onChange={(v) => setPlan(pl.id, "subscribers", v)} min={0} />
                          </td>
                          <td className="st-num">{brl(Math.round(subs * monthlyOf(pl, config)))}</td>
                          <td className="st-num">{brl(Math.round(subs * monthlyOf(pl, config) * 12))}</td>
                        </tr>
                      );
                    })}
                    {!plans.length && (
                      <tr>
                        <td colSpan={6}>
                          Nenhum plano cadastrado. <Link href={`/studio/produtos/${p.slug}#planos`}>Cadastrar planos e preços</Link>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="st-hint">
                Mês 1: {brl(m1?.revenue ?? 0)} · total em {H} meses: {brl(perProduct[p.slug].reduce((s, m) => s + m.revenue, 0))}
                {base.revenueActual[p.slug] ? ` · receita realizada hoje: ${brl(Math.round(base.revenueActual[p.slug]))}/mês (Financeiro)` : ""}
              </p>
            </article>
          );
        })}
      </section>

      {/* 3. despesas */}
      <section id="despesas" style={{ scrollMarginTop: "9rem" }}>
        <h2 style={{ margin: "2rem 0 0.5rem" }}>Projeção de despesas</h2>
        <p className="st-hint" style={{ marginTop: 0 }}>
          “Financeiro” é a média mensal de {base.baseMonths.join(", ")} (pagas e previstas), por empresa. Mudar um valor aqui é só hipótese: o Financeiro não muda.
        </p>
        <div className="st-actions">
          <span>Despesas aumentam</span>
          <Num label="Aumento das despesas" value={config.expenseGrowthPct} onChange={(v) => patch({ expenseGrowthPct: Number(v) })} step={0.5} suffix="% ao mês" />
          <span style={{ marginLeft: "1rem" }}>Rateio das despesas da holding e compartilhadas:</span>
          {base.products.map((p) => (
            <Num key={p.slug} label={`Rateio ${p.name}`} value={Math.round(split[p.slug] * 1000) / 10} onChange={(v) => patch({ split: { ...config.split, [p.slug]: Number(v) } })} step={1} min={0} suffix={`% ${p.name}`} width="5rem" />
          ))}
        </div>
        <div className="st-table-wrap" style={{ marginTop: "1rem" }}>
          <table className="st-table">
            <thead>
              <tr>
                <th scope="col">Grupo</th>
                {viewProducts.map((p) => (
                  <th key={p.slug} scope="col">
                    {p.name} (próprias)
                  </th>
                ))}
                <th scope="col">Holding e compartilhadas</th>
                <th scope="col" style={{ textAlign: "right" }}>
                  Total no mês 1 ({viewProducts.map((p) => p.name).join(" + ")})
                </th>
              </tr>
            </thead>
            <tbody>
              {EXPENSE_GROUPS.map(([g, l]) => {
                const total = viewProducts.reduce((s, p) => s + expensesByGroup(base, config, p.slug)[g], 0);
                return (
                  <tr key={g}>
                    <th scope="row">{l}</th>
                    {viewProducts.map((p) => {
                      const off = Math.round(base.expenses[p.slug]?.[g] ?? 0);
                      const ov = config.expenseOverride[p.slug]?.[g];
                      return (
                        <td key={p.slug}>
                          <Num label={`${l} ${p.name}`} value={reais(ov ?? off)} onChange={(v) => setOverride(p.slug, g, v)} step={10} min={0} />
                          <div className="st-hint">Financeiro: {brl(off)}</div>
                        </td>
                      );
                    })}
                    <td>
                      <Num label={`${l} compartilhadas`} value={reais(config.expenseOverride.shared?.[g] ?? Math.round(base.shared[g] ?? 0))} onChange={(v) => setOverride("shared", g, v)} step={10} min={0} />
                      <div className="st-hint">Financeiro: {brl(Math.round(base.shared[g] ?? 0))}</div>
                    </td>
                    <td className="st-num">{brl(total)}</td>
                  </tr>
                );
              })}
              <tr>
                <th scope="row">Impostos</th>
                <td colSpan={viewProducts.length + 1}>
                  <Num label="Impostos sobre o faturamento" value={config.taxPct} onChange={(v) => patch({ taxPct: Number(v) })} step={0.5} min={0} suffix="% do faturamento" />
                  <span className="st-hint">
                    {" "}
                    No Financeiro hoje: {brl(Math.round(viewProducts.reduce((s, p) => s + (base.taxesActual[p.slug] ?? 0), 0)))}/mês (referência)
                  </span>
                </td>
                <td className="st-num">{brl(first?.taxes ?? 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <article className="st-card" style={{ marginTop: "1rem" }}>
          <h3 style={{ margin: 0 }}>Despesas hipotéticas</h3>
          <p className="st-hint" style={{ margin: 0 }}>
            Para testar cenários (ex.: contratar alguém, um anúncio novo). Não entram no Financeiro.
          </p>
          {config.hypothetical.map((h, i) => (
            <div key={h.id} className="st-actions">
              <input className="st-input" style={{ maxWidth: 220 }} aria-label="Descrição" value={h.name} onChange={(e) => patch({ hypothetical: config.hypothetical.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
              <select className="st-input" style={{ width: "auto" }} aria-label="Empresa" value={h.entity} onChange={(e) => patch({ hypothetical: config.hypothetical.map((x, j) => (j === i ? { ...x, entity: e.target.value } : x)) })}>
                {base.products.map((p) => (
                  <option key={p.slug} value={p.slug}>
                    {p.name}
                  </option>
                ))}
                <option value="shared">Compartilhada (rateio)</option>
              </select>
              <select className="st-input" style={{ width: "auto" }} aria-label="Grupo" value={h.group} onChange={(e) => patch({ hypothetical: config.hypothetical.map((x, j) => (j === i ? { ...x, group: e.target.value as ExpenseGroup } : x)) })}>
                {EXPENSE_GROUPS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <Num label="Valor mensal" value={reais(h.monthlyCents)} onChange={(v) => patch({ hypothetical: config.hypothetical.map((x, j) => (j === i ? { ...x, monthlyCents: toCents(v || "0") } : x)) })} step={10} min={0} suffix="R$/mês" />
              <button type="button" className="st-linkbtn" onClick={() => patch({ hypothetical: config.hypothetical.filter((_, j) => j !== i) })}>
                remover
              </button>
            </div>
          ))}
          <div>
            <button
              type="button"
              className="st-btn"
              data-variant="ghost"
              onClick={() => patch({ hypothetical: [...config.hypothetical, { id: Math.random().toString(36).slice(2), entity: viewProducts[0]?.slug ?? "shared", group: "marketing", name: "Nova despesa", monthlyCents: 0 }] })}
            >
              + Adicionar despesa hipotética
            </button>
          </div>
        </article>
      </section>

      {/* 4. resultado */}
      <section id="resultado" style={{ scrollMarginTop: "9rem" }}>
        <h2 style={{ margin: "2rem 0 0.5rem" }}>Resultado financeiro</h2>
        <div className="st-table-wrap">
          <table className="st-table">
            <thead>
              <tr>
                <th scope="col" />
                <th scope="col" style={{ textAlign: "right" }}>
                  Mês 1
                </th>
                <th scope="col" style={{ textAlign: "right" }}>
                  Mês {H}
                </th>
                <th scope="col" style={{ textAlign: "right" }}>
                  Média mensal
                </th>
                <th scope="col" style={{ textAlign: "right" }}>
                  Total em {H} meses
                </th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["Faturamento bruto", "revenue", 1],
                  ["Impostos", "taxes", -1],
                  ["Despesas", "expenses", -1],
                  ["Lucro líquido", "net", 1],
                ] as const
              ).map(([l, k, sign]) => (
                <tr key={k}>
                  <th scope="row" style={{ fontWeight: k === "net" ? 800 : undefined }}>
                    {l}
                  </th>
                  {[first?.[k] ?? 0, last?.[k] ?? 0, Math.round(t[k] / H), t[k]].map((v, i) => (
                    <td key={i} className="st-num" style={{ color: k === "net" && v < 0 ? "var(--st-bad)" : undefined, fontWeight: k === "net" ? 800 : undefined }}>
                      {sign < 0 ? `- ${brl(v)}` : brl(v)}
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <th scope="row">Margem líquida</th>
                <td className="st-num">{pct(first?.revenue ? (first.net / first.revenue) * 100 : null)}</td>
                <td className="st-num">{pct(last?.revenue ? (last.net / last.revenue) * 100 : null)}</td>
                <td className="st-num" colSpan={2}>
                  {pct(t.margin)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* 5. sócios */}
      <section id="socios" style={{ scrollMarginTop: "9rem" }}>
        <h2 style={{ margin: "2rem 0 0.5rem" }}>Distribuição entre os sócios</h2>
        <div className="st-grid" data-cols="2">
          <article className="st-card">
            <h3 style={{ margin: 0 }}>Regras</h3>
            <div className="st-actions">
              <span>Reserva da empresa</span>
              <Num label="Reserva" value={config.reservePct} onChange={(v) => patch({ reservePct: Number(v) })} min={0} suffix="% do lucro" />
            </div>
            <strong>Participação dos sócios</strong>
            {config.partners.map((p, i) => (
              <div key={i} className="st-actions">
                <input className="st-input" style={{ maxWidth: 200 }} aria-label="Nome do sócio" value={p.name} onChange={(e) => patch({ partners: config.partners.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                <Num label={`Participação de ${p.name}`} value={p.pct} onChange={(v) => patch({ partners: config.partners.map((x, j) => (j === i ? { ...x, pct: Number(v) } : x)) })} step={0.01} min={0} suffix="%" />
              </div>
            ))}
            {Math.abs(dist.partnersPctTotal - 100) > 0.05 && <p className="st-alert">As participações somam {pct(dist.partnersPctTotal)}. O cálculo divide na proporção, mas o ideal é somar 100%.</p>}
            <strong>Gratificações e bonificações</strong>
            {config.bonuses.map((b, i) => (
              <div key={i} className="st-actions">
                <input className="st-input" style={{ maxWidth: 180 }} aria-label="Nome da gratificação" value={b.name} onChange={(e) => patch({ bonuses: config.bonuses.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                <select className="st-input" style={{ width: "auto" }} aria-label="Tipo" value={b.kind} onChange={(e) => patch({ bonuses: config.bonuses.map((x, j) => (j === i ? { ...x, kind: e.target.value as "pct" | "fixed" } : x)) })}>
                  <option value="pct">% do lucro após reserva</option>
                  <option value="fixed">R$ por mês</option>
                </select>
                <Num label="Valor" value={b.kind === "fixed" ? reais(b.value) : b.value} onChange={(v) => patch({ bonuses: config.bonuses.map((x, j) => (j === i ? { ...x, value: x.kind === "fixed" ? toCents(v || "0") : Number(v) } : x)) })} step={b.kind === "fixed" ? 10 : 0.5} min={0} />
                <button type="button" className="st-linkbtn" onClick={() => patch({ bonuses: config.bonuses.filter((_, j) => j !== i) })}>
                  remover
                </button>
              </div>
            ))}
            <div className="st-actions">
              <button type="button" className="st-btn" data-variant="ghost" onClick={() => patch({ bonuses: [...config.bonuses, { name: "Gratificação", kind: "pct", value: 5 }] })}>
                + Gratificação
              </button>
              <button type="button" className="st-btn" data-variant="ghost" onClick={() => patch({ partners: [...config.partners, { name: `Sócio ${config.partners.length + 1}`, pct: 0 }] })}>
                + Sócio
              </button>
            </div>
          </article>
          <article className="st-card">
            <h3 style={{ margin: 0 }}>Quanto cada um recebe ({viewProducts.map((p) => p.name).join(" + ")})</h3>
            <div className="st-table-wrap">
              <table className="st-table">
                <thead>
                  <tr>
                    <th scope="col" />
                    <th scope="col" style={{ textAlign: "right" }}>
                      Por mês (média)
                    </th>
                    <th scope="col" style={{ textAlign: "right" }}>
                      Em {H} meses
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">Lucro líquido</th>
                    <td className="st-num">{brl(distMonth.profit)}</td>
                    <td className="st-num">{brl(dist.profit)}</td>
                  </tr>
                  <tr>
                    <th scope="row">Reserva da empresa ({pct(config.reservePct)})</th>
                    <td className="st-num">- {brl(distMonth.reserve)}</td>
                    <td className="st-num">- {brl(dist.reserve)}</td>
                  </tr>
                  {dist.bonuses.map((b, i) => (
                    <tr key={i}>
                      <th scope="row">{b.name}</th>
                      <td className="st-num">- {brl(distMonth.bonuses[i]?.amount ?? 0)}</td>
                      <td className="st-num">- {brl(b.amount)}</td>
                    </tr>
                  ))}
                  <tr>
                    <th scope="row" style={{ fontWeight: 800 }}>
                      Disponível para os sócios
                    </th>
                    <td className="st-num" style={{ fontWeight: 800 }}>
                      {brl(distMonth.distributable)}
                    </td>
                    <td className="st-num" style={{ fontWeight: 800 }}>
                      {brl(dist.distributable)}
                    </td>
                  </tr>
                  {dist.partners.map((p, i) => (
                    <tr key={i}>
                      <th scope="row">
                        {p.name} ({pct(p.pct)})
                      </th>
                      <td className="st-num">{brl(distMonth.partners[i]?.amount ?? 0)}</td>
                      <td className="st-num">{brl(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {t.net <= 0 && <p className="st-alert">Neste cenário não há lucro para distribuir no período.</p>}
          </article>
        </div>
      </section>

      {/* 6. cenários */}
      <section id="cenarios" style={{ scrollMarginTop: "9rem" }}>
        <h2 style={{ margin: "2rem 0 0.5rem" }}>Comparar cenários</h2>
        <div className="st-table-wrap">
          <table className="st-table">
            <thead>
              <tr>
                <th scope="col">Cenário</th>
                <th scope="col">Premissas</th>
                {[12, 24, 36].map((h) => (
                  <th key={h} scope="col" style={{ textAlign: "right" }}>
                    {h} meses: faturamento / lucro
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparison.map(({ s, rows }) => {
                const c = s.id === id ? config : withDefaults(s.config);
                return (
                  <tr key={s.id} style={{ background: s.id === id ? "var(--st-bg)" : undefined }}>
                    <th scope="row">
                      <button type="button" className="st-linkbtn" onClick={() => pickScenario(s.id)}>
                        {s.name}
                      </button>
                    </th>
                    <td className="st-hint">
                      +{c.growthPct}% / -{c.churnPct}% ao mês · impostos {c.taxPct}% · reserva {c.reservePct}%
                    </td>
                    {rows.map((r, i) => (
                      <td key={i} className="st-num">
                        {brl(r.revenue)}
                        <div style={{ color: r.net < 0 ? "var(--st-bad)" : "var(--st-ok)" }}>{brl(r.net)}</div>
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="st-hint">Valores do que está selecionado em cima ({viewProducts.map((p) => p.name).join(" + ")}). O cenário aberto entra com as mudanças ainda não salvas.</p>
      </section>
    </>
  );
}
