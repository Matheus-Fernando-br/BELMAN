import { db, log, TZ } from "./db.js";

// Todo início de mês: lança no Financeiro o custo do mês anterior com IA (por produto, pelo
// ai_usage) e com o worker (rateado pela mesma proporção). Idempotente por external_ref.

const USD_BRL = Number(process.env.USD_BRL ?? 5.4);
const WORKER_USD = Number(process.env.WORKER_MONTHLY_USD ?? (process.env.SOCIAL_VIDEO === "1" ? 25 : 7));

export async function monthlyCosts(now = new Date()) {
  const local = now.toLocaleDateString("sv-SE", { timeZone: TZ });
  const [y, m] = local.split("-").map(Number);
  const prev = new Date(Date.UTC(y, m - 2, 1));
  const key = prev.toISOString().slice(0, 7);
  const label = prev.toLocaleDateString("pt-BR", { month: "short", year: "numeric", timeZone: "UTC" }).replace(".", "");
  const { data: done } = await db.from("fin_transactions").select("id").like("external_ref", `social-%:${key}:%`).limit(1);
  if (done?.length) return 0;

  const from = `${key}-01T03:00:00Z`;
  const to = new Date(Date.UTC(y, m - 1, 1, 3)).toISOString();
  const { data: usage } = await db.from("ai_usage").select("entity_id,cost_usd").gte("created_at", from).lt("created_at", to);
  const byEntity = new Map<string, number>();
  for (const u of usage ?? []) byEntity.set(u.entity_id, (byEntity.get(u.entity_id) ?? 0) + Number(u.cost_usd));
  const total = [...byEntity.values()].reduce((s, v) => s + v, 0);
  // só lança o worker se ele rodou naquele mês (há jobs no período)
  const { data: ran } = await db.from("social_jobs").select("id").gte("created_at", from).lt("created_at", to).limit(1);

  const { data: cats } = await db.from("fin_categories").select("id,name").eq("type", "expense").in("name", ["Inteligência artificial (APIs)", "Infraestrutura e hospedagem"]);
  const cat = (n: string) => cats?.find((c) => c.name === n)?.id ?? null;
  const due = `${local.slice(0, 7)}-05`;
  const rows: Record<string, unknown>[] = [];
  for (const [entity, usd] of byEntity) {
    const cents = Math.round(usd * USD_BRL * 100);
    if (cents > 0)
      rows.push({ entity_id: entity, type: "expense", description: `IA (Claude) · redes sociais · ${label}`, category_id: cat("Inteligência artificial (APIs)"), amount_cents: cents, due_date: due, source: "social", external_ref: `social-ai:${key}:${entity}`, notes: `US$ ${usd.toFixed(2)} × ${USD_BRL}` });
  }
  // worker: rateio pela proporção de uso de IA; sem uso, vai para "Compartilhado"
  const shares = total > 0 ? [...byEntity.entries()].map(([e, v]) => [e, v / total] as const) : [];
  if (!ran?.length) shares.length = 0;
  else if (!shares.length) {
    const { data: shared } = await db.from("entities").select("id").eq("slug", "compartilhado").maybeSingle();
    if (shared) shares.push([shared.id, 1]);
  }
  for (const [entity, share] of shares) {
    const cents = Math.round(WORKER_USD * USD_BRL * share * 100);
    if (cents > 0)
      rows.push({ entity_id: entity, type: "expense", description: `Worker de redes sociais (Render) · ${label}`, category_id: cat("Infraestrutura e hospedagem"), amount_cents: cents, due_date: due, source: "social", external_ref: `social-worker:${key}:${entity}`, notes: `Rateio ${(share * 100).toFixed(1)}% pelo uso de IA` });
  }
  if (!rows.length) return 0;
  const { error } = await db.from("fin_transactions").upsert(rows, { onConflict: "external_ref", ignoreDuplicates: true });
  if (error) log("error", "custos do mês", { error: error.message });
  else log("info", "custos do mês lançados", { month: key, rows: rows.length });
  return rows.length;
}
