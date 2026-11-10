"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/studio/SubmitButton";
import { signOut, verifyMfa } from "../actions";

export function MfaForm({ next }: { next: string }) {
  const [state, action] = useActionState(verifyMfa, undefined);
  return (
    <>
      <form action={action} className="st-form" noValidate>
        <input type="hidden" name="next" value={next} />
        <div className="st-field">
          <label htmlFor="code">Código</label>
          <input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            autoFocus
            className="st-input st-otp"
          />
        </div>
        <FormMessage state={state} />
        <SubmitButton pendingLabel="Verificando…">Verificar</SubmitButton>
      </form>
      <form action={signOut}>
        <button type="submit" className="st-btn" data-variant="ghost">
          Sair
        </button>
      </form>
    </>
  );
}
