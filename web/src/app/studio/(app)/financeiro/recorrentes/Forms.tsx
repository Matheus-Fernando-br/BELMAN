"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/studio/SubmitButton";
import type { Account, AllocationRule, Category, Counterparty } from "@/lib/studio/finance";
import { generateRecurrences, saveRecurrence } from "../actions";

export function GenerateButton() {
  const [state, action] = useActionState(generateRecurrences, undefined);
  return (
    <form action={action} className="st-actions">
      <SubmitButton variant="ghost" pendingLabel="Gerando…">
        Gerar próximos 6 meses
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function RecurrenceForm({
  entities,
  categories,
  accounts,
  counterparties,
  rules,
  today,
}: {
  entities: { id: string; name: string; kind: string }[];
  categories: Category[];
  accounts: Account[];
  counterparties: Counterparty[];
  rules: AllocationRule[];
  today: string;
}) {
  const [state, action] = useActionState(saveRecurrence, undefined);
  return (
    <form action={action} className="st-form" noValidate>
      <div className="st-row">
        <div className="st-field">
          <label htmlFor="r-type">Tipo</label>
          <select id="r-type" name="type" className="st-input" defaultValue="expense">
            <option value="expense">Despesa</option>
            <option value="income">Receita</option>
          </select>
        </div>
        <div className="st-field">
          <label htmlFor="r-entity">Entidade</label>
          <select id="r-entity" name="entity_id" className="st-input" defaultValue={entities.find((e) => e.kind === "shared")?.id}>
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="st-field">
        <label htmlFor="r-desc">Descrição</label>
        <input id="r-desc" name="description" maxLength={140} placeholder="Ex.: Render — API Obra Fácil" className="st-input" />
      </div>
      <div className="st-row">
        <div className="st-field">
          <label htmlFor="r-amount">Valor (R$)</label>
          <input id="r-amount" name="amount" inputMode="decimal" placeholder="0,00" className="st-input" />
        </div>
        <div className="st-field">
          <label htmlFor="r-freq">Frequência</label>
          <select id="r-freq" name="frequency" className="st-input">
            <option value="monthly">Mensal</option>
            <option value="yearly">Anual</option>
          </select>
        </div>
        <div className="st-field">
          <label htmlFor="r-day">Dia do vencimento</label>
          <input id="r-day" name="day_of_month" type="number" min={1} max={28} defaultValue={5} className="st-input" />
        </div>
        <div className="st-field">
          <label htmlFor="r-start">Início</label>
          <input id="r-start" name="start_date" type="date" defaultValue={today} className="st-input" />
        </div>
        <div className="st-field">
          <label htmlFor="r-end">Fim (opcional)</label>
          <input id="r-end" name="end_date" type="date" className="st-input" />
        </div>
        <div className="st-field">
          <label htmlFor="r-cat">Categoria</label>
          <select id="r-cat" name="category_id" className="st-input">
            <option value="">Sem categoria</option>
            {categories
              .filter((c) => c.active)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.type === "income" ? "Receita · " : ""}
                  {c.name}
                </option>
              ))}
          </select>
        </div>
        <div className="st-field">
          <label htmlFor="r-party">Fornecedor/cliente</label>
          <select id="r-party" name="counterparty_id" className="st-input">
            <option value="">Nenhum</option>
            {counterparties.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="st-field">
          <label htmlFor="r-acc">Conta</label>
          <select id="r-acc" name="account_id" className="st-input">
            <option value="">Não informada</option>
            {accounts
              .filter((a) => a.active)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
        </div>
      </div>
      <div className="st-field">
        <label htmlFor="r-rule">Rateio</label>
        <select id="r-rule" name="allocation_rule_id" className="st-input" defaultValue={rules[0]?.id ?? ""}>
          <option value="">Sem rateio</option>
          {rules
            .filter((r) => r.active)
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
        </select>
      </div>
      <label className="st-check">
        <input type="checkbox" name="is_infrastructure" />
        Custo de infraestrutura (Render, Vercel, banco, e-mail, domínio, Google Play, API de IA…)
      </label>
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Salvando…">Criar recorrência</SubmitButton>
    </form>
  );
}
