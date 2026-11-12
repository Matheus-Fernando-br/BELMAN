import type { Metadata } from "next";
import Link from "next/link";
import { QuickSelect, RecordForm } from "@/components/studio/RecordForm";
import { BACKLOG_STATUS, label, RELEASE_STATUS } from "@/lib/studio/records";
import { br, requireScope } from "@/lib/studio/scope";
import { createClient } from "@/lib/supabase/server";
import { addQa, approveRelease, toggleQa } from "../actions";

export const metadata: Metadata = { title: "Roadmap e versões" };

export default async function ReleasesPage({ searchParams }: { searchParams: Promise<{ e?: string; editar?: string }> }) {
  const params = await searchParams;
  const ctx = await requireScope(params.e);
  const supabase = await createClient();
  const [{ data: releases }, { data: items }] = await Promise.all([
    supabase.from("releases").select("*").in("entity_id", ctx.scopeIds).order("target_date", { ascending: true, nullsFirst: false }),
    supabase.from("backlog_items").select("id,title,type,status,release_id").in("entity_id", ctx.scopeIds).not("release_id", "is", null),
  ]);
  const ent = new Map(ctx.entities.map((x) => [x.id, x]));
  const editing = (releases ?? []).find((r) => r.id === params.editar);
  const products = ctx.entityOptions.filter(([id]) => ent.get(id)?.kind === "product");

  return (
    <>
      <div className="st-page-head">
        <div>
          <p className="st-eyebrow">Desenvolvimento · {ctx.filter.label}</p>
          <h1>Roadmap e versões</h1>
          <p>O que entra em cada versão, homologação e aprovação antes de publicar.</p>
        </div>
      </div>
      <div className="st-grid" data-cols="2-1">
        <div className="st-grid">
          {(releases ?? []).map((r) => {
            const qa = (r.qa_checklist as { label: string; done: boolean }[]) ?? [];
            const scope = (items ?? []).filter((i) => i.release_id === r.id);
            const doneItems = scope.filter((i) => i.status === "done").length;
            return (
              <article key={r.id} className="st-card">
                <div className="st-card-head">
                  <h2>
                    <span className="st-dot" style={{ background: ent.get(r.entity_id)?.color, marginRight: "0.4rem" }} aria-hidden="true" />
                    {ent.get(r.entity_id)?.name} {r.version}
                    {r.title ? ` · ${r.title}` : ""}
                  </h2>
                  <QuickSelect kind="releases" id={r.id} field="status" value={r.status} options={RELEASE_STATUS} label={`Situação da versão ${r.version}`} disabled={!ctx.canWrite} />
                </div>
                <p className="st-hint">
                  Previsão {br(r.target_date)}
                  {r.released_at ? ` · publicada ${br(r.released_at)}` : ""} · {doneItems}/{scope.length} itens entregues
                </p>
                {scope.length > 0 && (
                  <ul className="st-list">
                    {scope.map((i) => (
                      <li key={i.id}>
                        <Link className="st-grow" href={`/studio/desenvolvimento/backlog/${i.id}`}>
                          {i.title}
                        </Link>
                        <small>{label(BACKLOG_STATUS, i.status)}</small>
                      </li>
                    ))}
                  </ul>
                )}
                <div>
                  <p className="st-eyebrow">Testes e homologação</p>
                  <ul className="st-list">
                    {qa.map((q, i) => (
                      <li key={i}>
                        <form action={toggleQa} style={{ display: "flex", gap: "0.5rem", alignItems: "center", width: "100%" }}>
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="index" value={i} />
                          <button className="st-linkbtn" disabled={!ctx.canWrite} aria-pressed={q.done} style={{ textDecoration: "none", color: q.done ? "#0b7a43" : "#6a6a6a", fontSize: "1.1rem" }}>
                            {q.done ? "☑" : "☐"}
                          </button>
                          <span className="st-grow">{q.label}</span>
                        </form>
                      </li>
                    ))}
                  </ul>
                  {ctx.canWrite && (
                    <form action={addQa} className="st-actions" style={{ marginTop: "0.5rem" }}>
                      <input type="hidden" name="id" value={r.id} />
                      <input name="label" placeholder="Novo teste (ex.: gerar PDF no Android 10)" className="st-input" style={{ flex: 1, minWidth: "12rem" }} aria-label="Novo teste" />
                      <button className="st-btn" data-variant="ghost">
                        Adicionar
                      </button>
                    </form>
                  )}
                </div>
                <div className="st-actions">
                  {ctx.canWrite && r.status === "testing" && (
                    <form action={approveRelease}>
                      <input type="hidden" name="id" value={r.id} />
                      <button className="st-btn" disabled={qa.some((q) => !q.done)} title={qa.some((q) => !q.done) ? "Conclua todos os testes" : undefined}>
                        Aprovar versão
                      </button>
                    </form>
                  )}
                  {ctx.canWrite && <Link href={`/studio/desenvolvimento/versoes?editar=${r.id}`}>Editar</Link>}
                </div>
              </article>
            );
          })}
          {!releases?.length && <p className="st-restricted">Nenhuma versão planejada.</p>}
        </div>
        {ctx.canWrite && (
          <article className="st-card">
            <h2>{editing ? `Editar ${editing.version}` : "Nova versão"}</h2>
            <RecordForm kind="releases" record={editing} entities={products} defaults={{ status: "planned" }} back="/studio/desenvolvimento/versoes" />
          </article>
        )}
      </div>
    </>
  );
}
