"use server";

import { createAdminClient } from "@/lib/supabase/server";

export type FeedbackState = { ok?: boolean; error?: string } | undefined;

const TYPES = ["image/png", "image/jpeg", "image/webp"];

export async function submitFeedback(_: FeedbackState, form: FormData): Promise<FeedbackState> {
  const token = String(form.get("token") ?? "");
  const kind = form.get("kind") === "bug" ? "bug" : "improvement";
  const title = String(form.get("title") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  const steps = String(form.get("steps") ?? "").trim();
  const name = String(form.get("name") ?? "").trim().slice(0, 120);
  const contact = String(form.get("contact") ?? "").trim().slice(0, 160);
  const startedAt = Number(form.get("started_at") ?? 0);

  // Antirrobô: campo invisível preenchido ou envio rápido demais = descarta em silêncio.
  if (String(form.get("website") ?? "") || Date.now() - startedAt < 3000) return { ok: true };
  if (!/^[0-9a-f]{24}$/.test(token)) return { error: "Link inválido." };
  if (title.length < 4 || title.length > 160) return { error: "Escreva um título de 4 a 160 caracteres." };
  if (description.length < 10 || description.length > 5000) return { error: "Descreva com pelo menos 10 caracteres." };
  if (steps.length > 5000) return { error: "O passo a passo está muito longo." };

  const admin = createAdminClient();
  if (!admin) return { error: "Indisponível no momento." };
  const { data: f } = await admin.from("feedback_forms").select("entity_id,active").eq("token", token).maybeSingle();
  if (!f?.active) return { error: "Este link não está mais ativo." };

  // Limite: 30 envios por hora por produto.
  const { count } = await admin
    .from("backlog_items")
    .select("id", { count: "exact", head: true })
    .eq("entity_id", f.entity_id)
    .eq("source", "feedback")
    .gte("created_at", new Date(Date.now() - 3600e3).toISOString());
  if ((count ?? 0) >= 30) return { error: "Recebemos muitos envios agora. Tente de novo em uma hora." };

  const { data: item, error } = await admin
    .from("backlog_items")
    .insert({
      entity_id: f.entity_id,
      type: kind,
      title,
      description,
      steps_to_reproduce: kind === "bug" ? steps || null : null,
      priority: "medium",
      severity: kind === "bug" ? "medium" : null,
      status: "new",
      source: "feedback",
      reporter_name: name || null,
      reporter_contact: contact || null,
    })
    .select("id")
    .single();
  if (error || !item) return { error: "Não foi possível enviar. Tente novamente." };

  const file = form.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size <= 4 * 1024 * 1024 && TYPES.includes(file.type)) {
      const path = `feedback/${item.id}/${Date.now()}-print.${file.type.split("/")[1]}`;
      const up = await admin.storage.from("dev-attachments").upload(path, file, { contentType: file.type });
      if (!up.error) await admin.from("backlog_items").update({ attachments: [path] }).eq("id", item.id);
    }
  }
  return { ok: true };
}
