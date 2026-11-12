"use client";

import { useActionState, useState } from "react";
import { FormMessage, SubmitButton } from "@/components/studio/SubmitButton";
import { submitFeedback } from "./actions";

export function FeedbackForm({ token }: { token: string }) {
  const [state, action] = useActionState(submitFeedback, undefined);
  const [kind, setKind] = useState<"bug" | "idea">("bug");
  const [startedAt] = useState(() => Date.now());
  if (state?.ok)
    return (
      <p className="st-alert" data-tone="ok" role="status">
        Obrigado! Seu feedback chegou para a equipe.
      </p>
    );
  return (
    <form action={action} className="st-form" encType="multipart/form-data" noValidate>
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="started_at" value={startedAt} />
      <input type="hidden" name="kind" value={kind === "bug" ? "bug" : "improvement"} />
      <div style={{ position: "absolute", left: "-9999px" }} aria-hidden="true">
        <label>
          Site <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <div className="st-actions" role="group" aria-label="Tipo">
        <button type="button" className="st-btn" data-variant={kind === "bug" ? undefined : "ghost"} aria-pressed={kind === "bug"} onClick={() => setKind("bug")}>
          Problema / bug
        </button>
        <button type="button" className="st-btn" data-variant={kind === "idea" ? undefined : "ghost"} aria-pressed={kind === "idea"} onClick={() => setKind("idea")}>
          Sugestão
        </button>
      </div>
      <div className="st-field">
        <label htmlFor="fb-title">Resumo</label>
        <input id="fb-title" name="title" maxLength={160} required className="st-input" placeholder={kind === "bug" ? "Ex.: PDF do orçamento corta a última linha" : "Ex.: Exportar obras em planilha"} />
      </div>
      <div className="st-field">
        <label htmlFor="fb-desc">{kind === "bug" ? "O que aconteceu?" : "Qual é a ideia?"}</label>
        <textarea id="fb-desc" name="description" rows={4} maxLength={5000} required className="st-input" />
      </div>
      {kind === "bug" && (
        <div className="st-field">
          <label htmlFor="fb-steps">Como reproduzir</label>
          <textarea id="fb-steps" name="steps" rows={4} maxLength={5000} className="st-input" placeholder={"1. Abri…\n2. Toquei em…\nAparelho e versão do app:"} />
        </div>
      )}
      <div className="st-field">
        <label htmlFor="fb-file">Print da tela (opcional)</label>
        <input id="fb-file" name="file" type="file" accept="image/png,image/jpeg,image/webp" className="st-input" />
      </div>
      <div className="st-row">
        <div className="st-field">
          <label htmlFor="fb-name">Seu nome (opcional)</label>
          <input id="fb-name" name="name" maxLength={120} className="st-input" />
        </div>
        <div className="st-field">
          <label htmlFor="fb-contact">E-mail ou WhatsApp (opcional)</label>
          <input id="fb-contact" name="contact" maxLength={160} className="st-input" />
        </div>
      </div>
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Enviando…">Enviar feedback</SubmitButton>
    </form>
  );
}
