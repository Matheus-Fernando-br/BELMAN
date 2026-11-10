"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  pendingLabel = "Aguarde…",
  variant,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: "ghost" | "danger";
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="st-btn" data-variant={variant} aria-disabled={pending} disabled={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}

export function FormMessage({ state }: { state?: { error?: string; message?: string } }) {
  if (state?.error)
    return (
      <p className="st-alert" role="alert">
        {state.error}
      </p>
    );
  if (state?.message)
    return (
      <p className="st-alert" data-tone="ok" role="status">
        {state.message}
      </p>
    );
  return null;
}
