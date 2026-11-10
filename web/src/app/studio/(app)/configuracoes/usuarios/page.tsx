import type { Metadata } from "next";
import { ROLE_LABEL, requireAdmin, type Role } from "@/lib/studio/session";
import { createClient } from "@/lib/supabase/server";
import { revokeInvitation } from "../actions";
import { InviteForm, MemberForm } from "./Forms";

export const metadata: Metadata = { title: "Usuários e permissões" };

export default async function UsersPage() {
  const ctx = await requireAdmin();
  const supabase = await createClient();
  const [{ data: profiles }, { data: access }, { data: invitations }] = await Promise.all([
    supabase.from("profiles").select("id,email,full_name,role,all_entities,active,created_at").order("created_at"),
    supabase.from("user_entity_access").select("user_id,entity_id"),
    supabase.from("invitations").select("email,role,created_at,accepted_at").is("accepted_at", null).order("created_at"),
  ]);
  const products = ctx.entities
    .filter((e) => e.kind === "product")
    .map((e) => ({ id: e.id, name: e.name, color: e.color }));
  const nameOf = new Map(ctx.entities.map((e) => [e.id, e.name]));

  return (
    <div className="st-grid" data-cols="2-1">
      <section className="st-grid" aria-label="Pessoas com acesso">
        {(profiles ?? []).map((p) => {
          const ids = (access ?? []).filter((a) => a.user_id === p.id).map((a) => a.entity_id as string);
          return (
            <details key={p.id} className="st-card">
              <summary style={{ cursor: "pointer", display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
                <strong style={{ flex: 1, minWidth: "12rem" }}>
                  {p.full_name || p.email}
                  {p.id === ctx.profile.id && <span className="st-hint"> (você)</span>}
                  <br />
                  <span className="st-hint" style={{ fontWeight: 400 }}>
                    {p.email}
                  </span>
                </strong>
                <span className="st-tag">{ROLE_LABEL[p.role as Role]}</span>
                <span className="st-hint">
                  {p.role === "admin" || p.all_entities ? "Todos os produtos" : ids.map((id) => nameOf.get(id)).join(", ")}
                </span>
                <span className="st-status" data-tone={p.active ? "ok" : "neutral"}>
                  {p.active ? "Ativo" : "Sem acesso"}
                </span>
              </summary>
              <div style={{ marginTop: "1rem" }}>
                <MemberForm
                  member={{ id: p.id, role: p.role, active: p.active, all_entities: p.all_entities, entityIds: ids }}
                  products={products}
                  isSelf={p.id === ctx.profile.id}
                />
              </div>
            </details>
          );
        })}
      </section>

      <aside className="st-grid" aria-label="Convites">
        <article className="st-card">
          <h2>Convidar pessoa</h2>
          <p className="st-hint">Não existe cadastro público: só entra quem for convidado aqui.</p>
          <InviteForm products={products} />
        </article>
        {!!invitations?.length && (
          <article className="st-card">
            <h2>Convites pendentes</h2>
            <ul className="st-list">
              {invitations.map((i) => (
                <li key={i.email}>
                  <span className="st-grow">
                    {i.email}
                    <br />
                    <small>{ROLE_LABEL[i.role as Role]}</small>
                  </span>
                  <form action={revokeInvitation}>
                    <input type="hidden" name="email" value={i.email} />
                    <button type="submit" className="st-btn" data-variant="danger">
                      Cancelar
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </article>
        )}
      </aside>
    </div>
  );
}
