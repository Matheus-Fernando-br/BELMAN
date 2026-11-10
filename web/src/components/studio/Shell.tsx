"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { signOut } from "@/app/studio/(auth)/actions";
import { Mark, Wordmark } from "@/components/Logo";
import type { FilterOption } from "@/lib/studio/filter";
import { Icon, type IconName } from "./Icon";

type NavItem = { href: string; label: string; icon: IconName };

const NAV: NavItem[] = [
  { href: "/studio", label: "Dashboard", icon: "dashboard" },
  { href: "/studio/financeiro", label: "Financeiro", icon: "finance" },
  { href: "/studio/operacoes", label: "Operações", icon: "ops" },
  { href: "/studio/vendas", label: "Vendas", icon: "sales" },
  { href: "/studio/desenvolvimento", label: "Desenvolvimento", icon: "dev" },
];

export type ShellProps = {
  user: { name: string; email: string; role: string };
  products: { slug: string; name: string; color: string; adminUrl: string | null }[];
  filter: FilterOption[];
  children: React.ReactNode;
};

export function Shell(props: ShellProps) {
  return (
    <Suspense>
      <ShellInner {...props} />
    </Suspense>
  );
}

function ShellInner({ user, products, filter, children }: ShellProps) {
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const current = params.get("e") ?? filter[0]?.slug;
  const withFilter = (href: string) => (params.get("e") ? `${href}?e=${params.get("e")}` : href);
  const isCurrent = (href: string) => (href === "/studio" ? pathname === href : pathname.startsWith(href));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="st-shell" data-menu={open ? "open" : "closed"}>
      <aside
        className="st-side"
        id="studio-menu"
        aria-label="Menu do Studio"
        onClick={(e) => (e.target as HTMLElement).closest("a") && setOpen(false)}
      >
        <Link href={withFilter("/studio")} className="st-brand">
          <Mark strokeWidth={6} radius={13} />
          <span className="st-brand-name">
            <Wordmark title="Bellman" />
            <span>Studio</span>
          </span>
        </Link>

        <nav className="st-nav st-nav-group" aria-label="Áreas">
          {NAV.map((item) => (
            <Link key={item.href} href={withFilter(item.href)} aria-current={isCurrent(item.href) ? "page" : undefined}>
              <Icon name={item.icon} />
              {item.label}
            </Link>
          ))}
        </nav>

        <nav className="st-nav st-nav-group" aria-label="Produtos">
          <p className="st-nav-label">Produtos</p>
          {products.map((p) => (
            <Link
              key={p.slug}
              href={`/studio/produtos/${p.slug}`}
              aria-current={pathname === `/studio/produtos/${p.slug}` ? "page" : undefined}
            >
              <span className="st-dot" style={{ background: p.color }} aria-hidden="true" />
              {p.name}
            </Link>
          ))}
        </nav>

        <nav className="st-nav st-nav-group" aria-label="Atalhos externos">
          <p className="st-nav-label">Atalhos</p>
          {products
            .filter((p) => p.adminUrl)
            .map((p) => (
              <a key={p.slug} href={p.adminUrl!} target="_blank" rel="noopener noreferrer">
                <Icon name="external" />
                Admin {p.name}
                <span className="visually-hidden">(abre em nova aba)</span>
              </a>
            ))}
          <Link href="/studio/configuracoes" aria-current={pathname.startsWith("/studio/configuracoes") ? "page" : undefined}>
            <Icon name="settings" />
            Configurações
          </Link>
        </nav>

        <div className="st-side-foot">
          <div className="st-user">
            <strong>{user.name}</strong>
            <span>{user.role}</span>
          </div>
          <form action={signOut}>
            <button type="submit" className="st-linkbtn">
              Sair
            </button>
          </form>
        </div>
      </aside>
      <button type="button" className="st-scrim" aria-hidden="true" tabIndex={-1} onClick={() => setOpen(false)} />

      <div className="st-main">
        <header className="st-top">
          <button
            type="button"
            className="st-menu-btn"
            aria-expanded={open}
            aria-controls="studio-menu"
            onClick={() => setOpen((v) => !v)}
          >
            <Icon name="menu" />
            <span className="visually-hidden">{open ? "Fechar menu" : "Abrir menu"}</span>
          </button>
          {filter.length > 1 && (
            <nav aria-label="Filtro global">
              <ul role="list" className="st-filter">
                {filter.map((o) => (
                  <li key={o.slug}>
                    <Link href={`${pathname}?e=${o.slug}`} aria-current={current === o.slug ? "true" : undefined} scroll={false}>
                      {o.slug !== "consolidado" && (
                        <span className="st-dot" style={{ background: o.color }} aria-hidden="true" />
                      )}
                      {o.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </header>
        <main id="conteudo" tabIndex={-1} className="st-content">
          {children}
        </main>
      </div>
    </div>
  );
}
