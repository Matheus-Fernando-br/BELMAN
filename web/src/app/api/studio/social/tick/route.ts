import { after, NextResponse, type NextRequest } from "next/server";
import { sb } from "@/lib/social/engine/db";
import { tick } from "@/lib/social/engine/tick";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Chamado pelo Supabase (pg_cron + pg_net) a cada 2 minutos. O token fica só no Vault do
// Supabase; aqui ele é conferido por uma função restrita à service role.
export async function POST(request: NextRequest) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: ok } = token.length >= 32 ? await sb().rpc("social_cron_check", { p_token: token }) : { data: false };
  if (!ok) return NextResponse.json({ ok: false }, { status: 401 });
  // responde já e trabalha em segundo plano (até o limite da função)
  after(() => tick({ budgetMs: 280_000 }));
  return NextResponse.json({ ok: true }, { status: 202, headers: { "Cache-Control": "no-store" } });
}
