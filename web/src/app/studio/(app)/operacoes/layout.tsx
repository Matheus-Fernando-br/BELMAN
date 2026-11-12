import { SectionTabs } from "@/components/studio/SectionTabs";

const TABS = [
  { href: "/studio/operacoes", label: "Visão geral" },
  { href: "/studio/operacoes/tarefas", label: "Tarefas" },
  { href: "/studio/operacoes/clientes", label: "Clientes e onboarding" },
  { href: "/studio/operacoes/processos", label: "Processos" },
  { href: "/studio/operacoes/reunioes", label: "Reuniões e decisões" },
];

export default function OperationsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SectionTabs tabs={TABS} label="Operações" />
      {children}
    </>
  );
}
