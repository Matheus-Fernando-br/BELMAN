import { SectionTabs } from "@/components/studio/SectionTabs";

const TABS = [
  { href: "/studio/vendas", label: "Dashboard comercial" },
  { href: "/studio/vendas/contatos", label: "Contatos" },
  { href: "/studio/vendas/documentos", label: "Contratos e documentos" },
  { href: "/studio/vendas/materiais", label: "Materiais de divulgação" },
  { href: "/studio/vendas/marketing", label: "Marketing e campanhas" },
];

export default function SalesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SectionTabs tabs={TABS} label="Vendas" />
      {children}
    </>
  );
}
