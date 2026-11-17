import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RecordForm } from "@/components/studio/RecordForm";
import { SubmitButton } from "@/components/studio/SubmitButton";
import { DOCUMENT_KIND, label } from "@/lib/studio/records";
import { fileSize, isImage } from "@/lib/studio/sales-files";
import { loadRefs, requireScope } from "@/lib/studio/scope";
import { createClient } from "@/lib/supabase/server";
import { deleteSalesItem } from "../../actions";
import { DocumentFileUpload } from "../../Uploads";

export const metadata: Metadata = { title: "Documento" };

export default async function DocumentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ e?: string }> }) {
  const { id } = await params;
  const { e } = await searchParams;
  const ctx = await requireScope(e);
  const supabase = await createClient();
  const { data: d } = await supabase.from("documents").select("*").eq("id", id).maybeSingle();
  if (!d) notFound();
  const refs = await loadRefs(
    ctx.visible.map((x) => x.id),
    ["contacts"],
  );
  const entityOptions = ctx.visible.map((x) => [x.id, x.name] as const);
  const fileUrl = `/studio/vendas/arquivo?t=d&id=${d.id}`;
  return (
    <>
      <div className="st-page-head">
        <div>
          <p className="st-eyebrow">
            <Link href="/studio/vendas/documentos">Contratos e documentos</Link> · {label(DOCUMENT_KIND, d.kind)}
          </p>
          <h1>{d.title}</h1>
        </div>
      </div>
      <div className="st-grid" data-cols="2-1">
        <article className="st-card">
          <h2>Dados do documento</h2>
          <RecordForm kind="documents" record={d} entities={entityOptions} refs={refs} back={`/studio/vendas/documentos/${d.id}`} readOnly={!ctx.canWrite} submitLabel="Salvar" />
        </article>
        <aside className="st-grid">
          <article className="st-card">
            <h2>Arquivo</h2>
            {d.storage_path ? (
              <>
                {isImage(d.mime) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={fileUrl} alt={d.title} style={{ width: "100%", borderRadius: 8, border: "1px solid var(--st-line)" }} />
                )}
                <p>
                  <strong>{d.file_name}</strong> <span className="st-hint">{fileSize(d.bytes)}</span>
                </p>
                <div className="st-actions">
                  <a className="st-btn" href={fileUrl} target="_blank" rel="noreferrer">
                    Abrir
                  </a>
                  <a className="st-btn" data-variant="ghost" href={`${fileUrl}&baixar=1`}>
                    Baixar
                  </a>
                </div>
              </>
            ) : (
              <p className="st-alert">Nenhum arquivo anexado ainda.</p>
            )}
            {ctx.canWrite && <DocumentFileUpload docId={d.id} entityId={d.entity_id} hasFile={Boolean(d.storage_path)} />}
          </article>
          {ctx.canWrite && (
            <form action={deleteSalesItem}>
              <input type="hidden" name="table" value="documents" />
              <input type="hidden" name="id" value={d.id} />
              <input type="hidden" name="back" value="/studio/vendas/documentos" />
              <SubmitButton variant="danger" pendingLabel="Excluindo…">
                Excluir documento e arquivo
              </SubmitButton>
            </form>
          )}
        </aside>
      </div>
    </>
  );
}
