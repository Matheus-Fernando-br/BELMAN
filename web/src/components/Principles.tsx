import styles from "./Principles.module.css";

const principles = [
  {
    title: "Integração",
    lead: "Soluções que conectam processos.",
    text: "Vendas, estoque, financeiro, fiscal e obra conversando entre si. Menos retrabalho, menos planilha, mais controle.",
    icon: (
      <>
        <path d="M24 6 42 24 24 42 6 24z" />
        <path d="M6 24h36M24 6v36" />
        <circle cx="24" cy="6" r="3" fill="currentColor" />
        <circle cx="42" cy="24" r="3" fill="currentColor" />
        <circle cx="24" cy="42" r="3" fill="currentColor" />
        <circle cx="6" cy="24" r="3" fill="var(--paper)" />
        <circle cx="24" cy="24" r="3" fill="var(--paper)" />
      </>
    ),
  },
  {
    title: "Inteligência",
    lead: "Tecnologia aplicada à tomada de decisões.",
    text: "Indicadores claros e relatórios prontos para que cada decisão seja tomada com dados, não com achismo.",
    icon: (
      <>
        <path d="M18 8a7 7 0 0 0-7 7 6 6 0 0 0-3 11 6 6 0 0 0 5 9 6 6 0 0 0 11 3V10a6 6 0 0 0-6-2z" />
        <path d="M30 8a7 7 0 0 1 7 7 6 6 0 0 1 3 11 6 6 0 0 1-5 9 6 6 0 0 1-11 3" />
        <path d="M24 16h-4M24 26h-6M24 34h-3M28 20h5M28 30h4" />
      </>
    ),
  },
  {
    title: "Evolução",
    lead: "Inovação contínua para o futuro.",
    text: "Produtos vivos, com novas versões frequentes e evolução guiada pelo uso real de quem trabalha com eles.",
    icon: (
      <>
        <path d="M6 42h36" />
        <path d="M9 42V32h6v10M19 42V26h6v16M29 42V20h6v22" />
        <path d="M8 24 20 14l8 4L42 6" />
        <path d="M35 6h7v7" />
      </>
    ),
  },
];

export function Principles() {
  return (
    <section id="diferenciais" className={`section ${styles.principles}`} aria-labelledby="diferenciais-title">
      <div className="container">
        <div className={styles.head}>
          <p className="eyebrow" data-reveal="">
            Nossos diferenciais
          </p>
          <h2 id="diferenciais-title" className="section-title" data-reveal="" style={{ "--reveal-delay": 1 } as React.CSSProperties}>
            Princípios que guiam cada linha de código.
          </h2>
        </div>

        <ul role="list" className={styles.grid}>
          {principles.map((p, i) => (
            <li key={p.title} className={styles.card} data-reveal="" style={{ "--reveal-delay": i } as React.CSSProperties}>
              <svg viewBox="0 0 48 48" className={styles.icon} aria-hidden="true">
                <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  {p.icon}
                </g>
              </svg>
              <h3 className={styles.title}>{p.title}</h3>
              <p className={styles.lead}>{p.lead}</p>
              <p className={styles.text}>{p.text}</p>
            </li>
          ))}
        </ul>

        <ul role="list" className={styles.traits} data-reveal="">
          {["Layout limpo e moderno", "Foco em performance", "Acessibilidade", "Responsivo em qualquer tela", "Dados protegidos"].map(
            (t) => (
              <li key={t}>{t}</li>
            ),
          )}
        </ul>
      </div>
    </section>
  );
}
