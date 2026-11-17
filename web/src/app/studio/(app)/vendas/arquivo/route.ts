import { NextResponse, type NextRequest } from "next/server";
import { SALES_BUCKET, salesAdmin } from "@/lib/studio/sales-files";
import { requireStudio } from "@/lib/studio/session";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Abre ou baixa um arquivo de Vendas. A permissão é conferida pelo banco (RLS): só
// quem vê a empresa do documento recebe o link, que vale 1 minuto.
export async function GET(request: NextRequest) {
  await requireStudio();
  const sp = request.nextUrl.searchParams;
  const table = sp.get("t") === "m" ? "materials" : "documents";
  const id = sp.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "inválido" }, { status: 400 });
  const supabase = await createClient();
  const { data } = await supabase.from(table).select("storage_path,file_name").eq("id", id).maybeSingle();
  if (!data?.storage_path) return NextResponse.json({ error: "não encontrado" }, { status: 404 });
  const download = sp.get("baixar") ? (data.file_name ?? true) : undefined;
  const { data: link } = await salesAdmin().storage.from(SALES_BUCKET).createSignedUrl(data.storage_path, 60, { download });
  if (!link?.signedUrl) return NextResponse.json({ error: "indisponível" }, { status: 404 });
  return NextResponse.redirect(link.signedUrl, { headers: { "Cache-Control": "no-store" } });
}
