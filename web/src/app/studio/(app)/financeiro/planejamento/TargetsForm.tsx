"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/studio/SubmitButton";
import { saveTargets } from "../actions";

export function TargetsForm({ entityId, revenueGoal, marginGoal }: { entityId: string; revenueGoal: string; marginGoal: string }) {
  const [state, action] = useActionState(saveTargets, undefined);
  return (
    <form action={action} className="st-form" noValidate>
      <input type="hidden" name="entity_id" value={entityId} />
      <div className="st-row">
        <div className="st-field">
          <label htmlFor="t-rev">Meta de receita mensal (R$)</label>
          <input id="t-rev" name="revenue_goal" inputMode="decimal" defaultValue={revenueGoal} className="st-input" />
        </div>
        <div className="st-field">
          <label htmlFor="t-margin">Meta de margem (%)</label>
          <input id="t-margin" name="margin_goal" inputMode="decimal" defaultValue={marginGoal} className="st-input" />
        </div>
      </div>
      <FormMessage state={state} />
      <SubmitButton variant="ghost" pendingLabel="Salvando…">
        Salvar metas
      </SubmitButton>
    </form>
  );
}
