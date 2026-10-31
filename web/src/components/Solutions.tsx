import styles from "./Solutions.module.css";

const solutions = [
  {
    title: "Desenvolvimento sob medida",
    text: "Sistemas que automatizam processos e se encaixam na operação da sua empresa, em vez de exigir que ela mude para caber no software.",
    icon: <path d="M9 7 4 12l5 5M15 7l5 5-5 5M13.5 4l-3 16" />,
  },
  {
    title: "Soluções em nuvem",
    text: "Plataformas web acessíveis de qualquer lugar, com deploy contínuo, backups e disponibilidade para o dia a dia do negócio.",
    icon: <path d="M7 18h10.5a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.6 9.2 4.5 4.5 0 0 0 7 18z" />,
  },
  {
    title: "Segurança e escalabilidade",
    text: "Validação de dados, controle de acesso e arquitetura preparada para crescer: do primeiro cliente ao milésimo.",
    icon: (
      <>
        <path d="M12 3 5 6v5c0 4.4 3 8.3 7 9.5 4-1.2 7-5.1 7-9.5V6l-7-3z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
  },
  {
    title: "Integrações",
    text: "Conectamos bancos, órgãos fiscais, plataformas de e-commerce e as ferramentas que você já usa em um fluxo único.",
    icon: (
      <>
        <circle cx="6" cy="12" r="2.2" />
        <circle cx="18" cy="6" r="2.2" />
        <circle cx="18" cy="18" r="2.2" />
        <path d="M8 11 16 7M8 13l8 4" />
      </>
    ),
  },
];

export function Solutions() {
  return (
    <section id="solucoes" className={`section ${styles.solutions}`} aria-labelledby="solucoes-title">
      <div className="container">
        <div className={styles.head}>
          <p className={`eyebrow ${styles.eyebrow}`} data-reveal="">
            Soluções
          </p>
          <h2 id="solucoes-title" className={`section-title ${styles.title}`} data-reveal="" style={{ "--reveal-delay": 1 } as React.CSSProperties}>
            Soluções digitais para impulsionar o seu negócio.
          </h2>
          <p className={styles.intro} data-reveal="" style={{ "--reveal-delay": 2 } as React.CSSProperties}>
            Além dos nossos produtos, desenvolvemos sistemas sob medida que aumentam a eficiência e conectam empresas
            ao futuro.
          </p>
        </div>

        <ol role="list" className={styles.grid}>
          {solutions.map((s, i) => (
            <li key={s.title} className={styles.item} data-reveal="" style={{ "--reveal-delay": i } as React.CSSProperties}>
              <span className={styles.index}>0{i + 1}</span>
              <svg viewBox="0 0 24 24" className={styles.icon} aria-hidden="true">
                <g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  {s.icon}
                </g>
              </svg>
              <h3 className={styles.itemTitle}>{s.title}</h3>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
