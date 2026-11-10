"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/studio/SubmitButton";
import { saveBudget } from "../actions";

export function BudgetForm({
  entityId,
  months,
  categories,
  values,
}: {
  entityId: string;
  months: { key: string; label: string }[];
  categories: { id: string; name: string; type: "income" | "expense" }[];
  values: Record<string, string>;
}) {
  const [state, action] = useActionState(saveBudget, undefined);
  const groups = [
    { title: "Receitas (metas)", items: categories.filter((c) => c.type === "income") },
    { title: "Despesas (limites)", items: categories.filter((c) => c.type === "expense") },
  ];
  return (
    <form action={action} className="st-form">
      <input type="hidden" name="entity_id" value={entityId} />
      <div className="st-table-wrap">
        <table className="st-table">
          <caption className="visually-hidden">Orçamento mensal por categoria</caption>
          <thead>
            <tr>
              <th scope="col" style={{ position: "sticky", left: 0, background: "#fafaf9", zIndex: 1 }}>
                Categoria
              </th>
              {months.map((m) => (
                <th key={m.key} scope="col" style={{ textAlign: "right" }}>
                  {m.label}
                </th>
              ))}
            </tr>
          </thead>
          {groups.map((g) => (
            <tbody key={g.title}>
              <tr>
                <th colSpan={months.length + 1} scope="colgroup" style={{ background: "#fff" }}>
                  {g.title}
                </th>
              </tr>
              {g.items.map((c) => (
                <tr key={c.id}>
                  <th scope="row" style={{ position: "sticky", left: 0, background: "#fff", fontWeight: 500, whiteSpace: "nowrap", zIndex: 1 }}>
                    {c.name}
                  </th>
                  {months.map((m) => (
                    <td key={m.key} style={{ padding: "0.3rem" }}>
                      <input
                        name={`b_${c.id}_${m.key}`}
                        defaultValue={values[`${c.id}_${m.key}`] ?? ""}
                        inputMode="decimal"
                        placeholder="0"
                        aria-label={`${c.name}, ${m.label}`}
                        className="st-input"
                        style={{ minWidth: "6.5rem", minHeight: "2.25rem", padding: "0.3rem 0.5rem", textAlign: "right" }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
      <FormMessage state={state} />
      <div className="st-actions">
        <SubmitButton pendingLabel="Salvando…">Salvar orçamento</SubmitButton>
        <span className="st-hint">Valores em reais. Campos vazios contam como zero.</span>
      </div>
    </form>
  );
}
