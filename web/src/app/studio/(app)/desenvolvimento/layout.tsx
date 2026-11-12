import { SectionTabs } from "@/components/studio/SectionTabs";

const TABS = [
  { href: "/studio/desenvolvimento", label: "Visão geral" },
  { href: "/studio/desenvolvimento/backlog", label: "Backlog e bugs" },
  { href: "/studio/desenvolvimento/versoes", label: "Roadmap e versões" },
  { href: "/studio/desenvolvimento/projetos", label: "Projetos" },
  { href: "/studio/desenvolvimento/infraestrutura", label: "Infraestrutura" },
  { href: "/studio/desenvolvimento/feedback", label: "Formulário de feedback" },
];

export default function DevLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SectionTabs tabs={TABS} label="Desenvolvimento" />
      {children}
    </>
  );
}
