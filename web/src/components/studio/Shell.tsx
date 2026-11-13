"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
  { href: "/studio/social", label: "Redes Sociais", icon: "social" },
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

const UUID_SEG = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SOCIAL_TABS = ["calendario", "automatico", "conexao"];

/**
 * Para onde cada opção do filtro leva, conforme a tela:
 * - Redes Sociais e páginas de produto têm o produto no endereço: troca o produto no caminho.
 * - Telas de detalhe (um registro específico): voltam para a lista, já filtrada.
 * - Configurações: o filtro não se aplica (fica escondido).
 */
function filterTarget(pathname: string, slug: string, consolidated: string) {
  const seg = pathname.split("/").filter(Boolean); // ["studio", ...]
  if (seg[1] === "social") {
    if (slug === consolidated) return "/studio/social";
    const tab = seg[3] && SOCIAL_TABS.includes(seg[3]) ? `/${seg[3]}` : "";
    return `/studio/social/${slug}${tab}`;
  }
  if (seg[1] === "produtos") return slug === consolidated ? "/studio" : `/studio/produtos/${slug}`;
  const idx = seg.findIndex((x) => UUID_SEG.test(x) || x === "novo");
  const base = idx > 0 ? `/${seg.slice(0, idx).join("/")}` : pathname;
  return `${base}?e=${slug}`;
}

function ShellInner({ user, products, filter, children }: ShellProps) {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const seg = pathname.split("/").filter(Boolean);
  const productArea = seg[1] === "social" || seg[1] === "produtos";
  const productSlugs = new Set(products.map((p) => p.slug));
  // nas áreas por produto, o produto vem do endereço e só produtos aparecem no filtro
  const options = productArea ? filter.filter((o) => o.slug === filter[0]?.slug || productSlugs.has(o.slug)) : filter;
  const consolidated = filter[0]?.slug ?? "consolidado";
  const current = productArea ? (seg[2] && productSlugs.has(seg[2]) ? seg[2] : consolidated) : (params.get("e") ?? filter[0]?.slug);
  const showFilter = seg[1] !== "configuracoes" && options.length > 1;
  // telas de detalhe (um registro específico) ganham um "Voltar"
  const deep = seg.some((x) => UUID_SEG.test(x) || x === "novo");
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
          {deep && (
            <button type="button" className="st-btn" data-variant="ghost" onClick={() => router.back()} style={{ minHeight: "2.25rem", padding: "0.3rem 0.9rem" }}>
              ← Voltar
            </button>
          )}
          {showFilter && (
            <nav aria-label="Filtro global">
              <ul role="list" className="st-filter">
                {options.map((o) => (
                  <li key={o.slug}>
                    <Link href={filterTarget(pathname, o.slug, consolidated)} aria-current={current === o.slug ? "true" : undefined} scroll={false}>
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
