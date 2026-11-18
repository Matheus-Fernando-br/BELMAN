"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { signOut } from "@/app/studio/(auth)/actions";
import { Mark, Wordmark } from "@/components/Logo";
import type { FilterOption } from "@/lib/studio/filter";
import { Icon, type IconName } from "./Icon";
import { Motion } from "./Motion";

type NavItem = { href: string; label: string; icon: IconName };

const NAV: NavItem[] = [
  { href: "/studio", label: "Dashboard", icon: "dashboard" },
  { href: "/studio/financeiro", label: "Financeiro", icon: "finance" },
  { href: "/studio/planejamento", label: "Planejamento", icon: "plan" },
  { href: "/studio/operacoes", label: "Operações", icon: "ops" },
  { href: "/studio/vendas", label: "Vendas", icon: "sales" },
  { href: "/studio/social", label: "Redes Sociais", icon: "social" },
  { href: "/studio/desenvolvimento", label: "Desenvolvimento", icon: "dev" },
];

export type ShellProps = {
  user: { name: string; email: string; role: string };
  products: { slug: string; name: string; color: string; adminUrl: string | null }[];
  filter: FilterOption[];
  /** Números ao lado dos itens do menu (ex.: chamados em aberto para Sócio/Admin). */
  badges?: Record<string, number>;
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

/** Seletor da empresa visualizada (Consolidado, FINC, Obra Fácil...) no topo do menu lateral. */
function CompanySwitcher({ options, current, hrefFor }: { options: FilterOption[]; current: string; hrefFor: (slug: string) => string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const cur = options.find((o) => o.slug === current) ?? options[0];
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div className="st-switch" ref={box} data-open={open || undefined}>
      <span className="st-switch-label">Visualizando</span>
      <button type="button" className="st-switch-btn" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {cur.slug === "consolidado" ? <Icon name="building" /> : <span className="st-dot" style={{ background: cur.color }} aria-hidden="true" />}
        <span className="st-grow">{cur.label}</span>
        <Icon name="chevron" />
      </button>
      <ul role="listbox" aria-label="Empresa visualizada" className="st-switch-list">
        {options.map((o) => (
          <li key={o.slug} role="option" aria-selected={o.slug === cur.slug}>
            <Link href={hrefFor(o.slug)} scroll={false} onClick={() => setOpen(false)} aria-current={o.slug === cur.slug ? "true" : undefined}>
              {o.slug === "consolidado" ? <Icon name="building" /> : <span className="st-dot" style={{ background: o.color }} aria-hidden="true" />}
              <span className="st-grow">
                {o.label}
                <small>{o.slug === "consolidado" ? "todas as empresas juntas" : o.slug === "compartilhado" ? "custos divididos entre todos" : "só esta empresa"}</small>
              </span>
              {o.slug === cur.slug && <Icon name="check" />}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ShellInner({ user, products, filter, badges = {}, children }: ShellProps) {
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
  const area = [...NAV, { href: "/studio/configuracoes", label: "Configurações" }, { href: "/studio/produtos", label: "Produtos" }].find((n) => isCurrent(n.href));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="st-shell" data-menu={open ? "open" : "closed"}>
      <Motion />
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

        {showFilter && <CompanySwitcher options={options} current={current} hrefFor={(slug) => filterTarget(pathname, slug, consolidated)} />}

        <nav className="st-nav st-nav-group" aria-label="Áreas" data-indicator>
          {NAV.map((item) => (
            <Link key={item.href} href={withFilter(item.href)} aria-current={isCurrent(item.href) ? "page" : undefined}>
              <Icon name={item.icon} />
              {item.label}
              {!!badges[item.href] && (
                <span className="st-badge" aria-label={`${badges[item.href]} em aberto`}>
                  {badges[item.href]}
                </span>
              )}
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

        <Mark className="st-side-mark" strokeWidth={3} radius={8} />
        <div className="st-side-foot">
          <div className="st-user">
            <span className="st-avatar" aria-hidden="true">
              {(user.name || user.email).trim().charAt(0).toUpperCase()}
            </span>
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
          <p className="st-crumb">
            <span>{area?.label ?? "Studio"}</span>
            {showFilter && (
              <>
                <span aria-hidden="true">/</span>
                <span className="st-crumb-company">
                  {current !== "consolidado" && <span className="st-dot" style={{ background: options.find((o) => o.slug === current)?.color }} aria-hidden="true" />}
                  {options.find((o) => o.slug === current)?.label}
                </span>
              </>
            )}
          </p>
          <Link className="st-quick" href="/studio/desenvolvimento/chamados?novo=1">
            <Icon name="chat" />
            <span>Sugerir melhoria</span>
          </Link>
        </header>
        <main id="conteudo" tabIndex={-1} className="st-content">
          {children}
        </main>
      </div>
    </div>
  );
}
