"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { passwordProblem } from "@/lib/studio/password";
import { requireAdmin, requireStudio, type Role } from "@/lib/studio/session";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; message?: string } | undefined;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ROLES: Role[] = ["admin", "collaborator", "viewer"];
const URL_OK = (v: string) => !v || /^https:\/\/[^\s]+$/.test(v);

async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

function dbError(message: string) {
  if (/Sócio\/Admin/.test(message)) return message;
  return "Não foi possível salvar. Tente novamente.";
}

// ------------------------------------------------------------------ usuários

export async function inviteUser(_: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const fullName = String(form.get("full_name") ?? "").trim().slice(0, 80);
  const role = String(form.get("role")) as Role;
  const allEntities = form.get("all_entities") === "on";
  const entityIds = form.getAll("entity_ids").map(String);
  if (!EMAIL.test(email)) return { error: "Informe um e-mail válido." };
  if (!ROLES.includes(role)) return { error: "Escolha um papel." };
  if (!allEntities && role !== "admin" && !entityIds.length) return { error: "Escolha ao menos um produto ou marque “todos”." };

  const supabase = await createClient();
  const { error } = await supabase.from("invitations").upsert({
    email,
    role,
    all_entities: role === "admin" ? true : allEntities,
    entity_ids: role === "admin" || allEntities ? [] : entityIds,
    accepted_at: null,
  });
  if (error) return { error: dbError(error.message) };

  const admin = createAdminClient();
  revalidatePath("/studio/configuracoes/usuarios");
  if (!admin) {
    return {
      message:
        "Convite registrado. O e-mail não foi enviado porque a chave secreta do Supabase não está configurada no servidor (SUPABASE_SECRET_KEY). Envie pelo painel do Supabase: Authentication → Users → Invite user.",
    };
  }
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${await origin()}/studio/auth/callback?next=/studio/definir-senha`,
    data: fullName ? { full_name: fullName } : undefined,
  });
  if (inviteError) {
    return {
      error: /already|registered|exists/i.test(inviteError.message)
        ? "Este e-mail já tem conta. Ajuste o acesso na lista de usuários."
        : "O convite foi registrado, mas o e-mail não pôde ser enviado agora. Tente novamente em alguns minutos.",
    };
  }
  return { message: `Convite enviado para ${email}.` };
}

export async function revokeInvitation(form: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("invitations").delete().eq("email", String(form.get("email"))).is("accepted_at", null);
  revalidatePath("/studio/configuracoes/usuarios");
}

export async function updateMember(_: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const id = String(form.get("id"));
  const role = String(form.get("role")) as Role;
  const active = form.get("active") === "on";
  const allEntities = role === "admin" || form.get("all_entities") === "on";
  const entityIds = form.getAll("entity_ids").map(String);
  if (!ROLES.includes(role)) return { error: "Papel inválido." };
  if (!allEntities && !entityIds.length) return { error: "Escolha ao menos um produto ou marque “todos”." };

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ role, active, all_entities: allEntities }).eq("id", id);
  if (error) return { error: dbError(error.message) };

  await supabase.from("user_entity_access").delete().eq("user_id", id);
  if (!allEntities) {
    const { error: accessError } = await supabase
      .from("user_entity_access")
      .insert(entityIds.map((entity_id) => ({ user_id: id, entity_id })));
    if (accessError) return { error: dbError(accessError.message) };
  }
  revalidatePath("/studio/configuracoes/usuarios");
  return { message: "Acesso atualizado." };
}

// ------------------------------------------------------------------ entidades / produtos

export async function saveEntity(_: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const id = String(form.get("id") ?? "");
  const name = String(form.get("name") ?? "").trim();
  const slug = String(form.get("slug") ?? "").trim().toLowerCase();
  const color = String(form.get("color") ?? "#000000").toUpperCase();
  const values = {
    name,
    color,
    description: String(form.get("description") ?? "").trim() || null,
    site_url: String(form.get("site_url") ?? "").trim() || null,
    admin_url: String(form.get("admin_url") ?? "").trim() || null,
    metrics_url: String(form.get("metrics_url") ?? "").trim() || null,
    active: form.get("active") === "on",
  };
  if (name.length < 2) return { error: "Informe o nome." };
  if (!/^#[0-9A-F]{6}$/.test(color)) return { error: "Cor inválida." };
  if (![values.site_url, values.admin_url, values.metrics_url].every((v) => URL_OK(v ?? "")))
    return { error: "Os links precisam começar com https://" };

  const supabase = await createClient();
  if (id) {
    const { error } = await supabase.from("entities").update(values).eq("id", id);
    if (error) return { error: dbError(error.message) };
  } else {
    if (!/^[a-z0-9-]{2,40}$/.test(slug)) return { error: "Identificador: letras minúsculas, números e hífen." };
    const { error } = await supabase.from("entities").insert({ ...values, slug, kind: "product", sort_order: 50 });
    if (error) return { error: /duplicate|unique/i.test(error.message) ? "Já existe um produto com esse identificador." : dbError(error.message) };
  }
  revalidatePath("/studio", "layout");
  return { message: id ? "Produto atualizado." : "Produto adicionado ao ecossistema." };
}

// ------------------------------------------------------------------ segurança (própria conta)

export async function updateMyName(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireStudio();
  const fullName = String(form.get("full_name") ?? "").trim().slice(0, 80);
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ full_name: fullName || null }).eq("id", ctx.profile.id);
  if (error) return { error: dbError(error.message) };
  revalidatePath("/studio", "layout");
  return { message: "Nome atualizado." };
}

export async function changePassword(_: FormState, form: FormData): Promise<FormState> {
  await requireStudio();
  const password = String(form.get("password") ?? "");
  const problem = passwordProblem(password);
  if (problem) return { error: problem };
  if (password !== String(form.get("confirm") ?? "")) return { error: "As senhas não conferem." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: /same|different/i.test(error.message) ? "A nova senha precisa ser diferente da atual." : "Não foi possível trocar a senha." };
  return { message: "Senha alterada." };
}

export type MfaEnrollState =
  | { step: "idle"; error?: string }
  | { step: "verify"; factorId: string; qr: string; secret: string; error?: string }
  | { step: "done" };

export async function enrollMfa(state: MfaEnrollState, form: FormData): Promise<MfaEnrollState> {
  await requireStudio();
  const supabase = await createClient();

  if (state.step === "verify") {
    const code = String(form.get("code") ?? "").replace(/\s/g, "");
    if (!/^\d{6}$/.test(code)) return { ...state, error: "Digite o código de 6 dígitos." };
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: state.factorId, code });
    if (error) return { ...state, error: "Código inválido. Confira o horário do celular e tente de novo." };
    revalidatePath("/studio/configuracoes/seguranca");
    return { step: "done" };
  }

  // Remove unfinished enrollments before starting a new one.
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const f of factors?.all ?? []) {
    if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Studio ${Date.now()}` });
  if (error || !data) return { step: "idle", error: "Não foi possível iniciar o 2FA agora." };
  return { step: "verify", factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

export async function disableMfa(_: FormState, form: FormData): Promise<FormState> {
  await requireStudio();
  const supabase = await createClient();
  const factorId = String(form.get("factorId"));
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) return { error: "Para desativar, entre novamente usando o código do aplicativo." };
  revalidatePath("/studio/configuracoes/seguranca");
  return { message: "Verificação em duas etapas desativada." };
}
