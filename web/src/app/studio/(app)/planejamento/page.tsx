import type { Metadata } from "next";
import Link from "next/link";
import { loadPlanningBase } from "@/lib/studio/planning";
import { requireStudio } from "@/lib/studio/session";
import { createClient } from "@/lib/supabase/server";
import { PlanningApp } from "./PlanningApp";

export const metadata: Metadata = { title: "Planejamento" };

export default async function PlanningPage({ searchParams }: { searchParams: Promise<{ e?: string; c?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireStudio();
  if (!ctx.canSeeFinance) return <p className="st-restricted">O Planejamento mostra valores financeiros e é restrito ao Sócio/Admin.</p>;
  const supabase = await createClient();
  const [base, { data: scenarios, error }] = await Promise.all([
    loadPlanningBase(ctx),
    supabase.from("planning_scenarios").select("id,name,kind,config").order("sort_order").order("created_at"),
  ]);
  const view = base.products.some((p) => p.slug === sp.e) ? sp.e! : "consolidado";
  return (
    <>
      <div className="st-page-head">
        <div>
          <p className="st-eyebrow">Planejamento · simulador</p>
          <h1>Planejamento</h1>
          <p>
            Projeção de faturamento, despesas, lucro e distribuição entre os sócios. Preços vêm dos planos dos produtos e despesas do Financeiro; o que você muda aqui é hipótese
            e não altera os registros oficiais.
          </p>
        </div>
        <Link className="st-btn" data-variant="ghost" href="/studio/financeiro/planejamento">
          Caixa e runway
        </Link>
      </div>
      {error || !scenarios?.length ? (
        <p className="st-banner">O Planejamento ainda não foi ativado no banco. Rode a atualização do banco (migração 0013) e recarregue.</p>
      ) : (
        <PlanningApp base={base} scenarios={scenarios} initialId={scenarios.find((s) => s.id === sp.c)?.id ?? scenarios.find((s) => s.kind === "realista")?.id ?? scenarios[0].id} initialView={view} />
      )}
    </>
  );
}
