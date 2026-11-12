import type { Metadata } from "next";
import { headers } from "next/headers";
import { requireScope } from "@/lib/studio/scope";
import { createClient } from "@/lib/supabase/server";
import { createFeedbackForm, toggleFeedbackForm } from "../actions";

export const metadata: Metadata = { title: "Formulário de feedback" };

export default async function FeedbackFormsPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  const ctx = await requireScope(e);
  const supabase = await createClient();
  const [{ data: forms }, { data: received }] = await Promise.all([
    supabase.from("feedback_forms").select("*").in("entity_id", ctx.scopeIds).order("created_at", { ascending: false }),
    supabase.from("backlog_items").select("id").in("entity_id", ctx.scopeIds).eq("source", "feedback"),
  ]);
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${host}`;
  const ent = new Map(ctx.entities.map((x) => [x.id, x.name]));
  const products = ctx.scope.filter((x) => x.kind === "product");
  return (
    <>
      <div className="st-page-head">
        <div>
          <p className="st-eyebrow">Desenvolvimento · {ctx.filter.label}</p>
          <h1>Formulário de feedback</h1>
          <p>
            Um link para mandar a testadores e clientes. Cada resposta vira um item do backlog (bug ou sugestão) já marcado com o
            produto. {received?.length ?? 0} recebido(s) até agora.
          </p>
        </div>
      </div>
      <div className="st-grid" data-cols="2-1">
        <div className="st-grid">
          {(forms ?? []).map((f) => (
            <article key={f.id} className="st-card">
              <div className="st-card-head">
                <h2>
                  {ent.get(f.entity_id)} · {f.title}
                </h2>
                <span className="st-status" data-tone={f.active ? "ok" : "neutral"}>
                  {f.active ? "Ativo" : "Desligado"}
                </span>
              </div>
              <p className="st-code">{`${origin}/feedback/${f.token}`}</p>
              <div className="st-actions">
                <a className="st-btn" data-variant="ghost" href={`/feedback/${f.token}`} target="_blank" rel="noopener noreferrer">
                  Abrir formulário ↗
                </a>
                {ctx.canWrite && (
                  <form action={toggleFeedbackForm}>
                    <input type="hidden" name="id" value={f.id} />
                    <input type="hidden" name="active" value={f.active ? "false" : "true"} />
                    <button className="st-linkbtn" style={{ color: "#6a6a6a" }}>
                      {f.active ? "Desligar link" : "Religar link"}
                    </button>
                  </form>
                )}
              </div>
            </article>
          ))}
          {!forms?.length && <p className="st-restricted">Nenhum formulário criado.</p>}
        </div>
        {ctx.canWrite && products.length > 0 && (
          <article className="st-card">
            <h2>Novo link</h2>
            <form action={createFeedbackForm} className="st-form">
              <div className="st-field">
                <label htmlFor="fb-entity">Produto</label>
                <select id="fb-entity" name="entity_id" className="st-input">
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="st-field">
                <label htmlFor="fb-title">Título</label>
                <input id="fb-title" name="title" defaultValue="Envie seu feedback" maxLength={120} className="st-input" />
              </div>
              <button className="st-btn">Criar link</button>
            </form>
          </article>
        )}
      </div>
    </>
  );
}
