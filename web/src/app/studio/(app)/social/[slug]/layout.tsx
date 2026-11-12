import Link from "next/link";
import { SectionTabs } from "@/components/studio/SectionTabs";
import { ACCOUNT_STATUS } from "@/lib/social/labels";
import { loadAccount, requireWorkspace } from "@/lib/social/server";

export const maxDuration = 300;

export default async function WorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { entity } = await requireWorkspace(slug);
  const acc = await loadAccount(entity.id);
  const [label, tone] = ACCOUNT_STATUS[acc?.status ?? "disconnected"];
  const b = `/studio/social/${slug}`;
  return (
    <>
      <div className="st-page-head">
        <div>
          <p className="st-eyebrow">
            <Link href="/studio/social">Redes Sociais</Link> · {entity.name}
          </p>
          <h1>{acc?.username && acc.status !== "disconnected" ? `@${acc.username}` : entity.name}</h1>
        </div>
        <Link href={`${b}/conexao`} className="st-status" data-tone={tone} style={{ textDecoration: "none" }}>
          Instagram: {label}
        </Link>
      </div>
      {acc && ["expiring", "expired", "error"].includes(acc.status) && (
        <p className="st-banner">
          {acc.status === "expiring" ? "O token do Instagram vence em breve." : "A conexão com o Instagram parou de funcionar."} <Link href={`${b}/conexao`}>Colar um token novo</Link>
        </p>
      )}
      <SectionTabs
        label={`Redes Sociais · ${entity.name}`}
        tabs={[
          { href: b, label: "Posts" },
          { href: `${b}/calendario`, label: "Calendário" },
          { href: `${b}/automatico`, label: "Automático" },
          { href: `${b}/conexao`, label: "Conexão" },
        ]}
      />
      {children}
    </>
  );
}
