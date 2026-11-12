import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteButton, RecordForm } from "@/components/studio/RecordForm";
import { br, requireScope } from "@/lib/studio/scope";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Processo" };

export default async function WikiDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ editar?: string }> }) {
  const { id } = await params;
  const { editar } = await searchParams;
  const ctx = await requireScope();
  const supabase = await createClient();
  const { data: p } = await supabase.from("wiki_pages").select("*").eq("id", id).maybeSingle();
  if (!p) notFound();
  return (
    <>
      <div className="st-page-head">
        <div>
          <p className="st-eyebrow">
            <Link href="/studio/operacoes/processos">Processos</Link> · {p.category}
          </p>
          <h1>{p.title}</h1>
          <p>Atualizado em {br(p.updated_at)}</p>
        </div>
        {ctx.canWrite && !editar && (
          <Link className="st-btn" data-variant="ghost" href={`/studio/operacoes/processos/${id}?editar=1`}>
            Editar
          </Link>
        )}
      </div>
      {editar && ctx.canWrite ? (
        <article className="st-card">
          <RecordForm kind="wiki_pages" record={p} entities={ctx.visible.map((x) => [x.id, x.name] as const)} back={`/studio/operacoes/processos/${id}`} />
          <DeleteButton kind="wiki_pages" id={id} back="/studio/operacoes/processos" />
        </article>
      ) : (
        <article className="st-card" style={{ maxWidth: "52rem" }}>
          {String(p.body || "Sem conteúdo.")
            .split(/\n{2,}/)
            .map((para, i) => (
              <p key={i} style={{ whiteSpace: "pre-wrap" }}>
                {para}
              </p>
            ))}
        </article>
      )}
    </>
  );
}
