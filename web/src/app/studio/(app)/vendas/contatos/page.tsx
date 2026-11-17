import type { Metadata } from "next";
import Link from "next/link";
import { RecordForm } from "@/components/studio/RecordForm";
import { CONTACT_CATEGORY, label, PERSON_TYPE } from "@/lib/studio/records";
import { requireScope } from "@/lib/studio/scope";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Contatos" };

type Sp = { e?: string; cat?: string; tipo?: string; q?: string };

export default async function ContactsPage({ searchParams }: { searchParams: Promise<Sp> }) {
  const sp = await searchParams;
  const ctx = await requireScope(sp.e);
  const supabase = await createClient();
  let query = supabase.from("contacts").select("id,name,trade_name,person_type,category,entity_id,city,state,phone,email,status").in("entity_id", ctx.scopeIds).order("name").limit(500);
  if (sp.cat && CONTACT_CATEGORY.some(([v]) => v === sp.cat)) query = query.eq("category", sp.cat);
  if (sp.tipo === "pf" || sp.tipo === "pj") query = query.eq("person_type", sp.tipo);
  const q = (sp.q ?? "").trim().slice(0, 80);
  if (q) query = query.or(`name.ilike.%${q.replace(/[%,()]/g, " ")}%,trade_name.ilike.%${q.replace(/[%,()]/g, " ")}%,document.ilike.%${q.replace(/[%,()]/g, " ")}%`);
  const [{ data }, { data: docs }] = await Promise.all([query, supabase.from("documents").select("contact_id").in("entity_id", ctx.scopeIds).not("contact_id", "is", null)]);
  const docCount = new Map<string, number>();
  for (const d of docs ?? []) docCount.set(d.contact_id, (docCount.get(d.contact_id) ?? 0) + 1);
  const ent = new Map(ctx.entities.map((x) => [x.id, x]));
  const link = (extra: Partial<Sp>) => {
    const p = new URLSearchParams();
    Object.entries({ e: sp.e, cat: sp.cat, tipo: sp.tipo, q: sp.q, ...extra }).forEach(([k, v]) => v && p.set(k, v));
    return `/studio/vendas/contatos${p.size ? `?${p}` : ""}`;
  };
  return (
    <>
      <div className="st-page-head">
        <div>
          <p className="st-eyebrow">Vendas · {ctx.filter.label}</p>
          <h1>Contatos</h1>
          <p>Empresas, lojas, parceiros, profissionais e prestadores, cada um ligado à Bellman, FINC, Obra Fácil ou Compartilhado.</p>
        </div>
      </div>

      {ctx.canWrite && (
        <details className="st-card" id="novo">
          <summary style={{ cursor: "pointer", fontWeight: 700 }}>+ Novo contato</summary>
          <div style={{ marginTop: "1rem" }}>
            <RecordForm kind="contacts" entities={ctx.entityOptions} defaults={{ person_type: "pj", category: "parceiro", status: "ativo" }} back="/studio/vendas/contatos/{id}" submitLabel="Cadastrar" />
          </div>
        </details>
      )}

      <form className="st-actions" style={{ margin: "1rem 0" }} role="search">
        {sp.e && <input type="hidden" name="e" value={sp.e} />}
        <input name="q" defaultValue={q} placeholder="Buscar por nome ou CPF/CNPJ" className="st-input" style={{ maxWidth: 320 }} aria-label="Buscar contato" />
        <select name="cat" defaultValue={sp.cat ?? ""} className="st-input" style={{ width: "auto" }} aria-label="Categoria">
          <option value="">Todas as categorias</option>
          {CONTACT_CATEGORY.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select name="tipo" defaultValue={sp.tipo ?? ""} className="st-input" style={{ width: "auto" }} aria-label="Tipo de pessoa">
          <option value="">PF e PJ</option>
          {PERSON_TYPE.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <button className="st-btn" data-variant="ghost" type="submit">
          Filtrar
        </button>
        {(sp.q || sp.cat || sp.tipo) && <Link href={link({ q: undefined, cat: undefined, tipo: undefined })}>Limpar</Link>}
      </form>

      <div className="st-table-wrap">
        <table className="st-table">
          <thead>
            <tr>
              <th scope="col">Contato</th>
              <th scope="col">Categoria</th>
              <th scope="col">Tipo</th>
              <th scope="col">Vinculado a</th>
              <th scope="col">Cidade</th>
              <th scope="col">Telefone / e-mail</th>
              <th scope="col" style={{ textAlign: "right" }}>
                Documentos
              </th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((c) => (
              <tr key={c.id} style={{ opacity: c.status === "inativo" ? 0.55 : 1 }}>
                <th scope="row">
                  <Link href={`/studio/vendas/contatos/${c.id}`}>{c.trade_name || c.name}</Link>
                  {c.trade_name && <div className="st-hint">{c.name}</div>}
                </th>
                <td>{label(CONTACT_CATEGORY, c.category)}</td>
                <td>{c.person_type === "pf" ? "PF" : "PJ"}</td>
                <td>
                  <span className="st-tag">
                    <span className="st-dot" style={{ background: ent.get(c.entity_id)?.color }} aria-hidden="true" />
                    {ent.get(c.entity_id)?.name}
                  </span>
                </td>
                <td>{[c.city, c.state].filter(Boolean).join(" / ") || "—"}</td>
                <td>{c.phone || c.email || "—"}</td>
                <td className="st-num">{docCount.get(c.id) ?? 0}</td>
              </tr>
            ))}
            {!data?.length && (
              <tr>
                <td colSpan={7}>Nenhum contato {q || sp.cat || sp.tipo ? "com esse filtro" : "cadastrado ainda"}.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
