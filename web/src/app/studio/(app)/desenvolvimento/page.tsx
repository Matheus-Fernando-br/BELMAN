import type { Metadata } from "next";
import { ComingSoon } from "@/components/studio/ComingSoon";

export const metadata: Metadata = { title: "Desenvolvimento" };

export default function DevelopmentPage() {
  return (
    <ComingSoon
      eyebrow="Desenvolvimento"
      title="Evolução técnica dos produtos"
      intro="Roadmap, backlog e bugs da FINC e do Obra Fácil. A configuração técnica continua no admin de cada produto."
      phase="Fase 2"
      items={[
        "Backlog de funcionalidades, melhorias e correções",
        "Bugs com prioridade, responsável, print e “como reproduzir”",
        "Roadmap e versões por produto (ex.: Obra Fácil 1.1.0 → 1.2.0)",
        "Projetos maiores com etapas e prazos",
        "Testes, homologação e aprovação de versões",
        "Inventário de infraestrutura com links e custos",
        "Formulário de feedback para testadores e clientes, que vira item de backlog",
      ]}
    />
  );
}
