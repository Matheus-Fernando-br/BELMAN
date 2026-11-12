"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";

type Tab = { href: string; label: string };

function Inner({ tabs, label }: { tabs: Tab[]; label: string }) {
  const pathname = usePathname();
  const e = useSearchParams().get("e");
  const root = tabs[0]?.href;
  return (
    <nav aria-label={label} className="st-tabs">
      {tabs.map((t) => {
        const active = t.href === root ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link key={t.href} href={e ? `${t.href}?e=${e}` : t.href} aria-current={active ? "page" : undefined}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function SectionTabs({ tabs, label }: { tabs: Tab[]; label: string }) {
  return (
    <Suspense>
      <Inner tabs={tabs} label={label} />
    </Suspense>
  );
}
