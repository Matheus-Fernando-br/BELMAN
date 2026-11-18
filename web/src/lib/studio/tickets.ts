import "server-only";
import { createAdminClient } from "@/lib/supabase/server";

// Chamados do Desenvolvimento: imagens no bucket privado "ticket-files".
// O navegador envia direto por link assinado (gerado depois de conferir quem é);
// para ver, link que vale 10 minutos; ao fechar o chamado, as imagens são apagadas.

export const TICKET_BUCKET = "ticket-files";
export const TICKET_EXT = ["png", "jpg", "jpeg", "webp", "gif"];
export const TICKET_MAX_BYTES = 5 * 1024 * 1024;
export const TICKET_MAX_FILES = 2;

export type TicketFile = { path: string; name: string; mime: string; bytes: number };

function admin() {
  const a = createAdminClient();
  if (!a) throw new Error("Armazenamento indisponível (SUPABASE_SECRET_KEY).");
  return a;
}

export async function signedTicketUpload(path: string) {
  const { data, error } = await admin().storage.from(TICKET_BUCKET).createSignedUploadUrl(path, { upsert: true });
  if (error || !data) throw new Error("Não foi possível preparar o envio da imagem.");
  return data.signedUrl;
}

export async function signedTicketUrls(paths: string[], seconds = 600) {
  if (!paths.length) return new Map<string, string>();
  const { data } = await admin().storage.from(TICKET_BUCKET).createSignedUrls(paths, seconds);
  return new Map((data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path as string, d.signedUrl as string]));
}

export async function removeTicketFiles(paths: string[]) {
  if (!paths.length) return;
  const { error } = await admin().storage.from(TICKET_BUCKET).remove(paths);
  if (error) throw new Error("Não foi possível apagar as imagens.");
}

/** Confere os arquivos enviados pelo navegador: só do próprio usuário, imagens, até 2 e 5 MB cada. */
export function checkTicketFiles(files: unknown, userId: string): TicketFile[] {
  if (!Array.isArray(files)) return [];
  if (files.length > TICKET_MAX_FILES) throw new Error(`No máximo ${TICKET_MAX_FILES} imagens.`);
  return files.map((f) => {
    const x = f as Partial<TicketFile>;
    const path = String(x.path ?? "");
    const ext = path.split(".").pop() ?? "";
    if (!path.startsWith(`${userId}/`) || path.includes("..") || !TICKET_EXT.includes(ext)) throw new Error("Imagem inválida.");
    const bytes = Number(x.bytes);
    if (!Number.isFinite(bytes) || bytes <= 0 || bytes > TICKET_MAX_BYTES) throw new Error("Cada imagem pode ter até 5 MB.");
    const mime = String(x.mime ?? "");
    if (!mime.startsWith("image/")) throw new Error("Envie apenas imagens.");
    return { path, name: String(x.name ?? "imagem").slice(0, 120), mime, bytes };
  });
}
