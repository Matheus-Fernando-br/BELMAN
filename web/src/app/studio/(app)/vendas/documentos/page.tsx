import type { Metadata } from "next";
import Link from "next/link";
import { RecordForm } from "@/components/studio/RecordForm";
import { formatCents } from "@/lib/studio/finance-math";
import { DOCUMENT_KIND, DOCUMENT_STATUS, label } from "@/lib/studio/records";
import { fileSize } from "@/lib/studio/sales-files";
import { br, loadRefs, requireScope, todayLocal } from "@/lib/studio/scope";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Contratos e documentos" };

type Sp = { e?: string; tipo?: string; sit?: string; contato?: string; q?: string };

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<Sp> }) {
  const sp = await searchParams;
  const ctx = await requireScope(sp.e);
  const supabase = await createClient();
  let query = supabase
    .from("documents")
    .select("id,title,kind,status,entity_id,contact_id,signed_at,valid_until,value_cents,file_name,bytes,contacts(name,trade_name)")
    .in("entity_id", ctx.scopeIds)
    .order("created_at", { ascending: false })
    .limit(500);
  if (sp.tipo && DOCUMENT_KIND.some(([v]) => v === sp.tipo)) query = query.eq("kind", sp.tipo);
  if (sp.sit && DOCUMENT_STATUS.some(([v]) => v === sp.sit)) query = query.eq("status", sp.sit);
  if (sp.contato && /^[0-9a-f-]{36}$/.test(sp.contato)) query = query.eq("contact_id", sp.contato);
  const q = (sp.q ?? "").trim().slice(0, 80).replace(/[%,()]/g, " ");
  if (q) query = query.ilike("title", `%${q}%`);
  const visibleIds = ctx.visible.map((x) => x.id);
  const [{ data }, refs, { count: subs }] = await Promise.all([query, loadRefs(visibleIds, ["contacts"]), supabase.from("contracts").select("id", { count: "exact", head: true }).in("entity_id", ctx.scopeIds).eq("status", "active")]);
  const ent = new Map(ctx.entities.map((x) => [x.id, x]));
  const today = todayLocal();
  const in30 = new Date(Date.parse(today) + 30 * 864e5).toISOString().slice(0, 10);
  return (
    <>
      <div className="st-page-head">
        <div>
          <p className="st-eyebrow">Vendas · {ctx.filter.label}</p>
          <h1>Contratos e documentos</h1>
          <p>Contratos firmados com parceiros, empresas e profissionais, com o arquivo assinado guardado em área privada.</p>
        </div>
        <Link className="st-btn" data-variant="ghost" href="/studio/vendas/contratos">
          Assinaturas dos produtos ({subs ?? 0})
        </Link>
      </div>

      {ctx.canWrite && (
        <details className="st-card" id="novo" open={Boolean(sp.contato)}>
          <summary style={{ cursor: "pointer", fontWeight: 700 }}>+ Novo documento</summary>
          <div style={{ marginTop: "1rem" }}>
            <p className="st-hint">Depois de salvar, você anexa o arquivo (PDF, imagem, Word…) na página do documento.</p>
            <RecordForm
              kind="documents"
              entities={ctx.entityOptions}
              refs={refs}
              defaults={{ kind: "contrato", status: "vigente", contact_id: sp.contato ?? "" }}
              back="/studio/vendas/documentos/{id}"
              submitLabel="Salvar e anexar arquivo"
            />
          </div>
        </details>
      )}

      <form className="st-actions" style={{ margin: "1rem 0" }} role="search">
        {sp.e && <input type="hidden" name="e" value={sp.e} />}
        <input name="q" defaultValue={q} placeholder="Buscar por título" className="st-input" style={{ maxWidth: 280 }} aria-label="Buscar documento" />
        <select name="tipo" defaultValue={sp.tipo ?? ""} className="st-input" style={{ width: "auto" }} aria-label="Tipo">
          <option value="">Todos os tipos</option>
          {DOCUMENT_KIND.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select name="sit" defaultValue={sp.sit ?? ""} className="st-input" style={{ width: "auto" }} aria-label="Situação">
          <option value="">Todas as situações</option>
          {DOCUMENT_STATUS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select name="contato" defaultValue={sp.contato ?? ""} className="st-input" style={{ width: "auto", maxWidth: 260 }} aria-label="Contato">
          <option value="">Todos os contatos</option>
          {(refs.contacts ?? []).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <button className="st-btn" data-variant="ghost" type="submit">
          Filtrar
        </button>
      </form>

      <div className="st-table-wrap">
        <table className="st-table">
          <thead>
            <tr>
              <th scope="col">Documento</th>
              <th scope="col">Contato</th>
              <th scope="col">Empresa</th>
              <th scope="col">Situação</th>
              <th scope="col">Validade</th>
              <th scope="col" style={{ textAlign: "right" }}>
                Valor
              </th>
              <th scope="col">Arquivo</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((d) => {
              const c = d.contacts as unknown as { name: string; trade_name: string | null } | null;
              const expiring = d.status === "vigente" && d.valid_until && d.valid_until <= in30;
              return (
                <tr key={d.id}>
                  <th scope="row">
                    <Link href={`/studio/vendas/documentos/${d.id}`}>{d.title}</Link>
                    <div className="st-hint">{label(DOCUMENT_KIND, d.kind)}</div>
                  </th>
                  <td>{c ? <Link href={`/studio/vendas/contatos/${d.contact_id}`}>{c.trade_name || c.name}</Link> : "—"}</td>
                  <td>
                    <span className="st-tag">
                      <span className="st-dot" style={{ background: ent.get(d.entity_id)?.color }} aria-hidden="true" />
                      {ent.get(d.entity_id)?.name}
                    </span>
                  </td>
                  <td>{label(DOCUMENT_STATUS, d.status)}</td>
                  <td>
                    {d.valid_until ? (
                      <span className="st-status" data-tone={expiring ? (d.valid_until < today ? "bad" : "warn") : "neutral"}>
                        {d.valid_until < today && d.status === "vigente" ? "Venceu " : ""}
                        {br(d.valid_until)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="st-num">{d.value_cents != null && ctx.canSeeFinance ? formatCents(Number(d.value_cents)) : "—"}</td>
                  <td>
                    {d.file_name ? (
                      <a href={`/studio/vendas/arquivo?t=d&id=${d.id}`} target="_blank" rel="noreferrer">
                        Abrir ({fileSize(d.bytes)})
                      </a>
                    ) : (
                      <span className="st-status" data-tone="warn">
                        Sem arquivo
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {!data?.length && (
              <tr>
                <td colSpan={7}>Nenhum documento {sp.tipo || sp.sit || sp.contato || q ? "com esse filtro" : "ainda"}.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
