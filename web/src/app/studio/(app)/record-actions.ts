"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseMoney } from "@/lib/studio/finance-math";
import { RECORDS, type FieldDef, type RecordDef, type RecordKind } from "@/lib/studio/records";
import { requireStudio } from "@/lib/studio/session";
import { createClient } from "@/lib/supabase/server";

export type RecordState = { error?: string; message?: string; id?: string } | undefined;

const UUID = /^[0-9a-f-]{36}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function parseField(f: FieldDef, raw: FormDataEntryValue | null): { value?: unknown; error?: string } {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (f.kind === "bool") return { value: raw === "on" || raw === "true" };
  if (!text) return f.required ? { error: `Preencha “${f.label}”.` } : { value: f.kind === "money" || f.kind === "int" ? 0 : null };
  if (f.max && text.length > f.max) return { error: `“${f.label}” aceita até ${f.max} caracteres.` };
  switch (f.kind) {
    case "date":
      return DATE.test(text) ? { value: text } : { error: `Data inválida em “${f.label}”.` };
    case "select":
      return f.options?.some((o) => o[0] === text) ? { value: text } : { error: `Opção inválida em “${f.label}”.` };
    case "money": {
      const cents = parseMoney(text);
      return cents != null && cents >= 0 ? { value: cents } : { error: `Valor inválido em “${f.label}”.` };
    }
    case "int": {
      const n = Number(text);
      return Number.isInteger(n) ? { value: n } : { error: `Número inválido em “${f.label}”.` };
    }
    case "entity":
    case "ref":
      return UUID.test(text) ? { value: text } : { error: `Seleção inválida em “${f.label}”.` };
    case "email":
      return EMAIL.test(text) ? { value: text.toLowerCase() } : { error: `E-mail inválido em “${f.label}”.` };
    case "url":
      return /^https:\/\/\S+$/.test(text) ? { value: text } : { error: `“${f.label}” precisa começar com https://` };
    default:
      return { value: text };
  }
}

function friendly(message: string) {
  if (/row-level security|permission/i.test(message)) return "Você não tem permissão para alterar este registro.";
  if (/duplicate|unique/i.test(message)) return "Já existe um registro igual.";
  return "Não foi possível salvar. Revise os campos e tente novamente.";
}

export async function saveRecord(kind: RecordKind, _: RecordState, form: FormData): Promise<RecordState> {
  const ctx = await requireStudio();
  if (!ctx.canWrite) return { error: "Seu acesso é somente leitura." };
  const def = RECORDS[kind];
  if (!def) return { error: "Tipo inválido." };
  const values: Record<string, unknown> = {};
  for (const f of def.fields as readonly FieldDef[]) {
    const { value, error } = parseField(f, form.get(f.name));
    if (error) return { error };
    values[f.name] = value;
  }
  if (kind === "leads" && values.stage === "lost" && !values.lost_reason) return { error: "Informe o motivo da perda." };

  const supabase = await createClient();
  const id = String(form.get("id") ?? "");
  let savedId = id;
  if (UUID.test(id)) {
    const { error } = await supabase.from(def.table).update(values).eq("id", id);
    if (error) return { error: friendly(error.message) };
  } else {
    const { data, error } = await supabase.from(def.table).insert(values).select("id").single();
    if (error) return { error: friendly(error.message) };
    savedId = data.id;
  }
  revalidatePath("/studio", "layout");
  const back = String(form.get("back") ?? "");
  if (back.startsWith("/studio/")) redirect(back.replace("{id}", savedId));
  return { message: `${def.label} salvo(a).`, id: savedId };
}

/** Alteração rápida de um campo permitido (ex.: mover tarefa no quadro). */
export async function quickUpdate(form: FormData) {
  const ctx = await requireStudio();
  if (!ctx.canWrite) return;
  const kind = String(form.get("kind")) as RecordKind;
  const def = RECORDS[kind] as RecordDef | undefined;
  const field = String(form.get("field"));
  const id = String(form.get("id"));
  if (!def || !UUID.test(id) || !def.quick?.includes(field)) return;
  const f = (def.fields as readonly FieldDef[]).find((x) => x.name === field);
  if (!f) return;
  const { value, error } = parseField(f, form.get("value"));
  if (error) return;
  const supabase = await createClient();
  await supabase.from(def.table).update({ [field]: value }).eq("id", id);
  revalidatePath("/studio", "layout");
}

export async function deleteRecord(form: FormData) {
  const ctx = await requireStudio();
  if (!ctx.canWrite) return;
  const kind = String(form.get("kind")) as RecordKind;
  const def = RECORDS[kind];
  const id = String(form.get("id"));
  if (!def || !UUID.test(id)) return;
  const supabase = await createClient();
  await supabase.from(def.table).delete().eq("id", id);
  revalidatePath("/studio", "layout");
  const back = String(form.get("back") ?? "");
  if (back.startsWith("/studio/")) redirect(back);
}
