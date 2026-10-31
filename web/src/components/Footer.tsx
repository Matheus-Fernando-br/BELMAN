import { nav, site } from "@/lib/site";
import styles from "./Footer.module.css";
import { Mark, ProjectBy, Wordmark } from "./Logo";
import { SocialIcons } from "./SocialIcons";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.top}`}>
        <div className={styles.brand}>
          <Mark className={styles.mark} strokeWidth={3} radius={9} />
          <p className={styles.tagline}>Technology meets business.</p>
          <p className={styles.text}>{site.tagline} Produtos digitais para simplificar processos e conectar empresas.</p>
        </div>

        <nav aria-label="Rodapé" className={styles.column}>
          <h2 className={styles.heading}>Navegação</h2>
          <ul role="list">
            <li>
              <a href="#inicio">Início</a>
            </li>
            {nav.map((item) => (
              <li key={item.href}>
                <a href={item.href}>{item.label}</a>
              </li>
            ))}
          </ul>
        </nav>

        <div className={styles.column}>
          <h2 className={styles.heading}>Produtos</h2>
          <ul role="list">
            <li>
              <a href="https://finc-seven.vercel.app/" target="_blank" rel="noopener noreferrer">
                FINC <span className="visually-hidden">(abre em nova aba)</span>
              </a>
            </li>
            <li>
              <a href="#produtos">Obra Fácil</a>
            </li>
          </ul>
        </div>

        <div className={styles.column}>
          <h2 className={styles.heading}>Contato</h2>
          <ul role="list">
            <li>
              <a href={`mailto:${site.contact.email}`}>{site.contact.email}</a>
            </li>
          </ul>
          <SocialIcons className={styles.social} />
        </div>
      </div>

      <div className={`container ${styles.signature}`} aria-label="a project by bellman" role="img">
        <ProjectBy className={styles.projectBy} />
        <Wordmark className={styles.wordmark} title="" />
      </div>

      <div className={`container ${styles.base}`}>
        <p>
          © {year} {site.name}. Todos os direitos reservados.
        </p>
        <a href="#inicio">Voltar ao topo ↑</a>
      </div>
    </footer>
  );
}
