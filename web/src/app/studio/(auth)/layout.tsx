import Link from "next/link";
import { Mark, Wordmark } from "@/components/Logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="st-auth">
      <aside className="st-auth-hero" aria-hidden="true">
        <div className="st-auth-grid" />
        <div className="st-auth-hero-top">
          <Wordmark title="" className="st-auth-hero-word" />
          <span>Studio</span>
        </div>
        <Mark className="st-auth-hero-mark" animated strokeWidth={2.5} radius={7} />
        <div className="st-auth-hero-copy">
          <p className="st-auth-kicker">Bellman · Central de gestão</p>
          <p className="st-auth-claim">
            Tecnologia que
            <br />
            conecta negócios.
          </p>
          <ul role="list" className="st-auth-pillars">
            <li>Financeiro</li>
            <li>Operações</li>
            <li>Vendas</li>
            <li>Planejamento</li>
          </ul>
        </div>
      </aside>
      <div className="st-auth-panel">
        <main id="conteudo" className="st-auth-card">
          <Link href="/" className="st-auth-brand" aria-label="Voltar ao site da Bellman">
            <Mark strokeWidth={6} radius={13} />
            <span className="st-brand-name">
              <Wordmark title="" />
              <span>Studio</span>
            </span>
          </Link>
          {children}
        </main>
        <p className="st-auth-foot">Acesso restrito a sócios e colaboradores da Bellman. Conexão criptografada.</p>
      </div>
    </div>
  );
}
