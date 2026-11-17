import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RecordForm } from "@/components/studio/RecordForm";
import { CONTACT_CATEGORY, DOCUMENT_KIND, DOCUMENT_STATUS, label, MATERIAL_PURPOSE } from "@/lib/studio/records";
import { fileSize } from "@/lib/studio/sales-files";
import { br, requireScope } from "@/lib/studio/scope";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Contato" };

export default async function ContactPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ e?: string }> }) {
  const { id } = await params;
  const { e } = await searchParams;
  const ctx = await requireScope(e);
  const supabase = await createClient();
  const { data: c } = await supabase.from("contacts").select("*").eq("id", id).maybeSingle();
  if (!c) notFound();
  const [{ data: docs }, { data: mats }, { data: camps }] = await Promise.all([
    supabase.from("documents").select("id,title,kind,status,valid_until,file_name,bytes").eq("contact_id", id).order("created_at", { ascending: false }),
    supabase.from("materials").select("id,title,purpose,file_name,bytes").eq("contact_id", id).order("created_at", { ascending: false }),
    supabase.from("campaigns").select("id,name,status").eq("contact_id", id),
  ]);
  const entityOptions = ctx.visible.map((x) => [x.id, x.name] as const);
  return (
    <>
      <div className="st-page-head">
        <div>
          <p className="st-eyebrow">
            <Link href="/studio/vendas/contatos">Contatos</Link> · {label(CONTACT_CATEGORY, c.category)} · {c.person_type === "pf" ? "Pessoa Física" : "Pessoa Jurídica"}
          </p>
          <h1>{c.trade_name || c.name}</h1>
        </div>
        {ctx.canWrite && (
          <Link className="st-btn" href={`/studio/vendas/documentos?contato=${c.id}#novo`}>
            + Documento para este contato
          </Link>
        )}
      </div>
      <div className="st-grid" data-cols="2-1">
        <article className="st-card">
          <h2>Cadastro</h2>
          <RecordForm kind="contacts" record={c} entities={entityOptions} back={`/studio/vendas/contatos/${c.id}`} readOnly={!ctx.canWrite} submitLabel="Salvar" />
        </article>
        <aside className="st-grid">
          <article className="st-card">
            <h2>Contratos e documentos</h2>
            <ul className="st-list">
              {(docs ?? []).map((d) => (
                <li key={d.id}>
                  <span className="st-grow">
                    <Link href={`/studio/vendas/documentos/${d.id}`}>{d.title}</Link>
                    <div className="st-hint">
                      {label(DOCUMENT_KIND, d.kind)} · {label(DOCUMENT_STATUS, d.status)}
                      {d.valid_until ? ` · até ${br(d.valid_until)}` : ""}
                      {d.file_name ? ` · ${fileSize(d.bytes)}` : " · sem arquivo"}
                    </div>
                  </span>
                </li>
              ))}
              {!docs?.length && <li className="st-hint">Nenhum documento.</li>}
            </ul>
          </article>
          <article className="st-card">
            <h2>Materiais</h2>
            <ul className="st-list">
              {(mats ?? []).map((m) => (
                <li key={m.id}>
                  <span className="st-grow">
                    <a href={`/studio/vendas/arquivo?t=m&id=${m.id}`} target="_blank" rel="noreferrer">
                      {m.title}
                    </a>
                    <div className="st-hint">
                      {label(MATERIAL_PURPOSE, m.purpose)} · {fileSize(m.bytes)}
                    </div>
                  </span>
                </li>
              ))}
              {!mats?.length && <li className="st-hint">Nenhum material.</li>}
            </ul>
            {ctx.canWrite && <Link href={`/studio/vendas/materiais?contato=${c.id}#novo`}>+ Enviar material deste contato</Link>}
          </article>
          {!!camps?.length && (
            <article className="st-card">
              <h2>Campanhas</h2>
              <ul className="st-list">
                {camps.map((k) => (
                  <li key={k.id}>
                    <Link href={`/studio/vendas/marketing?editar=${k.id}`}>{k.name}</Link>
                  </li>
                ))}
              </ul>
            </article>
          )}
        </aside>
      </div>
    </>
  );
}
