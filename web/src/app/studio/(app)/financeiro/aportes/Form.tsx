"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/studio/SubmitButton";
import { saveContribution } from "../actions";

export function ContributionForm({ entities, accounts, today }: { entities: { id: string; name: string }[]; accounts: { id: string; name: string }[]; today: string }) {
  const [state, action] = useActionState(saveContribution, undefined);
  return (
    <form action={action} className="st-form" noValidate>
      <div className="st-row">
        <div className="st-field">
          <label htmlFor="a-partner">Sócio</label>
          <input id="a-partner" name="partner_name" maxLength={80} className="st-input" />
        </div>
        <div className="st-field">
          <label htmlFor="a-kind">Movimento</label>
          <select id="a-kind" name="kind" className="st-input">
            <option value="contribution">Aporte (entrada de capital)</option>
            <option value="withdrawal">Retirada / pró-labore</option>
          </select>
        </div>
        <div className="st-field">
          <label htmlFor="a-entity">Entidade</label>
          <select id="a-entity" name="entity_id" className="st-input">
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
        <div className="st-field">
          <label htmlFor="a-amount">Valor (R$)</label>
          <input id="a-amount" name="amount" inputMode="decimal" placeholder="0,00" className="st-input" />
        </div>
        <div className="st-field">
          <label htmlFor="a-date">Data</label>
          <input id="a-date" name="date" type="date" defaultValue={today} className="st-input" />
        </div>
        <div className="st-field">
          <label htmlFor="a-acc">Conta</label>
          <select id="a-acc" name="account_id" className="st-input">
            <option value="">Não informada</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="st-field">
        <label htmlFor="a-notes">Observações</label>
        <input id="a-notes" name="notes" maxLength={500} className="st-input" />
      </div>
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Salvando…">Registrar</SubmitButton>
    </form>
  );
}
