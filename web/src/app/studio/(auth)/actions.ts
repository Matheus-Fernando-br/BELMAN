"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { passwordProblem } from "@/lib/studio/password";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; message?: string } | undefined;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function safeNext(value: unknown) {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/studio") && !next.startsWith("//") && !next.includes("\\") ? next : "/studio";
}

async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function signIn(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!EMAIL.test(email) || !password) return { error: "Informe e-mail e senha." };

  const supabase = await createClient();
  // A trava de tentativas roda com a chave secreta (só o servidor pode consultá-la).
  const guard = createAdminClient();
  const { data: lockedUntil } = guard ? await guard.rpc("studio_login_locked_until", { p_email: email }) : { data: null };
  if (lockedUntil) {
    const time = new Date(lockedUntil as string).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    });
    return { error: `Muitas tentativas. Por segurança, tente novamente após ${time}.` };
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (guard) await guard.rpc("studio_record_login", { p_email: email, p_success: !error });
  if (error) return { error: "E-mail ou senha incorretos." };

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const next = safeNext(form.get("next"));
  if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
    redirect(`/studio/mfa?next=${encodeURIComponent(next)}`);
  }
  redirect(next);
}

export async function requestPasswordReset(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL.test(email)) return { error: "Informe um e-mail válido." };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await origin()}/studio/auth/callback?next=/studio/definir-senha`,
  });
  // Same answer whether or not the account exists.
  return { message: "Se este e-mail tiver acesso ao Studio, enviamos um link para redefinir a senha." };
}

/** Finishes the e-mail link flow (invite or recovery). Returns where to go next. */
export async function completeEmailLink(input: {
  code?: string;
  accessToken?: string;
  refreshToken?: string;
  next?: string;
}): Promise<{ ok: boolean; next: string }> {
  const supabase = await createClient();
  let ok = false;
  if (input.code) {
    ok = !(await supabase.auth.exchangeCodeForSession(input.code)).error;
  } else if (input.accessToken && input.refreshToken) {
    ok = !(await supabase.auth.setSession({ access_token: input.accessToken, refresh_token: input.refreshToken })).error;
  }
  return { ok, next: safeNext(input.next) };
}

export async function setNewPassword(_: FormState, form: FormData): Promise<FormState> {
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  const problem = passwordProblem(password);
  if (problem) return { error: problem };
  if (password !== confirm) return { error: "As senhas não conferem." };

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return { error: "O link expirou. Peça um novo link de acesso." };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return {
      error: /same|different/i.test(error.message)
        ? "A nova senha precisa ser diferente da atual."
        : "Não foi possível salvar a senha. Tente novamente.",
    };
  }
  redirect("/studio");
}

export async function verifyMfa(_: FormState, form: FormData): Promise<FormState> {
  const code = String(form.get("code") ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return { error: "Digite o código de 6 dígitos do seu aplicativo autenticador." };
  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp?.find((f) => f.status === "verified");
  if (!factor) redirect("/studio");
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  if (error) return { error: "Código inválido ou expirado." };
  redirect(safeNext(form.get("next")));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/studio/login");
}
