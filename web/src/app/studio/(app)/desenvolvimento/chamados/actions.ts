"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { isClosed } from "@/lib/studio/ticket-labels";
import { checkTicketFiles, removeTicketFiles, signedTicketUpload, TICKET_EXT, type TicketFile } from "@/lib/studio/tickets";
import { requireStudio } from "@/lib/studio/session";
import { createClient } from "@/lib/supabase/server";

export type TicketState = { error?: string; message?: string; id?: string } | undefined;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const KINDS = ["melhoria", "problema", "duvida", "outro"];
const STATUSES = ["aberto", "em_analise", "concluido", "recusado"];
const PRIORITIES = ["baixa", "media", "alta"];

const refresh = () => revalidatePath("/studio", "layout");

/** Link para o navegador enviar uma imagem direto ao armazenamento privado (pasta do próprio usuário). */
export async function ticketUploadUrl(ext: string) {
  const ctx = await requireStudio();
  const e = ext.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!TICKET_EXT.includes(e)) throw new Error("Envie uma imagem PNG, JPG, WebP ou GIF.");
  const path = `${ctx.profile.id}/${randomUUID()}.${e}`;
  return { path, url: await signedTicketUpload(path) };
}

export async function openTicket(input: { entityId: string; kind: string; title: string; description: string; files: TicketFile[] }): Promise<TicketState> {
  const ctx = await requireStudio();
  let files: TicketFile[] = [];
  try {
    files = checkTicketFiles(input.files, ctx.profile.id);
    const title = String(input.title ?? "").trim();
    if (title.length < 3) return { error: "Escreva um título (pelo menos 3 letras)." };
    if (!UUID.test(input.entityId) || !ctx.visible.some((e) => e.id === input.entityId)) return { error: "Escolha o sistema." };
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("tickets")
      .insert({
        entity_id: input.entityId,
        kind: KINDS.includes(input.kind) ? input.kind : "melhoria",
        title: title.slice(0, 140),
        description: String(input.description ?? "").slice(0, 5000),
        attachments: files,
        created_by: ctx.profile.id,
      })
      .select("id,number")
      .single();
    if (error || !data) throw new Error("Não foi possível abrir o chamado.");
    refresh();
    return { message: `Chamado #${data.number} aberto. Você acompanha a resposta aqui.`, id: data.id };
  } catch (e) {
    // se não gravou, não deixa imagem órfã
    await removeTicketFiles(files.map((f) => f.path)).catch(() => undefined);
    return { error: (e as Error).message };
  }
}

/** Sócio/Admin: muda a situação, a prioridade e a resposta. Ao fechar, apaga as imagens. */
export async function updateTicket(id: string, input: { status: string; priority: string; answer: string }): Promise<TicketState> {
  try {
    const ctx = await requireStudio();
    if (!ctx.isAdmin) return { error: "Só Sócio/Admin trata chamados." };
    if (!UUID.test(id) || !STATUSES.includes(input.status)) return { error: "Dados inválidos." };
    const supabase = await createClient();
    const { data: t } = await supabase.from("tickets").select("status,attachments").eq("id", id).maybeSingle();
    if (!t) return { error: "Chamado não encontrado." };
    const closing = isClosed(input.status);
    const patch: Record<string, unknown> = {
      status: input.status,
      priority: PRIORITIES.includes(input.priority) ? input.priority : null,
      answer: String(input.answer ?? "").trim().slice(0, 3000) || null,
      closed_at: closing ? new Date().toISOString() : null,
      closed_by: closing ? ctx.profile.id : null,
    };
    const files = (t.attachments ?? []) as TicketFile[];
    if (closing && files.length) {
      await removeTicketFiles(files.map((f) => f.path));
      patch.attachments = [];
      patch.attachments_purged_at = new Date().toISOString();
    }
    const { error } = await supabase.from("tickets").update(patch).eq("id", id);
    if (error) return { error: "Não foi possível salvar." };
    refresh();
    return { message: closing ? (files.length ? "Chamado fechado. As imagens foram apagadas para liberar espaço." : "Chamado fechado.") : "Chamado atualizado." };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** Sócio/Admin: vira um item do Backlog (o chamado passa para "Em análise" e fica ligado ao item). */
export async function ticketToBacklog(id: string): Promise<TicketState> {
  try {
    const ctx = await requireStudio();
    if (!ctx.isAdmin) return { error: "Só Sócio/Admin." };
    if (!UUID.test(id)) return { error: "Chamado inválido." };
    const supabase = await createClient();
    const { data: t } = await supabase.from("tickets").select("number,entity_id,kind,title,description,backlog_item_id,created_by").eq("id", id).maybeSingle();
    if (!t) return { error: "Chamado não encontrado." };
    if (t.backlog_item_id) return { error: "Este chamado já está no Backlog." };
    const { data: author } = await supabase.from("profiles").select("full_name,email").eq("id", t.created_by).maybeSingle();
    const { data: item, error } = await supabase
      .from("backlog_items")
      .insert({
        entity_id: t.entity_id,
        type: t.kind === "problema" ? "bug" : t.kind === "melhoria" ? "improvement" : "feature",
        title: t.title,
        description: `${t.description}\n\n(Chamado #${t.number})`.trim(),
        status: "new",
        priority: "medium",
        severity: "medium",
        source: "chamado",
        reporter_name: author?.full_name || author?.email || null,
      })
      .select("id")
      .single();
    if (error || !item) return { error: "Não foi possível criar o item no Backlog." };
    await supabase.from("tickets").update({ backlog_item_id: item.id, status: "em_analise" }).eq("id", id);
    refresh();
    return { message: "Enviado para o Backlog.", id: item.id };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function deleteTicket(id: string): Promise<TicketState> {
  try {
    const ctx = await requireStudio();
    if (!ctx.isAdmin) return { error: "Só Sócio/Admin." };
    if (!UUID.test(id)) return { error: "Chamado inválido." };
    const supabase = await createClient();
    const { data: t } = await supabase.from("tickets").select("attachments").eq("id", id).maybeSingle();
    if (!t) return { error: "Chamado não encontrado." };
    await removeTicketFiles(((t.attachments ?? []) as TicketFile[]).map((f) => f.path));
    const { error } = await supabase.from("tickets").delete().eq("id", id);
    if (error) return { error: "Não foi possível excluir." };
    refresh();
    return { message: "Chamado excluído." };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
