"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SettingsTabs({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const tabs = [
    ...(isAdmin ? [{ href: "/studio/configuracoes/usuarios", label: "Usuários e permissões" }] : []),
    { href: "/studio/configuracoes/produtos", label: "Produtos do ecossistema" },
    ...(isAdmin ? [{ href: "/studio/configuracoes/financeiro", label: "Financeiro" }] : []),
    ...(isAdmin ? [{ href: "/studio/configuracoes/meta", label: "Meta" }] : []),
    { href: "/studio/configuracoes/seguranca", label: "Minha conta e segurança" },
    ...(isAdmin ? [{ href: "/studio/configuracoes/auditoria", label: "Auditoria" }] : []),
  ];
  return (
    <nav aria-label="Configurações" className="st-tabs">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} aria-current={pathname === t.href ? "page" : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
