import { NextResponse, type NextRequest } from "next/server";
import { requireStudio } from "@/lib/studio/session";
import { createClient } from "@/lib/supabase/server";

// Abre um anexo do Desenvolvimento por link temporário (60 s).
export async function GET(request: NextRequest) {
  await requireStudio();
  const path = request.nextUrl.searchParams.get("p") ?? "";
  if (!/^(backlog|feedback)\/[0-9a-f-]{36}\/[\w.-]+$/.test(path)) return new NextResponse("Arquivo inválido.", { status: 400 });
  const supabase = await createClient();
  const { data } = await supabase.storage.from("dev-attachments").createSignedUrl(path, 60);
  if (!data?.signedUrl) return new NextResponse("Arquivo indisponível.", { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
