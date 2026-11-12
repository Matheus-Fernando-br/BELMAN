import type { Metadata } from "next";
import Link from "next/link";
import { QuickSelect, RecordForm } from "@/components/studio/RecordForm";
import { formatCents } from "@/lib/studio/finance-math";
import { label, LEAD_SOURCE, LEAD_STAGE } from "@/lib/studio/records";
import { br, loadRefs, requireScope, todayLocal } from "@/lib/studio/scope";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "CRM e funil" };

const OPEN_STAGES = LEAD_STAGE.filter(([s]) => s !== "won" && s !== "lost");

export default async function CrmPage({ searchParams }: { searchParams: Promise<{ e?: string; ver?: string }> }) {
  const params = await searchParams;
  const ctx = await requireScope(params.e);
  const supabase = await createClient();
  const [{ data }, refs] = await Promise.all([
    supabase.from("leads").select("*").in("entity_id", ctx.scopeIds).order("stage_changed_at", { ascending: false }).limit(1000),
    loadRefs(ctx.scopeIds, ["profiles", "campaigns"]),
  ]);
  const leads = data ?? [];
  const today = todayLocal();
  const ent = new Map(ctx.entities.map((x) => [x.id, x]));
  const people = new Map((refs.profiles ?? []).map(([id, n]) => [id, n]));
  const closed = params.ver === "fechados";
  const products = ctx.entityOptions.filter(([id]) => ent.get(id)?.kind === "product");
  const stages = closed ? LEAD_STAGE.filter(([s]) => s === "won" || s === "lost") : OPEN_STAGES;

  return (
    <>
      <div className="st-page-head">
        <div>
          <p className="st-eyebrow">Vendas · {ctx.filter.label}</p>
          <h1>CRM e funil de vendas</h1>
          <p>Lead recebido → Qualificação → Apresentação → Proposta → Negociação → Venda concluída (ou Perdida).</p>
        </div>
        <div className="st-actions">
          <Link className="st-tag" href={`/studio/vendas/crm${params.e ? `?e=${params.e}` : ""}`} aria-current={!closed ? "true" : undefined}>
            Em aberto
          </Link>
          <Link className="st-tag" href={`/studio/vendas/crm?ver=fechados${params.e ? `&e=${params.e}` : ""}`} aria-current={closed ? "true" : undefined}>
            Ganhos e perdidos
          </Link>
          {ctx.canWrite && (
            <a className="st-btn" href="#novo">
              + Lead
            </a>
          )}
        </div>
      </div>
      <div className="st-grid st-kanban">
        {stages.map(([stage, name]) => {
          const col = leads.filter((l) => l.stage === stage);
          const total = col.reduce((s, l) => s + Number(l.value_cents), 0);
          return (
            <section key={stage} className="st-card" style={{ background: "#f7f7f6" }} aria-label={name}>
              <div className="st-card-head">
                <h2>{name}</h2>
                <span>
                  {col.length}
                  {ctx.canSeeFinance && total ? ` · ${formatCents(total, { whole: true })}/mês` : ""}
                </span>
              </div>
              <ul role="list" className="st-grid" style={{ gap: "0.6rem", margin: 0, padding: 0 }}>
                {col.slice(0, 50).map((l) => {
                  const late = l.next_step_date && l.next_step_date < today;
                  return (
                    <li key={l.id} className="st-card" style={{ padding: "0.8rem", gap: "0.4rem", background: "#fff" }}>
                      <Link href={`/studio/vendas/crm/${l.id}`} style={{ fontWeight: 600, textDecoration: "none" }}>
                        {l.company || l.contact_name}
                      </Link>
                      <small className="st-hint">
                        {l.company ? `${l.contact_name} · ` : ""}
                        {label(LEAD_SOURCE, l.source)} · {ent.get(l.entity_id)?.name}
                      </small>
                      {l.next_step && (
                        <small style={late ? { color: "#b42318" } : undefined}>
                          Próximo: {l.next_step}
                          {l.next_step_date ? ` (${br(l.next_step_date)})` : ""}
                        </small>
                      )}
                      {l.stage === "lost" && l.lost_reason && <small className="st-hint">Motivo: {l.lost_reason}</small>}
                      <div className="st-actions" style={{ justifyContent: "space-between" }}>
                        <small className="st-hint">{l.owner_id ? people.get(l.owner_id) : ""}</small>
                        {!closed && (
                          <QuickSelect kind="leads" id={l.id} field="stage" value={l.stage} options={OPEN_STAGES} label={`Etapa de ${l.contact_name}`} disabled={!ctx.canWrite} />
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
      {ctx.canWrite && (
        <article className="st-card" id="novo">
          <h2>Novo lead</h2>
          <RecordForm kind="leads" entities={products} refs={refs} defaults={{ stage: "new", source: "instagram", owner_id: ctx.profile.id }} back="/studio/vendas/crm/{id}" />
        </article>
      )}
    </>
  );
}
