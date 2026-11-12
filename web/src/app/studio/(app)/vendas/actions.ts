"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseMoney } from "@/lib/studio/finance-math";
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
