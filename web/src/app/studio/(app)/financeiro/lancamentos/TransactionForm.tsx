"use client";

import { useActionState, useState } from "react";
import { FormMessage, SubmitButton } from "@/components/studio/SubmitButton";
import type { Account, AllocationRule, Category, Counterparty, TxRow } from "@/lib/studio/finance";
import { centsToInput } from "@/lib/studio/finance-math";
import { saveTransaction } from "../actions";

type EntityOption = { id: string; name: string; kind: string };

export function TransactionForm({
  tx,
  defaults,
  entities,
  categories,
  accounts,
  counterparties,
  rules,
  back,
  today,
}: {
  tx?: TxRow;
  defaults: { type: "income" | "expense"; entityId?: string };
  entities: EntityOption[];
  categories: Category[];
  accounts: Account[];
  counterparties: Counterparty[];
  rules: AllocationRule[];
  back: string;
  today: string;
}) {
  const [state, action] = useActionState(saveTransaction, undefined);
  const [type, setType] = useState<"income" | "expense">(tx?.type ?? defaults.type);
  const [paid, setPaid] = useState(Boolean(tx?.paid_date));
  const [entityId, setEntityId] = useState(tx?.entity_id ?? defaults.entityId ?? entities[0]?.id ?? "");
  const [party, setParty] = useState(tx?.counterparty_id ?? "");
  const isShared = (id: string) => entities.find((e) => e.id === id)?.kind === "shared";
  const shared = isShared(entityId);
  const activeRules = rules.filter((r) => r.active || r.id === tx?.allocation_rule_id);
  const [ruleId, setRuleId] = useState(tx?.allocation_rule_id ?? (isShared(entityId) ? activeRules[0]?.id ?? "" : ""));
  const changeEntity = (id: string) => {
    setEntityId(id);
    // Custos do Compartilhado quase sempre são rateados: sugere a primeira regra.
    if (isShared(id) && !ruleId) setRuleId(activeRules[0]?.id ?? "");
  };
  const cats = categories.filter((c) => c.type === type && (c.active || c.id === tx?.category_id));

  return (
    <form action={action} className="st-form" encType="multipart/form-data" noValidate>
      {tx && <input type="hidden" name="id" value={tx.id} />}
      <input type="hidden" name="back" value={back} />
      <input type="hidden" name="type" value={type} />

      <fieldset className="st-field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend>Tipo</legend>
        <div className="st-actions">
          {(["income", "expense"] as const).map((t) => (
            <button
              key={t}
              type="button"
              className="st-btn"
              data-variant={type === t ? undefined : "ghost"}
              aria-pressed={type === t}
              onClick={() => setType(t)}
            >
              {t === "income" ? "Receita (a receber)" : "Despesa (a pagar)"}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="st-row">
        <div className="st-field">
          <label htmlFor="entity_id">Entidade (dona do lançamento)</label>
          <select id="entity_id" name="entity_id" className="st-input" value={entityId} onChange={(e) => changeEntity(e.target.value)}>
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
        <div className="st-field">
          <label htmlFor="description">Descrição</label>
          <input id="description" name="description" defaultValue={tx?.description} maxLength={140} required className="st-input" placeholder={type === "income" ? "Ex.: Assinatura Pro — Construtora X" : "Ex.: Render — plano Starter"} />
        </div>
      </div>

      <div className="st-row">
        <div className="st-field">
          <label htmlFor="amount">Valor previsto (R$)</label>
          <input id="amount" name="amount" inputMode="decimal" defaultValue={centsToInput(tx?.amount_cents)} placeholder="0,00" required className="st-input" />
        </div>
        <div className="st-field">
          <label htmlFor="due_date">Data prevista</label>
          <input id="due_date" name="due_date" type="date" defaultValue={tx?.due_date ?? today} required className="st-input" />
        </div>
      </div>

      <div className="st-row">
        <div className="st-field">
          <label htmlFor="category_id">Categoria</label>
          <select id="category_id" name="category_id" className="st-input" defaultValue={tx?.category_id ?? ""}>
            <option value="">Sem categoria</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.group_name ? `${c.group_name} · ` : ""}
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="st-field">
          <label htmlFor="account_id">Conta</label>
          <select id="account_id" name="account_id" className="st-input" defaultValue={tx?.account_id ?? ""}>
            <option value="">Não informada</option>
            {accounts
              .filter((a) => a.active || a.id === tx?.account_id)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
        </div>
      </div>

      <div className="st-row">
        <div className="st-field">
          <label htmlFor="counterparty_id">{type === "income" ? "Cliente" : "Fornecedor"}</label>
          <select id="counterparty_id" name="counterparty_id" className="st-input" value={party} onChange={(e) => setParty(e.target.value)}>
            <option value="">Nenhum</option>
            <option value="new">+ Cadastrar novo…</option>
            {counterparties.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        {party === "new" && (
          <div className="st-field">
            <label htmlFor="new_counterparty">Nome do novo {type === "income" ? "cliente" : "fornecedor"}</label>
            <input id="new_counterparty" name="new_counterparty" maxLength={120} className="st-input" autoFocus />
          </div>
        )}
        <div className="st-field">
          <label htmlFor="allocation_rule_id">Rateio {shared ? "(recomendado para Compartilhado)" : "(opcional)"}</label>
          <select id="allocation_rule_id" name="allocation_rule_id" className="st-input" value={ruleId} onChange={(e) => setRuleId(e.target.value)}>
            <option value="">Sem rateio</option>
            {activeRules.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
          </select>
        </div>
      </div>

      <div className="st-card" style={{ background: "#fafaf9" }}>
        <label className="st-check">
          <input type="checkbox" name="paid" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
          {type === "income" ? "Já recebido (realizado)" : "Já pago (realizado)"}
        </label>
        {paid && (
          <div className="st-row">
            <div className="st-field">
              <label htmlFor="paid_date">Data realizada</label>
              <input id="paid_date" name="paid_date" type="date" defaultValue={tx?.paid_date ?? today} className="st-input" />
            </div>
            <div className="st-field">
              <label htmlFor="paid_amount">Valor realizado (R$)</label>
              <input id="paid_amount" name="paid_amount" inputMode="decimal" defaultValue={centsToInput(tx?.paid_amount_cents)} placeholder="igual ao previsto" className="st-input" />
            </div>
          </div>
        )}
      </div>

      <div className="st-row">
        <div className="st-field">
          <label htmlFor="attachment">Comprovante ou nota (opcional)</label>
          <input id="attachment" name="attachment" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="st-input" />
          <span className="st-hint">PDF ou imagem, até 4 MB.{tx?.attachment_path ? " Enviar outro substitui o atual." : ""}</span>
        </div>
        <div className="st-field">
          <label htmlFor="notes">Observações</label>
          <textarea id="notes" name="notes" defaultValue={tx?.notes ?? ""} maxLength={1000} rows={3} className="st-input" />
        </div>
      </div>

      <FormMessage state={state} />
      <div className="st-actions">
        <SubmitButton pendingLabel="Salvando…">{tx ? "Salvar alterações" : "Lançar"}</SubmitButton>
        <a href={back} className="st-btn" data-variant="ghost">
          Voltar
        </a>
      </div>
    </form>
  );
}
