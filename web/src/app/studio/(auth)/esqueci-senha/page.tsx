"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/studio/SubmitButton";
import { requestPasswordReset } from "../actions";

export default function ForgotPasswordPage() {
  const [state, action] = useActionState(requestPasswordReset, undefined);
  return (
    <>
      <div>
        <h1>Redefinir senha</h1>
        <p>Informe o e-mail da sua conta. Enviaremos um link para criar uma nova senha.</p>
      </div>
      <form action={action} className="st-form" noValidate>
        <div className="st-field">
          <label htmlFor="email">E-mail</label>
          <input id="email" name="email" type="email" autoComplete="email" required className="st-input" />
        </div>
        <FormMessage state={state} />
        <SubmitButton pendingLabel="Enviando…">Enviar link</SubmitButton>
        <Link href="/studio/login" style={{ fontSize: "0.85rem" }}>
          Voltar para o login
        </Link>
      </form>
    </>
  );
}
