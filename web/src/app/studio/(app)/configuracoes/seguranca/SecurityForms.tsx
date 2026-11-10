"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/studio/SubmitButton";
import { changePassword, disableMfa, enrollMfa, updateMyName, type MfaEnrollState } from "../actions";

export function NameForm({ name }: { name: string }) {
  const [state, action] = useActionState(updateMyName, undefined);
  return (
    <form action={action} className="st-form" noValidate>
      <div className="st-field">
        <label htmlFor="full_name">Seu nome</label>
        <input id="full_name" name="full_name" defaultValue={name} maxLength={80} className="st-input" />
      </div>
      <FormMessage state={state} />
      <div className="st-actions">
        <SubmitButton variant="ghost">Salvar nome</SubmitButton>
      </div>
    </form>
  );
}

export function PasswordForm() {
  const [state, action] = useActionState(changePassword, undefined);
  return (
    <form action={action} className="st-form" noValidate>
      <div className="st-row">
        <div className="st-field">
          <label htmlFor="new-password">Nova senha</label>
          <input id="new-password" name="password" type="password" autoComplete="new-password" className="st-input" />
        </div>
        <div className="st-field">
          <label htmlFor="new-confirm">Confirme</label>
          <input id="new-confirm" name="confirm" type="password" autoComplete="new-password" className="st-input" />
        </div>
      </div>
      <span className="st-hint">Mínimo de 10 caracteres, com maiúsculas, minúsculas e números.</span>
      <FormMessage state={state} />
      <div className="st-actions">
        <SubmitButton variant="ghost" pendingLabel="Salvando…">
          Trocar senha
        </SubmitButton>
      </div>
    </form>
  );
}

export function MfaEnroll() {
  const [state, action] = useActionState<MfaEnrollState, FormData>(enrollMfa, { step: "idle" });
  if (state.step === "done")
    return (
      <p className="st-alert" data-tone="ok" role="status">
        Verificação em duas etapas ativada. Ela será pedida no próximo login.
      </p>
    );
  return (
    <form action={action} className="st-form" noValidate>
      {state.step === "verify" ? (
        <>
          <p>1. Abra o Google Authenticator, Microsoft Authenticator ou 1Password e escaneie o código:</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={state.qr} alt="QR code para configurar o aplicativo autenticador" className="st-qr" />
          <p className="st-hint">
            Não consegue escanear? Digite esta chave: <span className="st-code">{state.secret}</span>
          </p>
          <div className="st-field">
            <label htmlFor="mfa-code">2. Digite o código de 6 dígitos</label>
            <input id="mfa-code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="st-input st-otp" />
          </div>
          <FormMessage state={state} />
          <SubmitButton pendingLabel="Verificando…">Ativar</SubmitButton>
        </>
      ) : (
        <>
          <FormMessage state={state} />
          <SubmitButton pendingLabel="Gerando…">Ativar verificação em duas etapas</SubmitButton>
        </>
      )}
    </form>
  );
}

export function MfaDisable({ factorId }: { factorId: string }) {
  const [state, action] = useActionState(disableMfa, undefined);
  return (
    <form action={action} className="st-form">
      <input type="hidden" name="factorId" value={factorId} />
      <FormMessage state={state} />
      <div className="st-actions">
        <SubmitButton variant="danger" pendingLabel="Desativando…">
          Desativar 2FA
        </SubmitButton>
      </div>
    </form>
  );
}
