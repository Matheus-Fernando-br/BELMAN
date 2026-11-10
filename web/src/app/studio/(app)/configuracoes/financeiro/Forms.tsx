"use client";

import { useActionState } from "react";
import { saveAccount, saveCategory, saveRule } from "@/app/studio/(app)/financeiro/actions";
import { FormMessage, SubmitButton } from "@/components/studio/SubmitButton";
import type { Account, AllocationRule, Category } from "@/lib/studio/finance";
import { centsToInput } from "@/lib/studio/finance-math";

type Ent = { id: string; name: string; color: string };

export function CategoryForm({ category }: { category?: Category }) {
  const [state, action] = useActionState(saveCategory, undefined);
  return (
    <form action={action} className="st-form" noValidate>
      {category && <input type="hidden" name="id" value={category.id} />}
      <div className="st-row">
        <div className="st-field">
          <label htmlFor={`c-name-${category?.id ?? "new"}`}>Nome</label>
          <input id={`c-name-${category?.id ?? "new"}`} name="name" defaultValue={category?.name} maxLength={60} className="st-input" />
        </div>
        {category ? (
          <div className="st-field">
            <label htmlFor={`c-group-${category.id}`}>Grupo</label>
            <input id={`c-group-${category.id}`} name="group_name" defaultValue={category.group_name ?? ""} maxLength={60} className="st-input" />
          </div>
        ) : (
          <div className="st-field">
            <label htmlFor="c-type-new">Tipo</label>
            <select id="c-type-new" name="type" className="st-input" defaultValue="expense">
              <option value="expense">Despesa</option>
              <option value="income">Receita</option>
            </select>
          </div>
        )}
      </div>
      {!category && (
        <div className="st-field">
          <label htmlFor="c-group-new">Grupo (opcional)</label>
          <input id="c-group-new" name="group_name" maxLength={60} className="st-input" placeholder="Ex.: Tecnologia" />
        </div>
      )}
      <div className="st-actions">
        <label className="st-check">
          <input type="checkbox" name="is_fixed" defaultChecked={category?.is_fixed} />
          Custo fixo
        </label>
        {category && (
          <label className="st-check">
            <input type="checkbox" name="active" defaultChecked={category.active} />
            Ativa
          </label>
        )}
      </div>
      <FormMessage state={state} />
      <SubmitButton variant={category ? "ghost" : undefined} pendingLabel="Salvando…">
        {category ? "Salvar" : "Adicionar categoria"}
      </SubmitButton>
    </form>
  );
}

export function AccountForm({ account, entities, today }: { account?: Account; entities: Ent[]; today: string }) {
  const [state, action] = useActionState(saveAccount, undefined);
  const id = account?.id ?? "new";
  return (
    <form action={action} className="st-form" noValidate>
      {account && <input type="hidden" name="id" value={account.id} />}
      <div className="st-row">
        <div className="st-field">
          <label htmlFor={`a-name-${id}`}>Nome da conta</label>
          <input id={`a-name-${id}`} name="name" defaultValue={account?.name} maxLength={60} placeholder="Ex.: Inter PJ" className="st-input" />
        </div>
        <div className="st-field">
          <label htmlFor={`a-ent-${id}`}>Entidade</label>
          <select id={`a-ent-${id}`} name="entity_id" defaultValue={account?.entity_id ?? entities[0]?.id} className="st-input">
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
        <div className="st-field">
          <label htmlFor={`a-kind-${id}`}>Tipo</label>
          <select id={`a-kind-${id}`} name="kind" defaultValue={account?.kind ?? "bank"} className="st-input">
            <option value="bank">Conta bancária</option>
            <option value="wallet">Carteira digital (Mercado Pago…)</option>
            <option value="cash">Dinheiro</option>
            <option value="card">Cartão de crédito</option>
          </select>
        </div>
        <div className="st-field">
          <label htmlFor={`a-open-${id}`}>Saldo inicial (R$)</label>
          <input id={`a-open-${id}`} name="opening_balance" inputMode="decimal" defaultValue={centsToInput(account?.opening_balance_cents ?? 0)} className="st-input" />
        </div>
        <div className="st-field">
          <label htmlFor={`a-date-${id}`}>Saldo em</label>
          <input id={`a-date-${id}`} name="opening_date" type="date" defaultValue={account?.opening_date ?? today} className="st-input" />
        </div>
      </div>
      {account && (
        <label className="st-check">
          <input type="checkbox" name="active" defaultChecked={account.active} />
          Ativa
        </label>
      )}
      <FormMessage state={state} />
      <SubmitButton variant={account ? "ghost" : undefined} pendingLabel="Salvando…">
        {account ? "Salvar" : "Adicionar conta"}
      </SubmitButton>
    </form>
  );
}

export function RuleForm({ rule, entities }: { rule?: AllocationRule; entities: Ent[] }) {
  const [state, action] = useActionState(saveRule, undefined);
  const id = rule?.id ?? "new";
  const pct = (entityId: string) => rule?.shares.find((s) => s.entity_id === entityId)?.percent;
  return (
    <form action={action} className="st-form" noValidate>
      {rule && <input type="hidden" name="id" value={rule.id} />}
      <div className="st-row">
        <div className="st-field">
          <label htmlFor={`r-name-${id}`}>Nome da regra</label>
          <input id={`r-name-${id}`} name="name" defaultValue={rule?.name} maxLength={60} className="st-input" />
        </div>
        <div className="st-field">
          <label htmlFor={`r-desc-${id}`}>Descrição</label>
          <input id={`r-desc-${id}`} name="description" defaultValue={rule?.description ?? ""} className="st-input" />
        </div>
      </div>
      <fieldset className="st-field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend>Percentual por entidade (soma 100%)</legend>
        <div className="st-row">
          {entities.map((e) => (
            <div key={e.id} className="st-field">
              <label htmlFor={`r-${id}-${e.id}`}>
                <span className="st-dot" style={{ background: e.color, marginRight: "0.35rem" }} aria-hidden="true" />
                {e.name} (%)
              </label>
              <input id={`r-${id}-${e.id}`} name={`p_${e.id}`} inputMode="decimal" defaultValue={pct(e.id) != null ? String(pct(e.id)).replace(".", ",") : ""} placeholder="0" className="st-input" />
            </div>
          ))}
        </div>
      </fieldset>
      {rule && (
        <label className="st-check">
          <input type="checkbox" name="active" defaultChecked={rule.active} />
          Ativa
        </label>
      )}
      <FormMessage state={state} />
      <SubmitButton variant={rule ? "ghost" : undefined} pendingLabel="Salvando…">
        {rule ? "Salvar regra" : "Criar regra"}
      </SubmitButton>
    </form>
  );
}
