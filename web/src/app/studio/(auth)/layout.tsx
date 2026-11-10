import Link from "next/link";
import { Mark, Wordmark } from "@/components/Logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="st-auth">
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
      <p className="st-auth-foot">Acesso restrito a sócios e colaboradores da Bellman.</p>
    </div>
  );
}
