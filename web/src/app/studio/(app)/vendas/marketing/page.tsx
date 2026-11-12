import type { Metadata } from "next";
import Link from "next/link";
import { QuickSelect, RecordForm } from "@/components/studio/RecordForm";
import { formatCents } from "@/lib/studio/finance-math";
import { CAMPAIGN_CHANNEL, label } from "@/lib/studio/records";
import { br, daysAgoISO, requireScope } from "@/lib/studio/scope";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Marketing e campanhas" };

export default async function MarketingPage({ searchParams }: { searchParams: Promise<{ e?: string; editar?: string }> }) {
  const params = await searchParams;
  const ctx = await requireScope(params.e);
  const supabase = await createClient();
  const [{ data: campaigns }, { data: leads }, { data: social }] = await Promise.all([
    supabase.from("campaigns").select("*").in("entity_id", ctx.scopeIds).order("start_date", { ascending: false }),
    supabase.from("leads").select("campaign_id,stage").in("entity_id", ctx.scopeIds).not("campaign_id", "is", null),
    supabase.from("social_posts").select("format,published_at").in("entity_id", ctx.scopeIds).eq("status", "published").gte("published_at", daysAgoISO(30)),
  ]);
  const byChannel = [
    ["Instagram · feed", (social ?? []).filter((p) => ["post", "carousel"].includes(p.format)).length],
    ["Instagram · Reels", (social ?? []).filter((p) => p.format === "reel").length],
    ["Instagram · Stories", (social ?? []).filter((p) => p.format === "story").length],
    ["YouTube", (social ?? []).filter((p) => p.format.startsWith("youtube")).length],
  ] as const;
  const ent = new Map(ctx.entities.map((x) => [x.id, x.name]));
  const editing = (campaigns ?? []).find((c) => c.id === params.editar);
  return (
    <>
      <div className="st-page-head">
        <div>
          <p className="st-eyebrow">Vendas · {ctx.filter.label}</p>
          <h1>Marketing e campanhas</h1>
          <p>Campanhas, tráfego pago, parcerias e indicações, com os leads e vendas de cada uma.</p>
        </div>
        <Link className="st-btn" href="/studio/social">
          Abrir Redes Sociais →
        </Link>
      </div>
      <dl className="st-kpis" aria-label="Posts publicados nos últimos 30 dias, por canal">
        {byChannel.map(([name, n]) => (
          <div key={name} className="st-kpi">
            <dt>{name}</dt>
            <dd>{n}</dd>
            <span className="st-delta">publicados em 30 dias</span>
          </div>
        ))}
      </dl>
      <div className="st-grid" data-cols="2-1">
        <div className="st-table-wrap">
          <table className="st-table">
            <thead>
              <tr>
                <th scope="col">Campanha</th>
                <th scope="col">Canal</th>
                <th scope="col" style={{ textAlign: "right" }}>
                  Orçamento
                </th>
                <th scope="col">Leads → vendas</th>
                <th scope="col">Situação</th>
              </tr>
            </thead>
            <tbody>
              {(campaigns ?? []).map((c) => {
                const l = (leads ?? []).filter((x) => x.campaign_id === c.id);
                const won = l.filter((x) => x.stage === "won").length;
                return (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/studio/vendas/marketing?editar=${c.id}`}>{c.name}</Link>
                      <br />
                      <small className="st-hint">
                        {ent.get(c.entity_id)} · {br(c.start_date)}–{br(c.end_date)}
                      </small>
                    </td>
                    <td>{label(CAMPAIGN_CHANNEL, c.channel)}</td>
                    <td className="st-num">{ctx.canSeeFinance ? formatCents(Number(c.budget_cents)) : "•••"}</td>
                    <td>
                      {l.length} → {won}
                      {ctx.canSeeFinance && won > 0 && Number(c.budget_cents) > 0 && (
                        <small className="st-hint"> · CAC {formatCents(Math.round(Number(c.budget_cents) / won))}</small>
                      )}
                    </td>
                    <td>
                      <QuickSelect kind="campaigns" id={c.id} field="status" value={c.status} options={[["planned", "Planejada"], ["active", "Ativa"], ["done", "Encerrada"]]} label={`Situação de ${c.name}`} disabled={!ctx.canWrite} />
                    </td>
                  </tr>
                );
              })}
              {!campaigns?.length && (
                <tr>
                  <td colSpan={5}>Nenhuma campanha.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {ctx.canWrite && (
          <article className="st-card">
            <h2>{editing ? "Editar campanha" : "Nova campanha"}</h2>
            <RecordForm kind="campaigns" record={editing} entities={ctx.entityOptions} defaults={{ status: "active", channel: "instagram" }} back="/studio/vendas/marketing" />
          </article>
        )}
      </div>
    </>
  );
}
