import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteButton, RecordForm } from "@/components/studio/RecordForm";
import { BACKLOG_TYPE, label } from "@/lib/studio/records";
import { loadRefs, requireScope } from "@/lib/studio/scope";
import { createClient } from "@/lib/supabase/server";
import { AttachmentForm } from "./AttachmentForm";

export const metadata: Metadata = { title: "Item do backlog" };

export default async function BacklogItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireScope();
  const supabase = await createClient();
  const { data: item } = await supabase.from("backlog_items").select("*").eq("id", id).maybeSingle();
  if (!item) notFound();
  const refs = await loadRefs([item.entity_id], ["profiles", "projects", "releases"]);
  return (
    <>
      <div className="st-page-head">
        <div>
          <p className="st-eyebrow">
            <Link href="/studio/desenvolvimento/backlog">Backlog</Link> · {label(BACKLOG_TYPE, item.type)} · {ctx.entities.find((x) => x.id === item.entity_id)?.name}
          </p>
          <h1>{item.title}</h1>
          {item.source === "feedback" && <p>Recebido pelo formulário de feedback{item.reporter_name ? ` de ${item.reporter_name}` : ""}.</p>}
        </div>
      </div>
      <div className="st-grid" data-cols="2-1">
        <article className="st-card">
          <RecordForm kind="backlog_items" record={item} entities={ctx.visible.map((x) => [x.id, x.name] as const)} refs={refs} readOnly={!ctx.canWrite} />
        </article>
        <aside className="st-grid">
          <article className="st-card">
            <h2>Prints e anexos</h2>
            <ul className="st-list">
              {(item.attachments as string[]).map((p) => (
                <li key={p}>
                  <a className="st-grow" href={`/studio/desenvolvimento/anexo?p=${encodeURIComponent(p)}`} target="_blank" rel="noopener noreferrer">
                    {p.split("/").pop()?.replace(/^\d+-/, "")}
                  </a>
                </li>
              ))}
              {!(item.attachments as string[]).length && <li>Nenhum anexo.</li>}
            </ul>
            {ctx.canWrite && <AttachmentForm id={item.id} />}
            {item.reporter_contact && ctx.canWrite && <p className="st-hint">Contato de quem relatou: {item.reporter_contact}</p>}
          </article>
          {ctx.canWrite && <DeleteButton kind="backlog_items" id={item.id} back="/studio/desenvolvimento/backlog" />}
        </aside>
      </div>
    </>
  );
}
