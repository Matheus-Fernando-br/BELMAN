"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireFinance, todayISO } from "@/lib/studio/finance";
import { parseMoney } from "@/lib/studio/finance-math";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; message?: string } | undefined;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/;
const str = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const optId = (form: FormData, key: string) => {
  const v = str(form, key);
  return UUID.test(v) ? v : null;
};
const MAX_FILE = 4 * 1024 * 1024;
const FILE_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];

function fail(message: string) {
  if (/rateio/i.test(message)) return message;
  if (/check|violates/i.test(message)) return "Algum valor está fora do permitido. Revise os campos.";
  return "Não foi possível salvar. Tente novamente.";
}

function done() {
  revalidatePath("/studio", "layout");
}

async function uploadAttachment(file: File | null, folder: string) {
  if (!file || file.size === 0) return { path: null as string | null };
  if (file.size > MAX_FILE) return { error: "O comprovante pode ter no máximo 4 MB." };
  if (!FILE_TYPES.includes(file.type)) return { error: "Envie o comprovante em PDF, PNG, JPG ou WEBP." };
  const supabase = await createClient();
  const safe = file.name.normalize("NFKD").replace(/[^\w.-]+/g, "-").slice(-80);
  const path = `${folder}/${Date.now()}-${safe}`;
  const { error } = await supabase.storage.from("fin-attachments").upload(path, file, { contentType: file.type });
  if (error) return { error: "Não foi possível enviar o comprovante." };
  return { path };
}

// ------------------------------------------------------------------ lançamentos

export async function saveTransaction(_: FormState, form: FormData): Promise<FormState> {
  await requireFinance();
  const id = optId(form, "id");
  const type = str(form, "type");
  const entityId = optId(form, "entity_id");
  const description = str(form, "description");
  const amount = parseMoney(str(form, "amount"));
  const dueDate = str(form, "due_date");
  const paid = form.get("paid") === "on";
  const paidDate = str(form, "paid_date") || todayISO();
  const paidAmount = paid ? (parseMoney(str(form, "paid_amount")) ?? amount) : null;

  if (type !== "income" && type !== "expense") return { error: "Escolha receita ou despesa." };
  if (!entityId) return { error: "Escolha a Entidade (dona do lançamento)." };
  if (description.length < 2) return { error: "Descreva o lançamento." };
  if (!amount || amount <= 0) return { error: "Informe um valor válido, por exemplo 1.250,00." };
  if (!DATE.test(dueDate)) return { error: "Informe a data prevista." };
  if (paid && !DATE.test(paidDate)) return { error: "Informe a data em que foi pago/recebido." };

  const supabase = await createClient();
  let counterpartyId = optId(form, "counterparty_id");
  const newParty = str(form, "new_counterparty");
  if (!counterpartyId && newParty.length >= 2) {
    const { data, error } = await supabase
      .from("fin_counterparties")
      .insert({ name: newParty.slice(0, 120), kind: type === "income" ? "customer" : "supplier" })
      .select("id")
      .single();
    if (error) return { error: fail(error.message) };
    counterpartyId = data.id;
  }

  const values = {
    type,
    entity_id: entityId,
    description: description.slice(0, 140),
    category_id: optId(form, "category_id"),
    counterparty_id: counterpartyId,
    account_id: optId(form, "account_id"),
    allocation_rule_id: optId(form, "allocation_rule_id"),
    amount_cents: amount,
    due_date: dueDate,
    paid_date: paid ? paidDate : null,
    paid_amount_cents: paid ? paidAmount : null,
    notes: str(form, "notes").slice(0, 1000) || null,
  };

  let txId = id;
  if (id) {
    const { error } = await supabase.from("fin_transactions").update(values).eq("id", id);
    if (error) return { error: fail(error.message) };
  } else {
    const { data, error } = await supabase.from("fin_transactions").insert(values).select("id").single();
    if (error) return { error: fail(error.message) };
    txId = data.id;
  }

  const file = form.get("attachment");
  const upload = await uploadAttachment(file instanceof File ? file : null, `tx/${txId}`);
  if ("error" in upload) return { error: `Lançamento salvo, mas: ${upload.error}` };
  if (upload.path) await supabase.from("fin_transactions").update({ attachment_path: upload.path }).eq("id", txId!);

  done();
  const back = str(form, "back");
  redirect(back.startsWith("/studio/financeiro") ? back : "/studio/financeiro/lancamentos");
}

