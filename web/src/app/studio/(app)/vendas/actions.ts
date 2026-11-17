"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseMoney } from "@/lib/studio/finance-math";
import { removeSalesFiles, SALES_EXT, signedSalesUpload } from "@/lib/studio/sales-files";
import { requireStudio } from "@/lib/studio/session";
import { createClient } from "@/lib/supabase/server";

export type SalesState = { error?: string; message?: string } | undefined;
const UUID = /^[0-9a-f-]{36}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function winLead(_: SalesState, form: FormData): Promise<SalesState> {
  const ctx = await requireStudio();
  if (!ctx.canWrite) return { error: "Somente leitura." };
  const id = String(form.get("lead_id"));
  const plan = String(form.get("plan") ?? "").trim().slice(0, 60);
  const value = parseMoney(String(form.get("value") ?? ""));
  const cycle = String(form.get("cycle"));
  const start = String(form.get("start_date"));
  const months = Number(form.get("months") ?? 12);
  if (!UUID.test(id)) return { error: "Lead inválido." };
  if (plan.length < 2) return { error: "Informe o plano." };
  if (!value || value <= 0) return { error: "Informe o valor." };
  if (!["monthly", "yearly", "one_time"].includes(cycle)) return { error: "Escolha a cobrança." };
  if (!DATE.test(start)) return { error: "Informe o início." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("studio_win_lead", {
    p_lead_id: id,
    p_plan: plan,
    p_value_cents: value,
    p_cycle: cycle,
    p_start: start,
    p_months: Math.min(24, Math.max(1, months || 12)),
  });
  if (error || !data) return { error: "Não foi possível concluir a venda." };
  revalidatePath("/studio", "layout");
  redirect(`/studio/operacoes/clientes/${data}`);
}

export async function addInteraction(_: SalesState, form: FormData): Promise<SalesState> {
  const ctx = await requireStudio();
  if (!ctx.canWrite) return { error: "Somente leitura." };
  const leadId = String(form.get("lead_id"));
  const summary = String(form.get("summary") ?? "").trim();
  const kind = String(form.get("kind") ?? "nota").slice(0, 30);
  if (!UUID.test(leadId) || summary.length < 2) return { error: "Descreva a interação." };
  const supabase = await createClient();
  const { data: lead } = await supabase.from("leads").select("entity_id").eq("id", leadId).single();
  if (!lead) return { error: "Lead não encontrado." };
  const { error } = await supabase.from("lead_interactions").insert({ lead_id: leadId, entity_id: lead.entity_id, kind, summary: summary.slice(0, 2000) });
  if (error) return { error: "Não foi possível salvar." };
  revalidatePath("/studio/vendas", "layout");
  return { message: "Interação registrada." };
}

export async function cancelContract(_: SalesState, form: FormData): Promise<SalesState> {
  const ctx = await requireStudio();
  if (!ctx.canWrite) return { error: "Somente leitura." };
  const id = String(form.get("id"));
  const reason = String(form.get("reason") ?? "").trim();
  if (!UUID.test(id)) return { error: "Contrato inválido." };
  if (reason.length < 3) return { error: "Informe o motivo do cancelamento." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("studio_cancel_contract", { p_contract_id: id, p_reason: reason });
  if (error) return { error: "Não foi possível cancelar." };
  revalidatePath("/studio", "layout");
  return { message: `Contrato cancelado; ${data ?? 0} cobrança(s) futura(s) cancelada(s) no Financeiro.` };
}

// ================================================================ arquivos (contratos e materiais)

type FileMeta = { path: string; name: string; mime: string; bytes: number };

async function writableEntity(entityId: string) {
  const ctx = await requireStudio();
  if (!ctx.canWrite) throw new Error("Seu acesso é somente leitura.");
  const entity = ctx.visible.find((e) => e.id === entityId);
  if (!entity) throw new Error("Escolha a empresa.");
  return { ctx, entity };
}

function checkMeta(f: FileMeta, slug: string, folder: "documentos" | "materiais") {
  if (!new RegExp(`^${slug}/${folder}/[0-9a-f-]{36}\\.[a-z0-9]{1,5}$`).test(f.path)) throw new Error("Arquivo inválido.");
  return { storage_path: f.path, file_name: f.name.slice(0, 200), mime: (f.mime || "application/octet-stream").slice(0, 120), bytes: Math.max(0, Math.round(f.bytes)) };
}

/** Link assinado para o navegador enviar o arquivo direto ao Storage (até 50 MB). */
export async function salesUploadUrl(folder: "documentos" | "materiais", entityId: string, ext: string) {
  const { entity } = await writableEntity(entityId);
  const e = ext.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!SALES_EXT.includes(e)) throw new Error(`Tipo de arquivo não aceito (.${e || "?"}).`);
  const path = `${entity.slug}/${folder}/${randomUUID()}.${e}`;
  return { path, url: await signedSalesUpload(path) };
}

export async function attachDocumentFile(docId: string, file: FileMeta): Promise<SalesState> {
  try {
    if (!UUID.test(docId)) return { error: "Documento inválido." };
    const supabase = await createClient();
    const { data: doc } = await supabase.from("documents").select("entity_id,storage_path,entities(slug)").eq("id", docId).maybeSingle();
    if (!doc) return { error: "Documento não encontrado." };
    await writableEntity(doc.entity_id);
    const meta = checkMeta(file, (doc.entities as unknown as { slug: string }).slug, "documentos");
    const { error } = await supabase.from("documents").update(meta).eq("id", docId);
    if (error) return { error: "Não foi possível anexar." };
    if (doc.storage_path && doc.storage_path !== meta.storage_path) await removeSalesFiles([doc.storage_path]);
    revalidatePath("/studio/vendas", "layout");
    return { message: "Arquivo anexado." };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function createMaterial(input: { entityId: string; title: string; purpose: string; contactId: string | null; campaignId: string | null; notes: string; file: FileMeta }): Promise<SalesState> {
  try {
    const { entity } = await writableEntity(input.entityId);
    const meta = checkMeta(input.file, entity.slug, "materiais");
    const title = input.title.trim() || input.file.name.replace(/\.[^.]+$/, "");
    const supabase = await createClient();
    const { error } = await supabase.from("materials").insert({
      entity_id: entity.id,
      title: title.slice(0, 160),
      purpose: input.purpose,
      contact_id: input.contactId && UUID.test(input.contactId) ? input.contactId : null,
      campaign_id: input.campaignId && UUID.test(input.campaignId) ? input.campaignId : null,
      notes: input.notes.slice(0, 2000) || null,
      ...meta,
    });
    if (error) {
      await removeSalesFiles([meta.storage_path]);
      return { error: "Não foi possível salvar o material." };
    }
    revalidatePath("/studio/vendas", "layout");
    return { message: "Material adicionado." };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** Exclui documento ou material e o arquivo junto. */
export async function deleteSalesItem(form: FormData) {
  const ctx = await requireStudio();
  if (!ctx.canWrite) return;
  const table = String(form.get("table")) === "materials" ? "materials" : "documents";
  const id = String(form.get("id"));
  if (!UUID.test(id)) return;
  const supabase = await createClient();
  const { data } = await supabase.from(table).delete().eq("id", id).select("storage_path").maybeSingle();
  if (data?.storage_path) await removeSalesFiles([data.storage_path]);
  revalidatePath("/studio/vendas", "layout");
  const back = String(form.get("back") ?? "");
  if (back.startsWith("/studio/vendas")) redirect(back);
}
