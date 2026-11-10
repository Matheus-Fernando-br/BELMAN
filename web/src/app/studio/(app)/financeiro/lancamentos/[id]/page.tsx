import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadLookups, requireFinance, STATUS_LABEL, STATUS_TONE, todayISO, type TxRow } from "@/lib/studio/finance";
import { formatCents } from "@/lib/studio/finance-math";
import { createClient } from "@/lib/supabase/server";
import { deleteTransaction } from "../../actions";
import { TransactionForm } from "../TransactionForm";

export const metadata: Metadata = { title: "Lançamento" };

export default async function EditTransactionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ back?: string }>;
}) {
  const { id } = await params;
  const { back } = await searchParams;
  const ctx = await requireFinance();
  const supabase = await createClient();
  const { data } = await supabase.from("fin_transactions_view").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const tx = data as TxRow;
  const lookups = await loadLookups();
  const { data: history } = await supabase
    .from("audit_log")
    .select("at,action,actor_email")
    .eq("table_name", "fin_transactions")
    .eq("record_id", id)
    .order("at", { ascending: false })
    .limit(10);
  const backHref = back?.startsWith("/studio/financeiro") ? back : "/studio/financeiro/lancamentos";

  return (
    <>
      <div className="st-page-head">
        <div>
          <p className="st-eyebrow">Financeiro · {tx.type === "income" ? "Receita" : "Despesa"}</p>
          <h1>{tx.description}</h1>
          <p>
            {formatCents(tx.amount_cents)} ·{" "}
            <span className="st-status" data-tone={STATUS_TONE[tx.status]}>
              {STATUS_LABEL[tx.status]}
            </span>
          </p>
        </div>
        {tx.attachment_path && (
          <a className="st-btn" data-variant="ghost" href={`/studio/financeiro/comprovante/${tx.id}`} target="_blank" rel="noopener noreferrer">
            Abrir comprovante ↗
          </a>
        )}
      </div>
      <div className="st-grid" data-cols="2-1">
        <article className="st-card">
          <TransactionForm
            tx={tx}
            defaults={{ type: tx.type }}
            entities={ctx.visible.map((x) => ({ id: x.id, name: x.name, kind: x.kind }))}
            back={backHref}
            today={todayISO()}
            {...lookups}
          />
        </article>
        <aside className="st-grid">
          <article className="st-card">
            <h2>Histórico</h2>
            <ul className="st-list">
              {(history ?? []).map((h, i) => (
                <li key={i}>
                  <span className="st-grow">
                    {h.action === "insert" ? "Criado" : h.action === "update" ? "Alterado" : "Excluído"} por {h.actor_email ?? "sistema"}
                  </span>
                  <small>{new Date(h.at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}</small>
                </li>
              ))}
            </ul>
          </article>
          <article className="st-card">
            <h2>Excluir</h2>
            <p className="st-hint">Use só para lançamentos feitos por engano. Para um gasto que não vai acontecer, prefira “Cancelar” na lista: ele fica no histórico.</p>
            <form action={deleteTransaction}>
              <input type="hidden" name="id" value={tx.id} />
              <button type="submit" className="st-btn" data-variant="danger">
                Excluir lançamento
              </button>
            </form>
          </article>
        </aside>
      </div>
    </>
  );
}
