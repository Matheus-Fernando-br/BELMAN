"use server";

import { revalidatePath } from "next/cache";
import { syncProduct } from "@/lib/studio/product-sync";
import { requireAdmin } from "@/lib/studio/session";

export type SyncState = { ok?: boolean; message?: string } | undefined;

export async function syncNow(_: SyncState, form: FormData): Promise<SyncState> {
  await requireAdmin();
  const slug = String(form.get("slug") ?? "");
  if (!/^[a-z0-9-]{2,40}$/.test(slug)) return { ok: false, message: "Produto inválido." };
  const result = await syncProduct(slug, "manual");
  revalidatePath("/studio", "layout");
  return { ok: result.ok, message: result.message };
}
