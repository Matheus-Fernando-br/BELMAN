import Link from "next/link";
import { SectionTabs } from "@/components/studio/SectionTabs";
import { ACCOUNT_STATUS } from "@/lib/social/labels";
import { loadAccount, requireWorkspace } from "@/lib/social/server";

export default async function WorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { entity } = await requireWorkspace(slug);
  const acc = await loadAccount(entity.id);
  const [label, tone] = ACCOUNT_STATUS[acc?.status ?? "disconnected"];
  const b = `/studio/social/${slug}`;
  const tabs = [
    { href: `${b}/revisao`, label: "Revisão" },
    { href: `${b}/criar`, label: "Criar" },
    { href: `${b}/calendario`, label: "Calendário" },
    { href: `${b}/regras`, label: "Regras" },
    { href: `${b}/publicados`, label: "Publicados" },
    { href: `${b}/perfil`, label: "Perfil" },
    { href: `${b}/marca`, label: "Marca" },
    { href: `${b}/acervo`, label: "Acervo" },
    { href: `${b}/conexao`, label: "Conexão" },
  ];
  return (
    <>
      <div className="st-page-head">
        <div>
          <p className="st-eyebrow">
            <Link href="/studio/social">Redes Sociais</Link> · {entity.name}
          </p>
          <h1>{acc?.username ? `@${acc.username}` : entity.name}</h1>
        </div>
        <Link href={`${b}/conexao`} className="st-status" data-tone={tone} style={{ textDecoration: "none" }}>
          Instagram: {label}
        </Link>
      </div>
      {acc && ["expiring", "expired", "error"].includes(acc.status) && (
        <p className="st-banner">
          {acc.status === "expiring"
            ? "O token do Instagram vence em breve. Gere um token de System User (não expira) e cole em Conexão."
            : `A conexão com o Instagram precisa de atenção: ${acc.last_error ?? "token expirado"}.`}{" "}
          <Link href={`${b}/conexao`}>Resolver</Link>
        </p>
      )}
      <SectionTabs tabs={tabs} label={`Redes Sociais · ${entity.name}`} />
      {children}
    </>
  );
}
