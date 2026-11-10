import { NextResponse } from "next/server";
import { requireFinance } from "@/lib/studio/finance";
import { createClient } from "@/lib/supabase/server";

// Abre o comprovante de um lançamento por um link temporário (60 s).
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireFinance();
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("fin_transactions").select("attachment_path").eq("id", id).maybeSingle();
  if (!data?.attachment_path) return new NextResponse("Comprovante não encontrado.", { status: 404 });
  const { data: signed } = await supabase.storage.from("fin-attachments").createSignedUrl(data.attachment_path, 60);
  if (!signed?.signedUrl) return new NextResponse("Comprovante indisponível.", { status: 404 });
  return NextResponse.redirect(signed.signedUrl);
}
