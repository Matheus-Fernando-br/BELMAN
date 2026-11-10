"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/studio/SubmitButton";
import { syncNow } from "./actions";

export function SyncButton({ slug }: { slug: string }) {
  const [state, action] = useActionState(syncNow, undefined);
  return (
    <form action={action} className="st-actions">
      <input type="hidden" name="slug" value={slug} />
      <SubmitButton variant="ghost" pendingLabel="Sincronizando… (até 1 min)">
        Sincronizar agora
      </SubmitButton>
      {state?.message && (
        <span className="st-alert" data-tone={state.ok ? "ok" : undefined} role="status" style={{ padding: "0.4rem 0.7rem" }}>
          {state.message}
        </span>
      )}
    </form>
  );
}
