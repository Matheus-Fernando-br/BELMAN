import type { Metadata } from "next";
import { ComingSoon } from "@/components/studio/ComingSoon";

export const metadata: Metadata = { title: "Operações" };

export default function OperationsPage() {
  return (
    <ComingSoon
      eyebrow="Operações"
      title="Administração do dia a dia"
      intro="Tarefas, clientes, implantação e processos, sempre ligados a uma Entidade."
      phase="Fase 2"
      items={[
        "Tarefas em quadro Kanban e lista, com responsável, prazo e prioridade",
        "Cadastro e acompanhamento de clientes por produto",
        "Onboarding com checklist por produto",
        "Processos internos em páginas tipo wiki",
        "Reuniões, atas, decisões, documentos, contratos e fornecedores",
        "Indicadores: tempo de implantação, atendimento e tarefas no prazo",
      ]}
    />
  );
}
