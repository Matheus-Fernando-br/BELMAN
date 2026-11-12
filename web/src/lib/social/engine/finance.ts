import "server-only";
import { log, sb, TZ } from "./db";

// Todo início de mês: lança no Financeiro o custo do mês anterior com IA, por produto
// (pelo ai_usage). Idempotente por external_ref.

const USD_BRL = Number(process.env.USD_BRL ?? 5.4);

export async function monthlyCosts(now = new Date()) {
  const local = now.toLocaleDateString("sv-SE", { timeZone: TZ });
  const [y, m] = local.split("-").map(Number);
  const prev = new Date(Date.UTC(y, m - 2, 1));
  const key = prev.toISOString().slice(0, 7);
  const label = prev.toLocaleDateString("pt-BR", { month: "short", year: "numeric", timeZone: "UTC" }).replace(".", "");
  const { data: done } = await sb().from("fin_transactions").select("id").like("external_ref", `social-%:${key}:%`).limit(1);
  if (done?.length) return 0;

  const from = `${key}-01T03:00:00Z`;
  const to = new Date(Date.UTC(y, m - 1, 1, 3)).toISOString();
  const { data: usage } = await sb().from("ai_usage").select("entity_id,cost_usd").gte("created_at", from).lt("created_at", to);
  const byEntity = new Map<string, number>();
  for (const u of usage ?? []) byEntity.set(u.entity_id, (byEntity.get(u.entity_id) ?? 0) + Number(u.cost_usd));
  const { data: cats } = await sb().from("fin_categories").select("id,name").eq("type", "expense").eq("name", "Inteligência artificial (APIs)");
  const cat = (n: string) => cats?.find((c) => c.name === n)?.id ?? null;
  const due = `${local.slice(0, 7)}-05`;
  const rows: Record<string, unknown>[] = [];
  for (const [entity, usd] of byEntity) {
    const cents = Math.round(usd * USD_BRL * 100);
    if (cents > 0)
      rows.push({ entity_id: entity, type: "expense", description: `IA (Claude) · redes sociais · ${label}`, category_id: cat("Inteligência artificial (APIs)"), amount_cents: cents, due_date: due, source: "social", external_ref: `social-ai:${key}:${entity}`, notes: `US$ ${usd.toFixed(2)} × ${USD_BRL}` });
  }
  if (!rows.length) return 0;
  const { error } = await sb().from("fin_transactions").upsert(rows, { onConflict: "external_ref", ignoreDuplicates: true });
  if (error) log("error", "custos do mês", { error: error.message });
  else log("info", "custos do mês lançados", { month: key, rows: rows.length });
  return rows.length;
}
