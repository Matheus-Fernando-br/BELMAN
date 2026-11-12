"use server";

import { revalidatePath } from "next/cache";
import { requireStudio } from "@/lib/studio/session";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f-]{36}$/;
const TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf", "video/mp4"];

export type UploadState = { error?: string; message?: string } | undefined;

export async function uploadBacklogAttachment(_: UploadState, form: FormData): Promise<UploadState> {
  const ctx = await requireStudio();
  if (!ctx.canWrite) return { error: "Somente leitura." };
  const id = String(form.get("id"));
  const file = form.get("file");
  if (!UUID.test(id) || !(file instanceof File) || !file.size) return { error: "Escolha um arquivo." };
  if (file.size > 4 * 1024 * 1024) return { error: "Máximo de 4 MB." };
  if (!TYPES.includes(file.type)) return { error: "Envie PNG, JPG, WEBP, PDF ou MP4." };
  const supabase = await createClient();
  const { data: item } = await supabase.from("backlog_items").select("attachments").eq("id", id).single();
  if (!item) return { error: "Item não encontrado." };
  const path = `backlog/${id}/${Date.now()}-${file.name.normalize("NFKD").replace(/[^\w.-]+/g, "-").slice(-60)}`;
  const { error } = await supabase.storage.from("dev-attachments").upload(path, file, { contentType: file.type });
  if (error) return { error: "Não foi possível enviar." };
  await supabase.from("backlog_items").update({ attachments: [...(item.attachments ?? []), path] }).eq("id", id);
  revalidatePath("/studio/desenvolvimento", "layout");
  return { message: "Anexo enviado." };
}

export async function toggleQa(form: FormData) {
  const ctx = await requireStudio();
  if (!ctx.canWrite) return;
  const id = String(form.get("id"));
  const index = Number(form.get("index"));
  if (!UUID.test(id)) return;
  const supabase = await createClient();
  const { data } = await supabase.from("releases").select("qa_checklist").eq("id", id).single();
  if (!data) return;
  const list = (data.qa_checklist as { label: string; done: boolean }[]).map((q, i) => (i === index ? { ...q, done: !q.done } : q));
  await supabase.from("releases").update({ qa_checklist: list }).eq("id", id);
  revalidatePath("/studio/desenvolvimento", "layout");
}

export async function addQa(form: FormData) {
  const ctx = await requireStudio();
  if (!ctx.canWrite) return;
  const id = String(form.get("id"));
  const text = String(form.get("label") ?? "").trim().slice(0, 200);
  if (!UUID.test(id) || text.length < 2) return;
  const supabase = await createClient();
  const { data } = await supabase.from("releases").select("qa_checklist").eq("id", id).single();
  if (!data) return;
  await supabase.from("releases").update({ qa_checklist: [...(data.qa_checklist as object[]), { label: text, done: false }] }).eq("id", id);
  revalidatePath("/studio/desenvolvimento", "layout");
}

export async function approveRelease(form: FormData) {
  const ctx = await requireStudio();
  if (!ctx.canWrite) return;
  const id = String(form.get("id"));
  if (!UUID.test(id)) return;
  const supabase = await createClient();
  await supabase.from("releases").update({ status: "approved", approved_by: ctx.profile.id }).eq("id", id);
  revalidatePath("/studio/desenvolvimento", "layout");
}

export async function createFeedbackForm(form: FormData) {
  const ctx = await requireStudio();
  if (!ctx.canWrite) return;
  const entityId = String(form.get("entity_id"));
  const title = String(form.get("title") ?? "").trim().slice(0, 120) || "Envie seu feedback";
  if (!UUID.test(entityId)) return;
  const supabase = await createClient();
  await supabase.from("feedback_forms").insert({ entity_id: entityId, title });
  revalidatePath("/studio/desenvolvimento", "layout");
}

export async function toggleFeedbackForm(form: FormData) {
  const ctx = await requireStudio();
  if (!ctx.canWrite) return;
  const id = String(form.get("id"));
  if (!UUID.test(id)) return;
  const supabase = await createClient();
  await supabase.from("feedback_forms").update({ active: form.get("active") === "true" }).eq("id", id);
  revalidatePath("/studio/desenvolvimento", "layout");
}
