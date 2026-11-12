"use client";

import { useActionState } from "react";
import { deleteRecord, quickUpdate, saveRecord } from "@/app/studio/(app)/record-actions";
import { centsToInput } from "@/lib/studio/finance-math";
import { RECORDS, type FieldDef, type Option, type RecordKind } from "@/lib/studio/records";
import { FormMessage, SubmitButton } from "./SubmitButton";

export type RefOptions = Partial<Record<NonNullable<FieldDef["ref"]>, Option[]>>;

export function RecordForm({
  kind,
  record,
  defaults,
  entities,
  refs = {},
  back,
  readOnly = false,
  submitLabel,
  hide = [],
}: {
  kind: RecordKind;
  record?: Record<string, unknown> & { id?: string };
  defaults?: Record<string, unknown>;
  entities: Option[];
  refs?: RefOptions;
  back?: string;
  readOnly?: boolean;
  submitLabel?: string;
  hide?: string[];
}) {
  const action = saveRecord.bind(null, kind);
  const [state, formAction] = useActionState(action, undefined);
  const def = RECORDS[kind];
  const uid = record?.id ?? "new";
  const value = (f: FieldDef) => {
    const v = record?.[f.name] ?? defaults?.[f.name];
    if (f.kind === "money") return centsToInput(typeof v === "number" ? v : v == null ? null : Number(v));
    return v == null ? "" : String(v);
  };

  return (
    <form action={formAction} className="st-form" noValidate>
      {record?.id && <input type="hidden" name="id" value={record.id} />}
      {back && <input type="hidden" name="back" value={back} />}
      <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="st-row" style={{ gap: "1rem" }}>
          {(def.fields as readonly FieldDef[]).map((f) => {
            if (hide.includes(f.name)) return <input key={f.name} type="hidden" name={f.name} value={value(f)} />;
            const id = `${kind}-${f.name}-${uid}`;
            const style = f.wide || f.kind === "textarea" ? { gridColumn: "1 / -1" } : undefined;
            const options: readonly Option[] =
              f.kind === "entity" ? entities : f.kind === "ref" ? (refs[f.ref!] ?? []) : (f.options ?? []);
            return (
              <div key={f.name} className="st-field" style={style}>
                {f.kind === "bool" ? (
                  <label className="st-check">
                    <input type="checkbox" name={f.name} defaultChecked={Boolean(record?.[f.name] ?? defaults?.[f.name])} />
                    {f.label}
                  </label>
                ) : (
                  <>
                    <label htmlFor={id}>
                      {f.label}
                      {f.required ? "" : <span className="st-hint"> (opcional)</span>}
                    </label>
                    {f.kind === "textarea" ? (
                      <textarea id={id} name={f.name} defaultValue={value(f)} maxLength={f.max} rows={f.max && f.max > 8000 ? 10 : 4} className="st-input" placeholder={f.placeholder} />
                    ) : f.kind === "select" || f.kind === "entity" || f.kind === "ref" ? (
                      <select id={id} name={f.name} defaultValue={value(f) || (f.required ? options[0]?.[0] : "")} className="st-input">
                        {!f.required && <option value="">—</option>}
                        {options.map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id={id}
                        name={f.name}
                        type={f.kind === "date" ? "date" : f.kind === "email" ? "email" : f.kind === "url" ? "url" : "text"}
                        inputMode={f.kind === "money" ? "decimal" : f.kind === "int" ? "numeric" : undefined}
                        defaultValue={value(f)}
                        maxLength={f.max}
                        placeholder={f.placeholder ?? (f.kind === "money" ? "0,00" : undefined)}
                        className="st-input"
                      />
                    )}
                    {f.hint && <span className="st-hint">{f.hint}</span>}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </fieldset>
      <FormMessage state={state} />
      {!readOnly && (
        <div className="st-actions">
          <SubmitButton pendingLabel="Salvando…">{submitLabel ?? (record?.id ? "Salvar" : `Criar ${def.label.toLowerCase()}`)}</SubmitButton>
        </div>
      )}
    </form>
  );
}

/** Seletor que grava na hora (ex.: situação de uma tarefa no quadro). */
export function QuickSelect({
  kind,
  id,
  field,
  value,
  options,
  label,
  disabled,
}: {
  kind: RecordKind;
  id: string;
  field: string;
  value: string;
  options: readonly Option[];
  label: string;
  disabled?: boolean;
}) {
  return (
    <form action={quickUpdate}>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="field" value={field} />
      <select
        name="value"
        defaultValue={value}
        aria-label={label}
        disabled={disabled}
        className="st-input"
        style={{ minHeight: "2rem", padding: "0.2rem 1.8rem 0.2rem 0.5rem", fontSize: "0.8rem", width: "auto" }}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <noscript>
        <button type="submit" className="st-linkbtn">
          Salvar
        </button>
      </noscript>
    </form>
  );
}

export function DeleteButton({ kind, id, back, label = "Excluir" }: { kind: RecordKind; id: string; back?: string; label?: string }) {
  return (
    <form action={deleteRecord} onSubmit={(e) => !confirm("Excluir definitivamente?") && e.preventDefault()}>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      {back && <input type="hidden" name="back" value={back} />}
      <button type="submit" className="st-btn" data-variant="danger">
        {label}
      </button>
    </form>
  );
}
