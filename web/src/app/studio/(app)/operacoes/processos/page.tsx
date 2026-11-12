import type { Metadata } from "next";
import Link from "next/link";
import { RecordForm } from "@/components/studio/RecordForm";
import { br, requireScope } from "@/lib/studio/scope";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Processos" };

export default async function WikiPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  const ctx = await requireScope(e);
  const supabase = await createClient();
  const { data } = await supabase.from("wiki_pages").select("id,title,category,entity_id,updated_at").in("entity_id", ctx.scopeIds).order("category").order("title");
  const groups = new Map<string, typeof data>();
  for (const p of data ?? []) groups.set(p.category, [...(groups.get(p.category) ?? []), p]);
  const ent = new Map(ctx.entities.map((x) => [x.id, x.name]));
  return (
    <>
      <div className="st-page-head">
        <div>
          <p className="st-eyebrow">Operações · {ctx.filter.label}</p>
          <h1>Processos internos</h1>
          <p>Procedimentos e rotinas documentados, como uma wiki.</p>
        </div>
      </div>
      <div className="st-grid" data-cols="2-1">
        <div className="st-grid">
          {[...groups.entries()].map(([cat, pages]) => (
            <article key={cat} className="st-card">
              <h2>{cat}</h2>
              <ul className="st-list">
                {(pages ?? []).map((p) => (
                  <li key={p.id}>
                    <Link className="st-grow" href={`/studio/operacoes/processos/${p.id}`}>
                      {p.title}
                    </Link>
                    <small>
                      {ent.get(p.entity_id)} · {br(p.updated_at)}
                    </small>
                  </li>
                ))}
              </ul>
            </article>
          ))}
          {!data?.length && <p className="st-restricted">Nenhum processo documentado ainda.</p>}
        </div>
        {ctx.canWrite && (
          <article className="st-card">
            <h2>Nova página</h2>
            <RecordForm kind="wiki_pages" entities={ctx.entityOptions} defaults={{ category: "Processos" }} back="/studio/operacoes/processos/{id}" />
          </article>
        )}
      </div>
    </>
  );
}
