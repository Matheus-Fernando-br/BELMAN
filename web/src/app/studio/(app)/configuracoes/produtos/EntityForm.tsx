"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/studio/SubmitButton";
import type { Entity } from "@/lib/studio/session";
import { saveEntity } from "../actions";

export function EntityForm({ entity, readOnly }: { entity?: Entity; readOnly: boolean }) {
  const [state, action] = useActionState(saveEntity, undefined);
  const id = entity?.id ?? "novo";
  return (
    <form action={action} className="st-form" noValidate>
      <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: "1rem" }}>
        {entity && <input type="hidden" name="id" value={entity.id} />}
        <div className="st-row">
          <div className="st-field">
            <label htmlFor={`name-${id}`}>Nome</label>
            <input id={`name-${id}`} name="name" defaultValue={entity?.name} required className="st-input" />
          </div>
          {!entity ? (
            <div className="st-field">
              <label htmlFor={`slug-${id}`}>Identificador</label>
              <input id={`slug-${id}`} name="slug" placeholder="ex.: novo-produto" pattern="[a-z0-9-]{2,40}" required className="st-input" />
            </div>
          ) : (
            <div className="st-field">
              <label htmlFor={`color-${id}`}>Cor de destaque</label>
              <input id={`color-${id}`} name="color" type="color" defaultValue={entity.color} className="st-input" />
            </div>
          )}
        </div>
        {!entity && (
          <div className="st-field">
            <label htmlFor={`color-${id}`}>Cor de destaque</label>
            <input id={`color-${id}`} name="color" type="color" defaultValue="#444444" className="st-input" />
          </div>
        )}
        <div className="st-field">
          <label htmlFor={`desc-${id}`}>Descrição</label>
          <input id={`desc-${id}`} name="description" defaultValue={entity?.description ?? ""} className="st-input" />
        </div>
        <div className="st-row">
          <div className="st-field">
            <label htmlFor={`site-${id}`}>Site</label>
            <input id={`site-${id}`} name="site_url" type="url" defaultValue={entity?.site_url ?? ""} placeholder="https://" className="st-input" />
          </div>
          <div className="st-field">
            <label htmlFor={`admin-${id}`}>Admin do produto</label>
            <input id={`admin-${id}`} name="admin_url" type="url" defaultValue={entity?.admin_url ?? ""} placeholder="https://" className="st-input" />
          </div>
        </div>
        <div className="st-field">
          <label htmlFor={`metrics-${id}`}>Endpoint de métricas (somente leitura)</label>
          <input id={`metrics-${id}`} name="metrics_url" type="url" defaultValue={entity?.metrics_url ?? ""} placeholder="https://…/internal/metrics" className="st-input" />
          <span className="st-hint">A chave de acesso fica em variável de ambiente no servidor, nunca aqui.</span>
        </div>
        <label className="st-check">
          <input type="checkbox" name="active" defaultChecked={entity?.active ?? true} />
          Ativo
        </label>
        <FormMessage state={state} />
        {!readOnly && (
          <div className="st-actions">
            <SubmitButton variant={entity ? "ghost" : undefined} pendingLabel="Salvando…">
              {entity ? "Salvar" : "Adicionar produto"}
            </SubmitButton>
          </div>
        )}
      </fieldset>
    </form>
  );
}
