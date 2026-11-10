"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/studio/SubmitButton";
import { setNewPassword } from "../actions";

export default function SetPasswordPage() {
  const [state, action] = useActionState(setNewPassword, undefined);
  return (
    <>
      <div>
        <h1>Crie sua senha</h1>
        <p>Pelo menos 10 caracteres, com letras maiúsculas, minúsculas e números.</p>
      </div>
      <form action={action} className="st-form" noValidate>
        <div className="st-field">
          <label htmlFor="password">Nova senha</label>
          <input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required className="st-input" />
        </div>
        <div className="st-field">
          <label htmlFor="confirm">Confirme a senha</label>
          <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required className="st-input" />
        </div>
        <FormMessage state={state} />
        <SubmitButton pendingLabel="Salvando…">Salvar e entrar</SubmitButton>
      </form>
    </>
  );
}
