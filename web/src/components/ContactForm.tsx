"use client";

import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  budgets,
  limits,
  projectTypes,
  submitContact,
  validateContact,
  type ContactInput,
  type FieldErrors,
  type ProjectType,
} from "@/lib/contact";
import { apiUrl } from "@/lib/site";
import styles from "./ContactForm.module.css";
import { PROJECT_TYPE_EVENT } from "./InterestLink";

type Status = "idle" | "submitting" | "success" | "error";

const EMPTY: ContactInput = { name: "", email: "", projectType: "", budget: "", message: "" };
const FIELD_ORDER: (keyof ContactInput)[] = ["name", "email", "projectType", "budget", "message"];
const SLOW_NOTICE_MS = 6_000;

export function ContactForm({ endpoint = apiUrl }: { endpoint?: string }) {
  const id = useId();
  const [values, setValues] = useState<ContactInput>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<Partial<Record<keyof ContactInput, boolean>>>({});
  const [status, setStatus] = useState<Status>("idle");
  const [serverError, setServerError] = useState("");
  const [slow, setSlow] = useState(false);
  const startedAt = useRef(0);
  const honeypot = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    startedAt.current = Date.now();
    // Wake the API early: free hosting instances sleep when idle.
    if (endpoint) fetch(`${endpoint}/api/health`, { mode: "cors" }).catch(() => {});
  }, [endpoint]);

  useEffect(() => {
    const onPick = (event: Event) => {
      const type = (event as CustomEvent<ProjectType>).detail;
      if (type in projectTypes) setValues((current) => ({ ...current, projectType: type }));
    };
    window.addEventListener(PROJECT_TYPE_EVENT, onPick);
    return () => window.removeEventListener(PROJECT_TYPE_EVENT, onPick);
  }, []);

  useEffect(() => {
    if (status === "success") successRef.current?.focus();
    if (status === "error") errorRef.current?.focus();
  }, [status]);

  useEffect(() => {
    if (status !== "submitting") return;
    const timer = window.setTimeout(() => setSlow(true), SLOW_NOTICE_MS);
    return () => {
      window.clearTimeout(timer);
      setSlow(false);
    };
  }, [status]);

  const fieldId = (name: keyof ContactInput) => `${id}-${name}`;
  const visibleError = (name: keyof ContactInput) => (touched[name] ? errors[name] : undefined);

  function update(event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const name = event.target.name as keyof ContactInput;
    const next = { ...values, [name]: event.target.value };
    setValues(next);
    if (touched[name]) setErrors(validateContact(next));
  }

  function blur(name: keyof ContactInput) {
    setTouched((current) => ({ ...current, [name]: true }));
    setErrors(validateContact(values));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "submitting") return;

    const found = validateContact(values);
    setErrors(found);
    setTouched({ name: true, email: true, projectType: true, budget: true, message: true });
    const firstInvalid = FIELD_ORDER.find((name) => found[name]);
    if (firstInvalid) {
      formRef.current?.querySelector<HTMLElement>(`[name="${firstInvalid}"]`)?.focus();
      return;
    }

    setStatus("submitting");
    setServerError("");
    const result = await submitContact(endpoint, {
      ...values,
      website: honeypot.current?.value ?? "",
      startedAt: startedAt.current,
    });

    if (result.ok) {
      setStatus("success");
      setValues(EMPTY);
      setTouched({});
      setErrors({});
      return;
    }
    if (result.fields) setErrors(result.fields);
    setServerError(result.error);
    setStatus("error");
  }

  function reset() {
    startedAt.current = Date.now();
    setStatus("idle");
    window.requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[name="name"]')?.focus());
  }

  if (status === "success") {
    return (
      <div ref={successRef} className={styles.success} tabIndex={-1} role="status" aria-live="polite">
        <span className={styles.successMark} aria-hidden="true" />
        <h3 className={styles.successTitle}>Mensagem enviada.</h3>
        <p>Recebemos seu contato e vamos responder pelo e-mail informado.</p>
        <button type="button" className="button button-outline-light" onClick={reset}>
          Enviar outra mensagem
        </button>
      </div>
    );
  }

  const submitting = status === "submitting";
  const messageLength = values.message.trim().length;

  return (
    <form ref={formRef} className={styles.form} onSubmit={handleSubmit} noValidate aria-describedby={`${id}-note`}>
      <fieldset className={styles.fieldset} disabled={submitting}>
        <legend className="visually-hidden">Fale com a Bellman</legend>

        <div className={styles.row}>
          <Field id={fieldId("name")} label="Nome" error={visibleError("name")}>
            <input
              id={fieldId("name")}
              name="name"
              type="text"
              autoComplete="name"
              maxLength={limits.name.max}
              value={values.name}
              onChange={update}
              onBlur={() => blur("name")}
              aria-invalid={Boolean(visibleError("name"))}
              aria-describedby={visibleError("name") ? `${fieldId("name")}-error` : undefined}
              required
            />
          </Field>

          <Field id={fieldId("email")} label="E-mail" error={visibleError("email")}>
            <input
              id={fieldId("email")}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              maxLength={limits.email.max}
              value={values.email}
              onChange={update}
              onBlur={() => blur("email")}
              aria-invalid={Boolean(visibleError("email"))}
              aria-describedby={visibleError("email") ? `${fieldId("email")}-error` : undefined}
              required
            />
          </Field>
        </div>

        <div className={styles.row}>
          <Field id={fieldId("projectType")} label="Assunto" error={visibleError("projectType")}>
            <select
              id={fieldId("projectType")}
              name="projectType"
              value={values.projectType}
              onChange={update}
              onBlur={() => blur("projectType")}
              aria-invalid={Boolean(visibleError("projectType"))}
              aria-describedby={visibleError("projectType") ? `${fieldId("projectType")}-error` : undefined}
              required
            >
              <option value="" disabled>
                Selecione
              </option>
              {Object.entries(projectTypes).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>

          <Field id={fieldId("budget")} label="Orçamento estimado" optional error={visibleError("budget")}>
            <select
              id={fieldId("budget")}
              name="budget"
              value={values.budget}
              onChange={update}
              onBlur={() => blur("budget")}
              aria-invalid={Boolean(visibleError("budget"))}
            >
              <option value="">Prefiro não informar</option>
              {Object.entries(budgets).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field
          id={fieldId("message")}
          label="Mensagem"
          error={visibleError("message")}
          hint={`${messageLength} / ${limits.message.max}`}
        >
          <textarea
            id={fieldId("message")}
            name="message"
            rows={6}
            maxLength={limits.message.max}
            placeholder="Conte como podemos ajudar: o produto de interesse, o tamanho da sua empresa ou o projeto que você tem em mente."
            value={values.message}
            onChange={update}
            onBlur={() => blur("message")}
            aria-invalid={Boolean(visibleError("message"))}
            aria-describedby={`${fieldId("message")}-hint${visibleError("message") ? ` ${fieldId("message")}-error` : ""}`}
            required
          />
        </Field>

        {/* Honeypot for bots: hidden from people and assistive technology */}
        <div className={styles.trap} aria-hidden="true">
          <label htmlFor={`${id}-website`}>Site</label>
          <input ref={honeypot} id={`${id}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" />
        </div>
      </fieldset>

      {status === "error" && (
        <div ref={errorRef} className={styles.alert} role="alert" tabIndex={-1}>
          {serverError}
        </div>
      )}

      <div className={styles.footer}>
        <button type="submit" className={`button button-light ${styles.submit}`} aria-disabled={submitting}>
          {submitting ? (
            <>
              <span className={styles.spinner} aria-hidden="true" />
              Enviando…
            </>
          ) : (
            "Enviar mensagem"
          )}
        </button>
        <p id={`${id}-note`} className={styles.note} aria-live="polite">
          {submitting && slow
            ? "O servidor está iniciando. Isso pode levar até um minuto na primeira mensagem."
            : "Seus dados são usados apenas para responder este contato."}
        </p>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  optional = false,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  optional?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.field} data-invalid={Boolean(error)}>
      <div className={styles.labelRow}>
        <label htmlFor={id}>
          {label}
          {optional && <span className={styles.optional}> (opcional)</span>}
        </label>
        {hint && (
          <span id={`${id}-hint`} className={styles.hint}>
            {hint}
          </span>
        )}
      </div>
      {children}
      {error && (
        <p id={`${id}-error`} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
