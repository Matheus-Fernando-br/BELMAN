"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/studio/SubmitButton";
import { addInteraction, cancelContract, winLead } from "./actions";

export function WinForm({ leadId, today, suggested }: { leadId: string; today: string; suggested: string }) {
  const [state, action] = useActionState(winLead, undefined);
  return (
    <form action={action} className="st-form" noValidate>
      <input type="hidden" name="lead_id" value={leadId} />
      <div className="st-row">
        <div className="st-field">
          <label htmlFor="w-plan">Plano</label>
          <input id="w-plan" name="plan" className="st-input" placeholder="Profissional" />
        </div>
        <div className="st-field">
          <label htmlFor="w-value">Valor (R$)</label>
          <input id="w-value" name="value" inputMode="decimal" defaultValue={suggested} className="st-input" />
        </div>
        <div className="st-field">
          <label htmlFor="w-cycle">Cobrança</label>
          <select id="w-cycle" name="cycle" className="st-input">
            <option value="monthly">Mensal</option>
            <option value="yearly">Anual</option>
            <option value="one_time">Pagamento único</option>
          </select>
        </div>
        <div className="st-field">
          <label htmlFor="w-start">Início</label>
          <input id="w-start" name="start_date" type="date" defaultValue={today} className="st-input" />
        </div>
        <div className="st-field">
          <label htmlFor="w-months">Meses a lançar (mensal)</label>
          <input id="w-months" name="months" type="number" min={1} max={24} defaultValue={12} className="st-input" />
        </div>
      </div>
      <p className="st-hint">Cria o cliente (Operações), o contrato e as contas a receber (Financeiro), e inicia o onboarding.</p>
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Concluindo…">Concluir venda</SubmitButton>
    </form>
  );
}

export function InteractionForm({ leadId }: { leadId: string }) {
  const [state, action] = useActionState(addInteraction, undefined);
  return (
    <form action={action} className="st-form" noValidate>
      <input type="hidden" name="lead_id" value={leadId} />
      <div className="st-row">
        <div className="st-field">
          <label htmlFor="i-kind">Tipo</label>
          <select id="i-kind" name="kind" className="st-input">
            {["ligação", "whatsapp", "e-mail", "reunião", "demonstração", "nota"].map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="st-field">
        <label htmlFor="i-sum">O que aconteceu</label>
        <textarea id="i-sum" name="summary" rows={3} maxLength={2000} className="st-input" />
      </div>
      <FormMessage state={state} />
      <SubmitButton variant="ghost" pendingLabel="Salvando…">
        Registrar interação
      </SubmitButton>
    </form>
  );
}

export function CancelContractForm({ id }: { id: string }) {
  const [state, action] = useActionState(cancelContract, undefined);
  return (
    <form action={action} className="st-actions">
      <input type="hidden" name="id" value={id} />
      <input name="reason" placeholder="Motivo" className="st-input" style={{ maxWidth: "12rem", minHeight: "2rem", padding: "0.2rem 0.5rem" }} aria-label="Motivo do cancelamento" />
      <SubmitButton variant="danger" pendingLabel="…">
        Cancelar
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
