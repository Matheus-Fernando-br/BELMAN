import { deleteManualPlan, saveManualPlan } from "@/app/studio/(app)/planejamento/actions";
import { StateForm } from "@/app/studio/(app)/social/ui";
import { SubmitButton } from "@/components/studio/SubmitButton";
import { formatCents } from "@/lib/studio/finance-math";
import { createClient } from "@/lib/supabase/server";

/** Planos e preços do produto: os sincronizados vêm do próprio produto; os demais são cadastrados aqui. */
export async function PlansSection({ entityId, name, isAdmin, integrated }: { entityId: string; name: string; isAdmin: boolean; integrated: boolean }) {
  const supabase = await createClient();
  const { data: plans } = await supabase.from("product_plans").select("*").eq("entity_id", entityId).order("source").order("sort_order").order("created_at");
  const synced = (plans ?? []).filter((p) => p.source === "sync");
  const manual = (plans ?? []).filter((p) => p.source === "manual");
  const money = (c: number) => formatCents(Number(c)).replace(/,00$/, "");
  return (
    <article className="st-card" id="planos" style={{ marginTop: "1rem", scrollMarginTop: "6rem" }}>
      <h2>Planos e preços</h2>
      <p className="st-hint" style={{ marginTop: 0 }}>
        Usados pelo Planejamento.{" "}
        {integrated ? `Os planos de ${name} vêm do próprio app: mude o preço no painel do ${name} e eles se atualizam aqui na próxima sincronização.` : `Cadastre aqui os planos de ${name}; ao mudar um preço, o Planejamento atualiza na hora.`}
      </p>
      <div className="st-table-wrap">
        <table className="st-table">
          <thead>
            <tr>
              <th scope="col">Plano</th>
              <th scope="col" style={{ textAlign: "right" }}>
                Preço
              </th>
              <th scope="col">Cobrança</th>
              <th scope="col" style={{ textAlign: "right" }}>
                Assinantes
              </th>
              <th scope="col">Origem</th>
            </tr>
          </thead>
          <tbody>
            {synced.map((p) => (
              <tr key={p.id} style={{ opacity: p.active ? 1 : 0.5 }}>
                <th scope="row">{p.name}</th>
                <td className="st-num">{money(p.price_cents)}</td>
                <td>{p.billing === "yearly" ? "Anual" : "Mensal"}</td>
                <td className="st-num">{p.subscribers}</td>
                <td>
                  <span className="st-status" data-tone="ok">
                    Sincronizado{p.active ? "" : " (fora de linha)"}
                  </span>
                </td>
              </tr>
            ))}
            {manual.map((p) => (
              <tr key={p.id}>
                <th scope="row">{p.name}</th>
                <td className="st-num">{money(p.price_cents)}</td>
                <td>{p.billing === "yearly" ? "Anual" : "Mensal"}</td>
                <td className="st-num">{p.subscribers}</td>
                <td>
                  <span className="st-status" data-tone="neutral">
                    Cadastrado aqui
                  </span>
                </td>
              </tr>
            ))}
            {!plans?.length && (
              <tr>
                <td colSpan={5}>{integrated ? "Ainda não sincronizado. Clique em Sincronizar agora." : "Nenhum plano cadastrado."}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {isAdmin && (
        <div className="st-grid" data-cols="2" style={{ marginTop: "1rem" }}>
          {manual.map((p) => (
            <details key={p.id} className="st-card" style={{ padding: "0.8rem" }}>
              <summary style={{ cursor: "pointer", fontWeight: 600 }}>Editar {p.name}</summary>
              <PlanForm entityId={entityId} plan={p} />
              <form action={deleteManualPlan}>
                <input type="hidden" name="id" value={p.id} />
                <SubmitButton variant="danger">Excluir plano</SubmitButton>
              </form>
            </details>
          ))}
          <details className="st-card" style={{ padding: "0.8rem" }} open={!plans?.length && !integrated}>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>+ Novo plano</summary>
            <PlanForm entityId={entityId} />
          </details>
        </div>
      )}
    </article>
  );
}

function PlanForm({ entityId, plan }: { entityId: string; plan?: { id: string; name: string; price_cents: number; billing: string; subscribers: number } }) {
  const k = plan?.id ?? "novo";
  return (
    <StateForm action={saveManualPlan} submit="Salvar plano" pending="Salvando…">
      <input type="hidden" name="entity_id" value={entityId} />
      {plan && <input type="hidden" name="id" value={plan.id} />}
      <div className="st-row">
        <div className="st-field">
          <label htmlFor={`pn-${k}`}>Nome</label>
          <input id={`pn-${k}`} name="name" className="st-input" defaultValue={plan?.name ?? ""} />
        </div>
        <div className="st-field">
          <label htmlFor={`pp-${k}`}>Preço (R$)</label>
          <input id={`pp-${k}`} name="price" inputMode="decimal" className="st-input" defaultValue={plan ? (Number(plan.price_cents) / 100).toFixed(2).replace(".", ",") : ""} />
        </div>
        <div className="st-field">
          <label htmlFor={`pb-${k}`}>Cobrança</label>
          <select id={`pb-${k}`} name="billing" className="st-input" defaultValue={plan?.billing ?? "monthly"}>
            <option value="monthly">Mensal</option>
            <option value="yearly">Anual</option>
          </select>
        </div>
        <div className="st-field">
          <label htmlFor={`ps-${k}`}>Assinantes hoje</label>
          <input id={`ps-${k}`} name="subscribers" type="number" min={0} className="st-input" defaultValue={plan?.subscribers ?? 0} />
        </div>
      </div>
    </StateForm>
  );
}
