import { SectionTabs } from "@/components/studio/SectionTabs";

// Duas partes: Chamados (ideias e problemas que a equipe abre) e Engenharia (o trabalho técnico).
const TABS = [
  { href: "/studio/desenvolvimento", label: "Início" },
  { href: "/studio/desenvolvimento/chamados", label: "Chamados" },
  { href: "/studio/desenvolvimento/backlog", label: "Backlog e bugs", group: "Engenharia" },
  { href: "/studio/desenvolvimento/versoes", label: "Versões", group: "Engenharia" },
  { href: "/studio/desenvolvimento/projetos", label: "Projetos", group: "Engenharia" },
  { href: "/studio/desenvolvimento/infraestrutura", label: "Infraestrutura", group: "Engenharia" },
  { href: "/studio/desenvolvimento/feedback", label: "Feedback de clientes", group: "Engenharia" },
];

export default function DevLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SectionTabs tabs={TABS} label="Desenvolvimento" />
      {children}
    </>
  );
}
