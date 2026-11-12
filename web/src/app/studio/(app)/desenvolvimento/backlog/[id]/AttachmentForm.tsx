"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/studio/SubmitButton";
import { uploadBacklogAttachment } from "../../actions";

export function AttachmentForm({ id }: { id: string }) {
  const [state, action] = useActionState(uploadBacklogAttachment, undefined);
  return (
    <form action={action} className="st-form">
      <input type="hidden" name="id" value={id} />
      <input type="file" name="file" accept="image/png,image/jpeg,image/webp,application/pdf,video/mp4" className="st-input" aria-label="Anexo" />
      <FormMessage state={state} />
      <SubmitButton variant="ghost" pendingLabel="Enviando…">
        Anexar print
      </SubmitButton>
    </form>
  );
}
