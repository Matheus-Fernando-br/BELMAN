import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteButton, RecordForm } from "@/components/studio/RecordForm";
import { centsToInput } from "@/lib/studio/finance-math";
import { label, LEAD_STAGE } from "@/lib/studio/records";
import { loadRefs, requireScope, todayLocal } from "@/lib/studio/scope";
import { createClient } from "@/lib/supabase/server";
import { InteractionForm, WinForm } from "../../Forms";

export const metadata: Metadata = { title: "Lead" };

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireScope();
  const supabase = await createClient();
  const { data: lead } = await supabase.from("leads").select("*").eq("id", id).maybeSingle();
  if (!lead) notFound();
  const [{ data: interactions }, refs] = await Promise.all([
    supabase.from("lead_interactions").select("id,kind,summary,happened_at,created_by").eq("lead_id", id).order("happened_at", { ascending: false }),
    loadRefs([lead.entity_id], ["profiles", "campaigns"]),
  ]);
  const products = ctx.visible.filter((x) => x.kind === "product").map((x) => [x.id, x.name] as const);
  const won = lead.stage === "won";

  return (
    <>
      <div className="st-page-head">
        <div>
          <p className="st-eyebrow">
            <Link href="/studio/vendas/crm">CRM</Link> · {label(LEAD_STAGE, lead.stage)}
          </p>
          <h1>{lead.company || lead.contact_name}</h1>
          {won && lead.customer_id && (
            <p>
              Venda concluída · <Link href={`/studio/operacoes/clientes/${lead.customer_id}`}>ver cliente</Link>
            </p>
          )}
        </div>
      </div>
      <div className="st-grid" data-cols="2-1">
        <div className="st-grid">
          <article className="st-card">
            <RecordForm kind="leads" record={won ? { ...lead, stage: "negotiation" } : lead} entities={products} refs={refs} readOnly={!ctx.canWrite || won} />
          </article>
          {ctx.canWrite && !won && lead.stage !== "lost" && (
            <article className="st-card" style={{ borderColor: "#0b7a43" }}>
              <h2>Concluir venda</h2>
              <WinForm leadId={lead.id} today={todayLocal()} suggested={centsToInput(Number(lead.value_cents) || null)} />
            </article>
          )}
        </div>
        <aside className="st-grid">
          <article className="st-card">
            <h2>Histórico de interações</h2>
            {ctx.canWrite && <InteractionForm leadId={lead.id} />}
            <ul className="st-list">
              {(interactions ?? []).map((i) => (
                <li key={i.id} style={{ alignItems: "flex-start" }}>
                  <span className="st-tag">{i.kind}</span>
                  <span className="st-grow" style={{ whiteSpace: "pre-wrap", WebkitLineClamp: "unset" }}>
                    {i.summary}
                  </span>
                  <small>{new Date(i.happened_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</small>
                </li>
              ))}
              {!interactions?.length && <li>Nenhuma interação registrada.</li>}
            </ul>
          </article>
          {ctx.canWrite && !won && <DeleteButton kind="leads" id={lead.id} back="/studio/vendas/crm" label="Excluir lead" />}
        </aside>
      </div>
    </>
  );
}
