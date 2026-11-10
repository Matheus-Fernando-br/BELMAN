import type { Metadata } from "next";
import { loadLookups, requireFinance, todayISO } from "@/lib/studio/finance";
import { TransactionForm } from "../TransactionForm";

export const metadata: Metadata = { title: "Novo lançamento" };

export default async function NewTransactionPage({ searchParams }: { searchParams: Promise<{ e?: string; tipo?: string }> }) {
  const { e, tipo } = await searchParams;
  const ctx = await requireFinance(e);
  const lookups = await loadLookups();
  const type = tipo === "income" ? "income" : "expense";
  return (
    <>
      <div className="st-page-head">
        <div>
          <p className="st-eyebrow">Financeiro · Lançamentos</p>
          <h1>{type === "income" ? "Nova receita" : "Nova despesa"}</h1>
        </div>
      </div>
      <article className="st-card" style={{ maxWidth: "52rem" }}>
        <TransactionForm
          defaults={{ type, entityId: ctx.scope.length === 1 ? ctx.scope[0].id : undefined }}
          entities={ctx.visible.map((x) => ({ id: x.id, name: x.name, kind: x.kind }))}
          back={`/studio/financeiro/lancamentos${e ? `?e=${e}` : ""}`}
          today={todayISO()}
          {...lookups}
        />
      </article>
    </>
  );
}
