import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteButton, RecordForm } from "@/components/studio/RecordForm";
import { formatCents } from "@/lib/studio/finance-math";
import { label, TASK_STATUS } from "@/lib/studio/records";
import { br, requireScope } from "@/lib/studio/scope";
import { createClient } from "@/lib/supabase/server";
import { startOnboarding, toggleOnboardingItem } from "../../actions";

export const metadata: Metadata = { title: "Cliente" };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireScope();
  const supabase = await createClient();
  const { data: c } = await supabase.from("customers").select("*").eq("id", id).maybeSingle();
  if (!c) notFound();
  const [{ data: runs }, { data: templates }, { data: tasks }, { data: contracts }] = await Promise.all([
    supabase.from("onboarding_runs").select("*").eq("customer_id", id).order("started_at", { ascending: false }),
    supabase.from("onboarding_templates").select("id,name").eq("entity_id", c.entity_id),
    supabase.from("tasks").select("id,title,status,due_date").eq("customer_id", id).order("created_at", { ascending: false }),
    supabase.from("contracts").select("id,plan,value_cents,cycle,status,start_date,renewal_date").eq("customer_id", id),
  ]);

  return (
    <>
      <div className="st-page-head">
        <div>
          <p className="st-eyebrow">
            <Link href="/studio/operacoes/clientes">Clientes</Link> · {ctx.entities.find((x) => x.id === c.entity_id)?.name}
          </p>
          <h1>{c.name}</h1>
        </div>
      </div>
      <div className="st-grid" data-cols="2-1">
        <article className="st-card">
          <RecordForm kind="customers" record={c} entities={ctx.visible.map((x) => [x.id, x.name] as const)} readOnly={!ctx.canWrite} />
        </article>
        <aside className="st-grid">
          <article className="st-card">
            <h2>Onboarding</h2>
            {(runs ?? []).map((r) => {
              const items = r.items as { label: string; done: boolean }[];
              const done = items.filter((i) => i.done).length;
              return (
                <div key={r.id} className="st-grid" style={{ gap: "0.4rem" }}>
                  <p className="st-hint">
                    {done}/{items.length} etapas · início {br(r.started_at)}
                    {r.completed_at ? ` · concluído ${br(r.completed_at)}` : ""}
                  </p>
                  <ul className="st-list">
                    {items.map((it, i) => (
                      <li key={i}>
                        <form action={toggleOnboardingItem} style={{ display: "flex", gap: "0.6rem", alignItems: "center", width: "100%" }}>
                          <input type="hidden" name="run_id" value={r.id} />
                          <input type="hidden" name="index" value={i} />
                          <button type="submit" className="st-linkbtn" disabled={!ctx.canWrite} aria-pressed={it.done} style={{ color: it.done ? "#0b7a43" : "#6a6a6a", textDecoration: "none", fontSize: "1.1rem" }}>
                            {it.done ? "☑" : "☐"}
                          </button>
                          <span className="st-grow" style={it.done ? { textDecoration: "line-through", color: "#6a6a6a" } : undefined}>
                            {it.label}
                          </span>
                        </form>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
            {!runs?.length && ctx.canWrite && (templates ?? []).length > 0 && (
              <form action={startOnboarding} className="st-actions">
                <input type="hidden" name="customer_id" value={c.id} />
                <select name="template_id" className="st-input" aria-label="Checklist">
                  {(templates ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <button className="st-btn">Iniciar onboarding</button>
              </form>
            )}
          </article>
          <article className="st-card">
            <h2>Contratos</h2>
            <ul className="st-list">
              {(contracts ?? []).map((k) => (
                <li key={k.id}>
                  <span className="st-grow">
                    {k.plan} · {k.cycle === "monthly" ? "mensal" : k.cycle === "yearly" ? "anual" : "único"}
                  </span>
                  <small>{ctx.canSeeFinance ? formatCents(Number(k.value_cents)) : ""} · {k.status === "active" ? "ativo" : k.status}</small>
                </li>
              ))}
              {!contracts?.length && <li>Nenhum contrato.</li>}
            </ul>
          </article>
          <article className="st-card">
            <h2>Tarefas do cliente</h2>
            <ul className="st-list">
              {(tasks ?? []).map((t) => (
                <li key={t.id}>
                  <span className="st-grow">{t.title}</span>
                  <small>
                    {label(TASK_STATUS, t.status)} · {br(t.due_date)}
                  </small>
                </li>
              ))}
              {!tasks?.length && <li>Nenhuma.</li>}
            </ul>
          </article>
          {ctx.canWrite && <DeleteButton kind="customers" id={c.id} back="/studio/operacoes/clientes" label="Excluir cliente" />}
        </aside>
      </div>
    </>
  );
}
