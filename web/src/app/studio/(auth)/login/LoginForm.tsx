"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/studio/SubmitButton";
import { signIn } from "../actions";

export function LoginForm({ next, notice }: { next: string; notice?: string }) {
  const [state, action] = useActionState(signIn, notice ? { error: notice } : undefined);
  return (
    <form action={action} className="st-form" noValidate>
      <input type="hidden" name="next" value={next} />
      <div className="st-field">
        <label htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" autoComplete="username" required className="st-input" />
      </div>
      <div className="st-field">
        <label htmlFor="password">Senha</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="st-input" />
      </div>
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Entrando…">Entrar</SubmitButton>
      <Link href="/studio/esqueci-senha" className="st-hint" style={{ fontSize: "0.85rem" }}>
        Esqueci minha senha
      </Link>
    </form>
  );
}
