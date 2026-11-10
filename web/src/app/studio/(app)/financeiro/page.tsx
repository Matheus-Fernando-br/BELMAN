import type { Metadata } from "next";
import { ComingSoon } from "@/components/studio/ComingSoon";
import { requireStudio } from "@/lib/studio/session";

export const metadata: Metadata = { title: "Financeiro" };

export default async function FinancePage() {
  const ctx = await requireStudio();
  if (!ctx.canSeeFinance) {
    return (
      <p className="st-restricted" role="alert">
        O Financeiro é restrito ao Sócio/Admin.
      </p>
    );
  }
  return (
    <ComingSoon
      eyebrow="Financeiro"
      title="Dinheiro, receitas, despesas e planejamento"
      intro="Gestão financeira da Bellman e de cada produto, sempre com previsto x realizado."
      phase="Fase 1"
      items={[
        "Lançamentos com Entidade, categoria, data prevista e realizada, status e comprovante",
        "Contas a pagar e a receber, com vencimentos e inadimplência",
        "Fluxo de caixa previsto x realizado",
        "Orçamento mensal e anual por entidade e categoria",
        "Rateio de custos compartilhados por percentual configurável",
        "Aportes dos sócios",
        "Resultado por produto e consolidado; margem, break-even, burn rate e runway",
        "Custos de infraestrutura recorrentes (Render, Vercel, banco, domínio, Google Play, IA)",
      ]}
    />
  );
}
