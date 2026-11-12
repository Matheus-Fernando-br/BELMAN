import type { Metadata } from "next";
import Link from "next/link";
import { RecordForm } from "@/components/studio/RecordForm";
import { br, requireScope, todayLocal } from "@/lib/studio/scope";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Reuniões e decisões" };

export default async function MeetingsPage({ searchParams }: { searchParams: Promise<{ e?: string; editar?: string }> }) {
  const params = await searchParams;
  const ctx = await requireScope(params.e);
  const supabase = await createClient();
  const { data } = await supabase.from("meetings").select("*").in("entity_id", ctx.scopeIds).order("held_at", { ascending: false }).limit(100);
  const ent = new Map(ctx.entities.map((x) => [x.id, x.name]));
  const editing = (data ?? []).find((m) => m.id === params.editar);
  return (
    <>
      <div className="st-page-head">
        <div>
          <p className="st-eyebrow">Operações · {ctx.filter.label}</p>
          <h1>Reuniões e decisões</h1>
        </div>
      </div>
      <div className="st-grid" data-cols="2-1">
        <div className="st-grid">
          {(data ?? []).map((m) => (
            <article key={m.id} className="st-card">
              <div className="st-card-head">
                <h2>{m.title}</h2>
                <span>
                  {br(m.held_at)} · {ent.get(m.entity_id)}
                </span>
              </div>
              {m.attendees && <p className="st-hint">Participantes: {m.attendees}</p>}
              {m.decisions && (
                <ul className="st-list">
                  {String(m.decisions)
                    .split("\n")
                    .filter(Boolean)
                    .map((d, i) => (
                      <li key={i}>
                        <span className="st-status" data-tone="ok">
                          Decisão
                        </span>
                        <span className="st-grow">{d}</span>
                      </li>
                    ))}
                </ul>
              )}
              {m.notes && <p style={{ whiteSpace: "pre-wrap" }}>{m.notes}</p>}
              {ctx.canWrite && <Link href={`/studio/operacoes/reunioes?editar=${m.id}`}>Editar</Link>}
            </article>
          ))}
          {!data?.length && <p className="st-restricted">Nenhuma reunião registrada.</p>}
        </div>
        {ctx.canWrite && (
          <article className="st-card">
            <h2>{editing ? "Editar reunião" : "Registrar reunião"}</h2>
            <RecordForm kind="meetings" record={editing} entities={ctx.entityOptions} defaults={{ held_at: todayLocal() }} back="/studio/operacoes/reunioes" />
          </article>
        )}
      </div>
    </>
  );
}
