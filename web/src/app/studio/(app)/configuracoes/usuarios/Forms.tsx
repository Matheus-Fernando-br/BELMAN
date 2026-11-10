"use client";

import { useActionState, useState } from "react";
import { FormMessage, SubmitButton } from "@/components/studio/SubmitButton";
import { inviteUser, updateMember } from "../actions";

type Option = { id: string; name: string; color: string };
const ROLE_OPTIONS = [
  { value: "admin", label: "Sócio/Admin — tudo" },
  { value: "collaborator", label: "Colaborador — sem números sensíveis do financeiro" },
  { value: "viewer", label: "Leitura — só visualiza" },
];

function Scope({ products, initialAll, initialIds, role }: { products: Option[]; initialAll: boolean; initialIds: string[]; role: string }) {
  const [all, setAll] = useState(initialAll);
  if (role === "admin") return <p className="st-hint">Sócio/Admin sempre vê todos os produtos.</p>;
  return (
    <fieldset className="st-field" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend>Acesso a produtos</legend>
      <label className="st-check">
        <input type="checkbox" name="all_entities" checked={all} onChange={(e) => setAll(e.target.checked)} />
        Todos os produtos (inclui Bellman e Compartilhado)
      </label>
      {!all &&
        products.map((p) => (
          <label key={p.id} className="st-check">
            <input type="checkbox" name="entity_ids" value={p.id} defaultChecked={initialIds.includes(p.id)} />
            <span className="st-dot" style={{ background: p.color }} aria-hidden="true" />
            Somente {p.name} (e Compartilhado)
          </label>
        ))}
    </fieldset>
  );
}

export function InviteForm({ products }: { products: Option[] }) {
  const [state, action] = useActionState(inviteUser, undefined);
  const [role, setRole] = useState("collaborator");
  return (
    <form action={action} className="st-form" noValidate>
      <div className="st-row">
        <div className="st-field">
          <label htmlFor="inv-email">E-mail</label>
          <input id="inv-email" name="email" type="email" required className="st-input" />
        </div>
        <div className="st-field">
          <label htmlFor="inv-name">Nome</label>
          <input id="inv-name" name="full_name" className="st-input" maxLength={80} />
        </div>
      </div>
      <div className="st-field">
        <label htmlFor="inv-role">Papel</label>
        <select id="inv-role" name="role" className="st-input" value={role} onChange={(e) => setRole(e.target.value)}>
          {ROLE_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      <Scope products={products} initialAll role={role} initialIds={[]} />
      <FormMessage state={state} />
      <div className="st-actions">
        <SubmitButton pendingLabel="Enviando convite…">Enviar convite</SubmitButton>
      </div>
    </form>
  );
}

export function MemberForm({
  member,
  products,
  isSelf,
}: {
  member: { id: string; role: string; active: boolean; all_entities: boolean; entityIds: string[] };
  products: Option[];
  isSelf: boolean;
}) {
  const [state, action] = useActionState(updateMember, undefined);
  const [role, setRole] = useState(member.role);
  return (
    <form action={action} className="st-form" noValidate>
      <input type="hidden" name="id" value={member.id} />
      <div className="st-row">
        <div className="st-field">
          <label htmlFor={`role-${member.id}`}>Papel</label>
          <select id={`role-${member.id}`} name="role" className="st-input" value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <label className="st-check" style={{ alignSelf: "end", minHeight: "2.75rem" }}>
          <input type="checkbox" name="active" defaultChecked={member.active} disabled={isSelf} />
          Acesso ativo
          {isSelf && <input type="hidden" name="active" value="on" />}
        </label>
      </div>
      <Scope products={products} initialAll={member.all_entities} initialIds={member.entityIds} role={role} />
      <FormMessage state={state} />
      <div className="st-actions">
        <SubmitButton variant="ghost" pendingLabel="Salvando…">
          Salvar acesso
        </SubmitButton>
      </div>
    </form>
  );
}
