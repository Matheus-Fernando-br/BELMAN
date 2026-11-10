import type { Metadata } from "next";
import { ComingSoon } from "@/components/studio/ComingSoon";

export const metadata: Metadata = { title: "Vendas" };

export default function SalesPage() {
  return (
    <ComingSoon
      eyebrow="Vendas"
      title="CRM, funil, contratos e marketing"
      intro="Aquisição de clientes da FINC e do Obra Fácil, com o Estúdio de Conteúdo dentro de Marketing."
      phase="Fases 3 a 5"
      items={[
        "CRM com produto de interesse, origem, responsável e histórico",
        "Funil: Lead → Qualificação → Apresentação → Proposta → Negociação → Venda (ou Perdida, com motivo)",
        "Venda concluída cria cliente, contrato e contas a receber automaticamente",
        "Indicadores: CAC, LTV, churn, MRR adquirido e conversão por canal",
        "Estúdio de Conteúdo: perfis de marca, calendário, geração com IA e fila de revisão (Fase 4)",
        "Reels, vinhetas, YouTube e publicação automática (Fase 5)",
      ]}
    />
  );
}
