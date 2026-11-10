import type { Metadata } from "next";
import { ROLE_LABEL, requireStudio } from "@/lib/studio/session";
import { createClient } from "@/lib/supabase/server";
import { MfaDisable, MfaEnroll, NameForm, PasswordForm } from "./SecurityForms";

export const metadata: Metadata = { title: "Minha conta e segurança" };

export default async function SecurityPage() {
  const ctx = await requireStudio();
  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const verified = factors?.totp?.find((f) => f.status === "verified");

  return (
    <div className="st-grid" data-cols="2">
      <article className="st-card">
        <h2>Minha conta</h2>
        <p className="st-hint">
          {ctx.profile.email} · {ROLE_LABEL[ctx.profile.role]}
        </p>
        <NameForm name={ctx.profile.full_name ?? ""} />
      </article>
      <article className="st-card">
        <div className="st-card-head">
          <h2>Verificação em duas etapas (2FA)</h2>
          <span className="st-status" data-tone={verified ? "ok" : "neutral"}>
            {verified ? "Ativa" : "Desativada"}
          </span>
        </div>
        <p className="st-hint">
          Além da senha, o login pede um código do aplicativo autenticador do seu celular. Recomendado para Sócio/Admin.
        </p>
        {verified ? <MfaDisable factorId={verified.id} /> : <MfaEnroll />}
      </article>
      <article className="st-card">
        <h2>Trocar senha</h2>
        <PasswordForm />
      </article>
      <article className="st-card">
        <h2>Sessão</h2>
        <p className="st-hint">
          Por segurança, a sessão expira em 12 horas e após 5 tentativas de senha erradas o login fica bloqueado por 15
          minutos.
        </p>
      </article>
    </div>
  );
}
