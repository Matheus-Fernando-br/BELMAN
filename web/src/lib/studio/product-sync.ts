import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { fetchSealed, productKeys, secretEnvName } from "./product-link";

// Sincronização somente leitura das métricas dos produtos. Escrita feita com a
// chave secreta do Supabase, no servidor; o navegador nunca participa.

export type ProductMetrics = {
  product: string;
  generatedAt: string;
  period: { from: string; to: string };
  users: { total: number; verified: number; active7d: number; active30d: number; newInPeriod: number };
  subscriptions: {
    active: number;
    trialing: number;
    pastDue: number;
    newInPeriod: number;
    canceledInPeriod: number;
    byPlan: { planId: string; planName: string; priceCents: number; active: number; mrrCents: number }[];
  };
  /** Catálogo completo de planos e preços (inclui planos sem assinante). */
  plans?: { planId: string; planName: string; priceCents: number; interval?: string; active: number }[];
  mrrCents: number;
  revenueInPeriodCents: number;
  monthly: { month: string; newUsers: number; newSubscriptions: number; canceledSubscriptions: number; activeSubscriptionsAtEnd: number; revenueCents: number }[];
};

type RemotePayment = {
  id: string;
  status: "approved" | "refunded" | "charged_back" | "cancelled";
  amountCents: number;
  paidAt: string | null;
  updatedAt: string;
  planId: string | null;
  modality: string | null;
  method: string | null;
  customerRef: string | null;
};

const TZ = "America/Sao_Paulo";
const localDate = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: TZ });
const METHOD = { pix: "Pix", credit_card: "cartão de crédito", debit_card: "cartão de débito" } as Record<string, string>;

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

/** Grava o catálogo de planos do produto em product_plans (fonte "sync"). */
async function syncPlans(admin: Admin, entityId: string, m: ProductMetrics, now: Date) {
  const active = new Map(m.subscriptions.byPlan.map((p) => [p.planId, p.active]));
  const list = m.plans?.length ? m.plans : m.subscriptions.byPlan;
  if (!list.length) return;
  const rows = list.map((p, i) => ({
    entity_id: entityId,
    external_id: p.planId,
    name: p.planName,
    price_cents: Math.max(0, Math.round(p.priceCents)),
    billing: (p as { interval?: string }).interval === "year" ? "yearly" : "monthly",
    subscribers: active.get(p.planId) ?? p.active ?? 0,
    source: "sync",
    active: true,
    sort_order: i,
    synced_at: now.toISOString(),
  }));
  await admin.from("product_plans").upsert(rows, { onConflict: "entity_id,external_id" });
  // plano que sumiu do produto fica inativo (só quando veio o catálogo completo)
  if (m.plans?.length) {
    const ids = rows.map((r) => r.external_id);
    await admin.from("product_plans").update({ active: false }).eq("entity_id", entityId).eq("source", "sync").not("external_id", "in", `(${ids.map((x) => `"${x}"`).join(",")})`);
  }
}

export type SyncResult = { slug: string; ok: boolean; message: string; imported: number; updated: number };

