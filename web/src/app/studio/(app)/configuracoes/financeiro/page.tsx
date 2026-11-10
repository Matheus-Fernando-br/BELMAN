import type { Metadata } from "next";
import { loadLookups, requireFinance, todayISO } from "@/lib/studio/finance";
import { formatCents } from "@/lib/studio/finance-math";
import { AccountForm, CategoryForm, RuleForm } from "./Forms";

export const metadata: Metadata = { title: "Configurações do Financeiro" };

export default async function FinanceSettingsPage() {
  const ctx = await requireFinance();
  const { categories, accounts, rules } = await loadLookups();
  const entities = ctx.entities.map((e) => ({ id: e.id, name: e.name, color: e.color }));
  const nameOf = new Map(ctx.entities.map((e) => [e.id, e.name]));
  const today = todayISO();

  return (
    <div className="st-grid">
      <section className="st-grid" data-cols="2-1" aria-labelledby="contas-title">
        <article className="st-card">
          <h2 id="contas-title">Contas e saldo inicial</h2>
          <p className="st-hint">O saldo em caixa parte destes valores e soma os lançamentos realizados.</p>
          {accounts.map((a) => (
            <details key={a.id} className="st-card" style={{ background: "#fafaf9" }}>
              <summary style={{ cursor: "pointer", display: "flex", gap: "0.75rem" }}>
                <strong style={{ flex: 1 }}>{a.name}</strong>
                <span className="st-hint">{nameOf.get(a.entity_id)}</span>
                <span>{formatCents(a.opening_balance_cents)}</span>
              </summary>
              <div style={{ marginTop: "1rem" }}>
                <AccountForm account={a} entities={entities} today={today} />
              </div>
            </details>
          ))}
          {!accounts.length && <p className="st-hint">Nenhuma conta cadastrada.</p>}
        </article>
        <article className="st-card">
          <h2>Nova conta</h2>
          <AccountForm entities={entities} today={today} />
        </article>
      </section>

      <section className="st-grid" data-cols="2-1" aria-labelledby="rateio-title">
        <article className="st-card">
          <h2 id="rateio-title">Regras de rateio</h2>
          <p className="st-hint">Custos compartilhados (hospedagem, ferramentas, contador) são divididos entre as entidades por estes percentuais.</p>
          {rules.map((r) => (
            <details key={r.id} className="st-card" style={{ background: "#fafaf9" }}>
              <summary style={{ cursor: "pointer", display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                <strong style={{ flex: 1 }}>{r.name}</strong>
                <span className="st-hint">{r.shares.map((s) => `${nameOf.get(s.entity_id)} ${s.percent.toLocaleString("pt-BR")}%`).join(" · ")}</span>
              </summary>
              <div style={{ marginTop: "1rem" }}>
                <RuleForm rule={r} entities={entities} />
              </div>
            </details>
          ))}
        </article>
        <article className="st-card">
          <h2>Nova regra</h2>
          <RuleForm entities={entities} />
        </article>
      </section>

      <section className="st-grid" data-cols="2-1" aria-labelledby="cat-title">
        <article className="st-card">
          <h2 id="cat-title">Categorias</h2>
          <p className="st-hint">Marque como “custo fixo” o que não varia com as vendas: entra no cálculo do ponto de equilíbrio.</p>
          {(["income", "expense"] as const).map((type) => (
            <div key={type} className="st-grid">
              <p className="st-eyebrow">{type === "income" ? "Receitas" : "Despesas"}</p>
              {categories
                .filter((c) => c.type === type)
                .map((c) => (
                  <details key={c.id} className="st-card" style={{ background: "#fafaf9", opacity: c.active ? 1 : 0.6 }}>
                    <summary style={{ cursor: "pointer", display: "flex", gap: "0.75rem" }}>
                      <strong style={{ flex: 1 }}>{c.name}</strong>
                      <span className="st-hint">
                        {c.group_name}
                        {c.is_fixed ? " · fixo" : ""}
                        {c.active ? "" : " · inativa"}
                      </span>
                    </summary>
                    <div style={{ marginTop: "1rem" }}>
                      <CategoryForm category={c} />
                    </div>
                  </details>
                ))}
            </div>
          ))}
        </article>
        <article className="st-card">
          <h2>Nova categoria</h2>
          <CategoryForm />
        </article>
      </section>
    </div>
  );
}
