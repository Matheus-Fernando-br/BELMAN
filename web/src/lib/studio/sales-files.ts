import "server-only";
import { createAdminClient } from "@/lib/supabase/server";

// Arquivos de Vendas (contratos e materiais): bucket privado "sales-files".
// O navegador envia direto ao Storage por um link assinado gerado aqui, depois de
// conferir a permissão; para baixar, gera um link que vale 1 minuto.

export const SALES_BUCKET = "sales-files";
export const SALES_EXT = ["pdf", "png", "jpg", "jpeg", "webp", "svg", "gif", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "txt", "zip", "mp4", "ai", "psd", "cdr", "eps"];

export function salesAdmin() {
  const a = createAdminClient();
  if (!a) throw new Error("Armazenamento indisponível (SUPABASE_SECRET_KEY).");
  return a;
}

export async function signedSalesUpload(path: string) {
  const { data, error } = await salesAdmin().storage.from(SALES_BUCKET).createSignedUploadUrl(path, { upsert: true });
  if (error || !data) throw new Error("Não foi possível preparar o envio.");
  return data.signedUrl;
}

export async function signedSalesUrls(paths: string[], seconds = 600) {
  if (!paths.length) return new Map<string, string>();
  const { data } = await salesAdmin().storage.from(SALES_BUCKET).createSignedUrls(paths, seconds);
  return new Map((data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path as string, d.signedUrl as string]));
}

export async function removeSalesFiles(paths: (string | null | undefined)[]) {
  const list = paths.filter((p): p is string => Boolean(p));
  if (list.length) await salesAdmin().storage.from(SALES_BUCKET).remove(list);
}

export const isImage = (mime?: string | null) => Boolean(mime && /^image\/(png|jpe?g|webp|gif)$/.test(mime));

export function fileSize(bytes?: number | null) {
  if (!bytes) return "";
  return bytes > 1048576 ? `${(bytes / 1048576).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