export async function markPaid(form: FormData) {
  await requireFinance();
  const id = optId(form, "id");
  if (!id) return;
  const supabase = await createClient();
  const { data } = await supabase.from("fin_transactions").select("amount_cents").eq("id", id).single();
  if (!data) return;
  await supabase.from("fin_transactions").update({ paid_date: todayISO(), paid_amount_cents: data.amount_cents }).eq("id", id);
  done();
}

export async function setCancelled(form: FormData) {
  await requireFinance();
  const id = optId(form, "id");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("fin_transactions").update({ cancelled: form.get("cancelled") === "true" }).eq("id", id);
  done();
}

export async function deleteTransaction(form: FormData) {
  await requireFinance();
  const id = optId(form, "id");
  if (!id) return;
  const supabase = await createClient();
  const { data } = await supabase.from("fin_transactions").select("attachment_path").eq("id", id).single();
  await supabase.from("fin_transactions").delete().eq("id", id);
  if (data?.attachment_path) await supabase.storage.from("fin-attachments").remove([data.attachment_path]);
  done();
  redirect("/studio/financeiro/lancamentos");
}

// ------------------------------------------------------------------ recorrências

export async function saveRecurrence(_: FormState, form: FormData): Promise<FormState> {
  await requireFinance();
  const type = str(form, "type");
  const entityId = optId(form, "entity_id");
  const description = str(form, "description");
  const amount = parseMoney(str(form, "amount"));
  const day = Number(str(form, "day_of_month"));
  const start = str(form, "start_date");
  const end = str(form, "end_date");
  if (type !== "income" && type !== "expense") return { error: "Escolha receita ou despesa." };
  if (!entityId) return { error: "Escolha a Entidade." };
  if (description.length < 2) return { error: "Descreva a recorrência." };
  if (!amount || amount <= 0) return { error: "Informe um valor válido." };
  if (!(day >= 1 && day <= 28)) return { error: "Dia do vencimento entre 1 e 28." };
  if (!DATE.test(start)) return { error: "Informe o início." };

  const supabase = await createClient();
  const { error } = await supabase.from("fin_recurrences").insert({
    type,
    entity_id: entityId,
    description: description.slice(0, 140),
    category_id: optId(form, "category_id"),
    counterparty_id: optId(form, "counterparty_id"),
    account_id: optId(form, "account_id"),
    allocation_rule_id: optId(form, "allocation_rule_id"),
    amount_cents: amount,
    frequency: str(form, "frequency") === "yearly" ? "yearly" : "monthly",
    day_of_month: day,
    start_date: start,
    end_date: DATE.test(end) ? end : null,
    is_infrastructure: form.get("is_infrastructure") === "on",
  });
  if (error) return { error: fail(error.message) };
  const { data: created } = await supabase.rpc("fin_generate_recurrences");
  done();
  return { message: `Recorrência criada. ${created ?? 0} lançamento(s) previsto(s) gerado(s) para os próximos meses.` };
}

export async function toggleRecurrence(form: FormData) {
  await requireFinance();
  const id = optId(form, "id");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("fin_recurrences").update({ active: form.get("active") === "true" }).eq("id", id);
  done();
}

export async function generateRecurrences(_: FormState): Promise<FormState> {
  await requireFinance();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fin_generate_recurrences");
  if (error) return { error: "Não foi possível gerar agora." };
  done();
  return { message: data ? `${data} lançamento(s) previsto(s) gerado(s).` : "Tudo em dia: nenhum lançamento novo." };
}

