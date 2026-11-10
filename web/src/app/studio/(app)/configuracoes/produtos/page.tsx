import type { Metadata } from "next";
import { requireStudio, type Entity } from "@/lib/studio/session";
import { createClient } from "@/lib/supabase/server";
import { EntityForm } from "./EntityForm";

export const metadata: Metadata = { title: "Produtos do ecossistema" };

const KIND = { holding: "Holding", product: "Produto", shared: "Compartilhado" } as const;

export default async function EntitiesPage() {
  const ctx = await requireStudio();
  const supabase = await createClient();
  const { data } = await supabase.from("entities").select("*").order("sort_order");
  const entities = (data ?? []) as Entity[];

  return (
    <div className="st-grid" data-cols="2-1">
      <section className="st-grid" aria-label="Entidades">
        {entities.map((e) => (
          <details key={e.id} className="st-card">
            <summary style={{ cursor: "pointer", display: "flex", gap: "0.75rem", alignItems: "center" }}>
              <span className="st-dot" style={{ background: e.color, width: "0.8rem", height: "0.8rem" }} aria-hidden="true" />
              <strong style={{ flex: 1 }}>{e.name}</strong>
              <span className="st-tag">{KIND[e.kind]}</span>
              {!e.active && <span className="st-status" data-tone="neutral">Inativo</span>}
            </summary>
            <div style={{ marginTop: "1rem" }}>
              <EntityForm entity={e} readOnly={!ctx.isAdmin} />
            </div>
          </details>
        ))}
      </section>
      <aside className="st-grid">
        {ctx.isAdmin ? (
          <article className="st-card">
            <h2>Novo produto</h2>
            <p className="st-hint">
              Um produto novo aparece no filtro global, nos gráficos e em todas as áreas, sem mudar o código.
            </p>
            <EntityForm readOnly={false} />
          </article>
        ) : (
          <p className="st-restricted">Somente Sócio/Admin altera os produtos.</p>
        )}
      </aside>
    </div>
  );
}