export async function syncProduct(slug: string, trigger: "cron" | "manual"): Promise<SyncResult> {
  const admin = createAdminClient();
  if (!admin) return { slug, ok: false, message: "SUPABASE_SECRET_KEY não configurada no servidor.", imported: 0, updated: 0 };

  const { data: entity } = await admin.from("entities").select("id,slug,name,metrics_url,kind,active").eq("slug", slug).maybeSingle();
  if (!entity || entity.kind !== "product" || !entity.active) return { slug, ok: false, message: "Produto não encontrado.", imported: 0, updated: 0 };

  const record = async (r: Omit<SyncResult, "slug">) => {
    await admin.from("product_sync_runs").insert({ entity_id: entity.id, trigger, ok: r.ok, message: r.message.slice(0, 300), imported: r.imported, updated: r.updated });
    return { slug, ...r };
  };

  const keys = productKeys(slug);
  if (!entity.metrics_url) return record({ ok: false, message: "Endpoint de métricas não cadastrado.", imported: 0, updated: 0 });
  if (!keys) return record({ ok: false, message: `Segredo ${secretEnvName(slug)} não configurado no servidor.`, imported: 0, updated: 0 });

  const now = new Date();
  const today = localDate(now.toISOString());
  const from = `${today.slice(0, 7)}-01`;
  const { data: state } = await admin.from("product_sync_state").select("*").eq("entity_id", entity.id).maybeSingle();

  try {
    // 1) métricas agregadas do mês
    const m = await fetchSealed<ProductMetrics>(entity.metrics_url, keys, `/metrics?from=${from}&to=${today}`);
    await admin.from("product_usage_snapshots").upsert({
      entity_id: entity.id,
      day: today,
      captured_at: now.toISOString(),
      users: m.users,
      monthly: m.monthly.map((x) => ({ month: x.month, newUsers: x.newUsers })),
    });
    await admin.from("product_revenue_snapshots").upsert({
      entity_id: entity.id,
      day: today,
      captured_at: now.toISOString(),
      subscriptions: m.subscriptions,
      mrr_cents: m.mrrCents,
      revenue_month_cents: m.revenueInPeriodCents,
      monthly: m.monthly.map(({ newUsers: _n, ...rest }) => rest),
    });
    // planos e preços oficiais do produto → usados pelo Planejamento (só leitura no Studio)
    await syncPlans(admin, entity.id, m, now).catch(() => undefined);

    // 2) pagamentos -> receitas realizadas no Financeiro (idempotente por external_ref)
    const { data: category } = await admin.from("fin_categories").select("id").eq("type", "income").eq("name", "Assinaturas").maybeSingle();
    const since = state?.payments_since ? new Date(new Date(state.payments_since).getTime() - 60_000).toISOString() : "2000-01-01T00:00:00.000Z";
    let cursor: string | null = null;
    let imported = 0;
    let updated = 0;
    let maxUpdated = state?.payments_since ?? null;
    for (let page = 0; page < 50; page++) {
      const q = `/payments?since=${encodeURIComponent(since)}&limit=200${cursor ? `&cursor=${cursor}` : ""}`;
      const res: { data: RemotePayment[]; nextCursor: string | null } = await fetchSealed(entity.metrics_url, keys, q);
      for (const p of res.data) {
        if (!maxUpdated || p.updatedAt > maxUpdated) maxUpdated = p.updatedAt;
        const ref = `${slug}:${p.id}`;
        const date = localDate(p.paidAt ?? p.updatedAt);
        const plan = m.subscriptions.byPlan.find((x) => x.planId === p.planId)?.planName ?? p.planId ?? "plano";
        const { data: existing } = await admin.from("fin_transactions").select("id,cancelled").eq("external_ref", ref).maybeSingle();
        const cancelled = p.status !== "approved";
        if (existing) {
          if (existing.cancelled !== cancelled) {
            await admin.from("fin_transactions").update({ cancelled, notes: cancelled ? `Estornado/cancelado no ${entity.name} (${p.status}).` : null }).eq("id", existing.id);
            updated++;
          }
          continue;
        }
        if (cancelled) continue; // nunca entrou como receita: nada a fazer
        const { error } = await admin.from("fin_transactions").insert({
          entity_id: entity.id,
          type: "income",
          description: `Assinatura ${plan}${p.method ? ` · ${METHOD[p.method] ?? p.method}` : ""}`.slice(0, 140),
          category_id: category?.id ?? null,
          amount_cents: p.amountCents,
          due_date: date,
          paid_date: date,
          paid_amount_cents: p.amountCents,
          source: `import:${slug}`,
          external_ref: ref,
          notes: p.customerRef ? `Cliente ${p.customerRef} (código anônimo).` : null,
        });
        if (!error) imported++;
      }
      if (!res.nextCursor) break;
      cursor = res.nextCursor;
    }

    await admin.from("product_sync_state").upsert({
      entity_id: entity.id,
      payments_since: maxUpdated,
      last_run_at: now.toISOString(),
      last_ok_at: now.toISOString(),
      last_error: null,
      last_imported: imported,
    });
    return record({ ok: true, message: `Métricas atualizadas; ${imported} pagamento(s) importado(s), ${updated} atualizado(s).`, imported, updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida.";
    await admin.from("product_sync_state").upsert({ entity_id: entity.id, payments_since: state?.payments_since ?? null, last_run_at: now.toISOString(), last_ok_at: state?.last_ok_at ?? null, last_error: message.slice(0, 300) });
    return record({ ok: false, message, imported: 0, updated: 0 });
  }
}

/** Todos os produtos ativos com endpoint cadastrado. */
export async function syncAllProducts(trigger: "cron" | "manual") {
  const admin = createAdminClient();
  if (!admin) return [];
  const { data } = await admin.from("entities").select("slug").eq("kind", "product").eq("active", true).not("metrics_url", "is", null);
  const results: SyncResult[] = [];
  for (const e of data ?? []) results.push(await syncProduct(e.slug, trigger));
  return results;
}
