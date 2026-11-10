"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";

const TABS = [
  { href: "/studio/financeiro", label: "Visão geral" },
  { href: "/studio/financeiro/lancamentos", label: "Lançamentos" },
  { href: "/studio/financeiro/fluxo", label: "Fluxo de caixa" },
  { href: "/studio/financeiro/resultados", label: "Resultados" },
  { href: "/studio/financeiro/orcamento", label: "Orçamento" },
  { href: "/studio/financeiro/recorrentes", label: "Recorrentes" },
  { href: "/studio/financeiro/aportes", label: "Aportes" },
  { href: "/studio/financeiro/planejamento", label: "Planejamento" },
];

function Inner() {
  const pathname = usePathname();
  const e = useSearchParams().get("e");
  return (
    <nav aria-label="Financeiro" className="st-tabs">
      {TABS.map((t) => {
        const active = t.href === "/studio/financeiro" ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link key={t.href} href={e ? `${t.href}?e=${e}` : t.href} aria-current={active ? "page" : undefined}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function FinanceTabs() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}
