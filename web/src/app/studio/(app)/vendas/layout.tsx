import { SectionTabs } from "@/components/studio/SectionTabs";

const TABS = [
  { href: "/studio/vendas", label: "Dashboard comercial" },
  { href: "/studio/vendas/crm", label: "CRM e funil" },
  { href: "/studio/vendas/contratos", label: "Contratos" },
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