// ------------------------------------------------------------------ orçamento

export async function saveBudget(_: FormState, form: FormData): Promise<FormState> {
  await requireFinance();
  const entityId = optId(form, "entity_id");
  if (!entityId) return { error: "Escolha uma entidade." };
  const upserts: { entity_id: string; category_id: string; month: string; amount_cents: number }[] = [];
  for (const [key, value] of form.entries()) {
    const m = /^b_([0-9a-f-]{36})_(\d{4}-\d{2})$/.exec(key);
    if (!m) continue;
    const text = String(value).trim();
    const cents = text ? parseMoney(text) : 0;
    if (cents == null || cents < 0) return { error: `Valor inválido: “${text}”.` };
    upserts.push({ entity_id: entityId, category_id: m[1], month: `${m[2]}-01`, amount_cents: cents });
  }
  const supabase = await createClient();
  const months = [...new Set(upserts.map((u) => u.month))].sort();
  const { data: existing } = await supabase
    .from("fin_budgets")
    .select("category_id,month,amount_cents")
    .eq("entity_id", entityId)
    .gte("month", months[0] ?? "1900-01-01")
    .lte("month", months.at(-1) ?? "1900-01-01");
  const before = new Map((existing ?? []).map((b) => [`${b.category_id}_${b.month}`, Number(b.amount_cents)]));
  // Grava só o que mudou (evita centenas de linhas de auditoria a cada salvamento).
  const changed = upserts.filter((u) => (before.get(`${u.category_id}_${u.month}`) ?? 0) !== u.amount_cents);
  if (!changed.length) return { message: "Nada mudou." };
  const { error } = await supabase.from("fin_budgets").upsert(changed, { onConflict: "entity_id,category_id,month" });
  if (error) return { error: fail(error.message) };
  done();
  return { message: `Orçamento salvo (${changed.length} valor(es) alterado(s)).` };
}

// ------------------------------------------------------------------ aportes

export async function saveContribution(_: FormState, form: FormData): Promise<FormState> {
  await requireFinance();
  const partner = str(form, "partner_name");
  const entityId = optId(form, "entity_id");
  const amount = parseMoney(str(form, "amount"));
  const date = str(form, "date");
  if (partner.length < 2) return { error: "Informe o sócio." };
  if (!entityId) return { error: "Escolha a Entidade." };
  if (!amount || amount <= 0) return { error: "Informe um valor válido." };
  if (!DATE.test(date)) return { error: "Informe a data." };
  const supabase = await createClient();
  const { error } = await supabase.from("fin_partner_contributions").insert({
    partner_name: partner.slice(0, 80),
    entity_id: entityId,
    kind: str(form, "kind") === "withdrawal" ? "withdrawal" : "contribution",
    amount_cents: amount,
    date,
    account_id: optId(form, "account_id"),
    notes: str(form, "notes").slice(0, 500) || null,
  });
  if (error) return { error: fail(error.message) };
  done();
  return { message: "Movimentação registrada." };
}

export async function deleteContribution(form: FormData) {
  await requireFinance();
  const id = optId(form, "id");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("fin_partner_contributions").delete().eq("id", id);
  done();
}

// ------------------------------------------------------------------ metas

export async function saveTargets(_: FormState, form: FormData): Promise<FormState> {
  await requireFinance();
  const entityId = optId(form, "entity_id");
  if (!entityId) return { error: "Escolha uma entidade." };
  const goal = str(form, "revenue_goal");
  const margin = str(form, "margin_goal").replace(",", ".");
  const supabase = await createClient();
  const { error } = await supabase.from("fin_targets").upsert({
    entity_id: entityId,
    monthly_revenue_goal_cents: goal ? parseMoney(goal) : null,
    margin_goal_percent: margin ? Math.max(-100, Math.min(100, Number(margin))) : null,
  });
  if (error) return { error: fail(error.message) };
  done();
  return { message: "Metas salvas." };
}

