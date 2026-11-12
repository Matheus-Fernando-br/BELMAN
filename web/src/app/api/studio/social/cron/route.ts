import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { generateAndStore, loadBrand } from "@/lib/social/posts";
import { checkAndRefresh, collectMetrics, publishDue } from "@/lib/social/publish";
import { createAdminClient } from "@/lib/supabase/server";
import type { Format } from "@/lib/social/ai";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Agendador das redes sociais (chamado pelo pg_cron do Supabase com Bearer SOCIAL_CRON_SECRET).
//  job=publish  → a cada 10 min: publica o que foi aprovado e agendado
//  job=generate → segunda 8h: gera a semana das marcas com geração automática ligada
//  job=daily    → diário: métricas + confere/renova tokens
function authorized(request: NextRequest) {
  const secret = process.env.SOCIAL_CRON_SECRET;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  return Boolean(secret && secret.length >= 32 && given.length === expected.length && timingSafeEqual(given, expected));
}

async function handle(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ ok: false }, { status: 401 });
  const job = request.nextUrl.searchParams.get("job");
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false }, { status: 500 });
  const headers = { "Cache-Control": "no-store" };

  if (job === "publish") {
    const r = await publishDue(3);
    return NextResponse.json({ ok: true, published: r.filter((x) => x.ok).length, failed: r.filter((x) => !x.ok).length }, { headers });
  }
  if (job === "generate") {
    const { data: brands } = await admin.from("social_brand_profiles").select("entity_id").eq("auto_generate", true);
    let created = 0;
    for (const { entity_id } of brands ?? []) {
      const b = await loadBrand(entity_id);
      if (!b || !b.posts_per_week) continue;
      const formats = (b.formats.length ? b.formats : ["carousel"]) as Format[];
      const plan = Array.from({ length: Math.min(b.posts_per_week, 7) }, (_, i) => ({ format: formats[i % formats.length] }));
      try {
        const r = await generateAndStore({ entityId: entity_id, kind: "weekly", plan, userId: null, schedule: true });
        created += r.ids.length;
      } catch {
        // falha já registrada em social_generations
      }
    }
    return NextResponse.json({ ok: true, created }, { headers });
  }
  if (job === "daily") {
    const { data: conns } = await admin.from("social_connections").select("entity_id").eq("network", "instagram").neq("status", "disconnected");
    const tokens = [];
    for (const c of conns ?? []) tokens.push((await checkAndRefresh(c.entity_id)).ok);
    const metrics = await collectMetrics().catch(() => 0);
    return NextResponse.json({ ok: true, tokens_ok: tokens.filter(Boolean).length, tokens_total: tokens.length, metrics }, { headers });
  }
  return NextResponse.json({ ok: false, error: "job inválido" }, { status: 400, headers });
}

export const GET = handle;
export const POST = handle;
