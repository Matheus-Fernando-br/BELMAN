import { NextResponse, type NextRequest } from "next/server";
import { syncAllProducts } from "@/lib/studio/product-sync";
import { timingSafeEqual } from "node:crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Chamado pelo Vercel Cron (vercel.json) com "Authorization: Bearer $CRON_SECRET".
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (!secret || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const results = await syncAllProducts("cron");
  // Só status; nenhuma métrica sai nesta resposta.
  return NextResponse.json({ ok: results.every((r) => r.ok), products: results.map((r) => ({ slug: r.slug, ok: r.ok })) }, { headers: { "Cache-Control": "no-store" } });
}