// ------------------------------------------------------------------ cadastros (Configurações → Financeiro)

export async function saveCategory(_: FormState, form: FormData): Promise<FormState> {
  await requireFinance();
  const id = optId(form, "id");
  const name = str(form, "name");
  const type = str(form, "type");
  if (name.length < 2) return { error: "Informe o nome." };
  if (!id && type !== "income" && type !== "expense") return { error: "Escolha o tipo." };
  const values = {
    name: name.slice(0, 60),
    group_name: str(form, "group_name").slice(0, 60) || null,
    is_fixed: form.get("is_fixed") === "on",
    active: id ? form.get("active") === "on" : true,
  };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("fin_categories").update(values).eq("id", id)
    : await supabase.from("fin_categories").insert({ ...values, type });
  if (error) return { error: /duplicate|unique/i.test(error.message) ? "Já existe uma categoria com esse nome." : fail(error.message) };
  done();
  return { message: "Categoria salva." };
}

export async function saveAccount(_: FormState, form: FormData): Promise<FormState> {
  await requireFinance();
  const id = optId(form, "id");
  const name = str(form, "name");
  const entityId = optId(form, "entity_id");
  const opening = parseMoney(str(form, "opening_balance") || "0");
  const openingDate = str(form, "opening_date");
  if (name.length < 2) return { error: "Informe o nome da conta." };
  if (!entityId) return { error: "Escolha a Entidade." };
  if (opening == null) return { error: "Saldo inicial inválido." };
  const values = {
    name: name.slice(0, 60),
    entity_id: entityId,
    kind: ["bank", "cash", "wallet", "card"].includes(str(form, "kind")) ? str(form, "kind") : "bank",
    opening_balance_cents: opening,
    opening_date: DATE.test(openingDate) ? openingDate : todayISO(),
    active: id ? form.get("active") === "on" : true,
  };
  const supabase = await createClient();
  const { error } = id ? await supabase.from("fin_accounts").update(values).eq("id", id) : await supabase.from("fin_accounts").insert(values);
  if (error) return { error: fail(error.message) };
  done();
  return { message: "Conta salva." };
}

export async function saveRule(_: FormState, form: FormData): Promise<FormState> {
  await requireFinance();
  const id = optId(form, "id");
  const name = str(form, "name");
  if (name.length < 2) return { error: "Informe o nome da regra." };
  const shares: { entity_id: string; percent: number }[] = [];
  for (const [key, value] of form.entries()) {
    const m = /^p_([0-9a-f-]{36})$/.exec(key);
    const pct = Number(String(value).replace(",", "."));
    if (m && pct > 0) shares.push({ entity_id: m[1], percent: Math.round(pct * 100) / 100 });
  }
  const total = shares.reduce((s, x) => s + x.percent, 0);
  if (Math.abs(total - 100) > 0.01) return { error: `Os percentuais precisam somar 100% (hoje somam ${total.toLocaleString("pt-BR")}%).` };

  const supabase = await createClient();
  let ruleId = id;
  if (id) {
    const { error } = await supabase.from("fin_allocation_rules").update({ name: name.slice(0, 60), description: str(form, "description") || null, active: form.get("active") === "on" }).eq("id", id);
    if (error) return { error: fail(error.message) };
    await supabase.from("fin_allocation_shares").delete().eq("rule_id", id);
  } else {
    const { data, error } = await supabase.from("fin_allocation_rules").insert({ name: name.slice(0, 60), description: str(form, "description") || null }).select("id").single();
    if (error) return { error: /duplicate|unique/i.test(error.message) ? "Já existe uma regra com esse nome." : fail(error.message) };
    ruleId = data.id;
  }
  const { error } = await supabase.from("fin_allocation_shares").insert(shares.map((s) => ({ ...s, rule_id: ruleId })));
  if (error) return { error: fail(error.message) };
  done();
  return { message: "Regra de rateio salva." };
}
