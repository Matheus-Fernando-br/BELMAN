import styles from "./About.module.css";
import { CountUp } from "./CountUp";

const stats = [
  { value: 3, prefix: "+", label: "anos", detail: "de experiência em desenvolvimento" },
  { value: 2, prefix: "", label: "produtos", detail: "no ecossistema Bellman" },
  { value: null, prefix: "", label: "Inovação", detail: "contínua, a cada nova versão" },
];

export function About() {
  return (
    <section id="sobre" className={`section ${styles.about}`} aria-labelledby="sobre-title">
      <div className={`container ${styles.layout}`}>
        <div className={styles.intro}>
          <p className="eyebrow" data-reveal="">
            Sobre a Bellman
          </p>
          <h2 id="sobre-title" className="section-title" data-reveal="" style={{ "--reveal-delay": 1 } as React.CSSProperties}>
            Tecnologia com propósito. Soluções com visão de futuro.
          </h2>
        </div>

        <div className={styles.body} data-reveal="" style={{ "--reveal-delay": 2 } as React.CSSProperties}>
          <p className={styles.lead}>
            A Bellman desenvolve produtos e soluções que conectam tecnologia, pessoas e negócios. Cada sistema nasce de
            um problema real do dia a dia de quem empreende e é construído para durar: simples de usar, seguro e pronto
            para crescer junto com a empresa.
          </p>
          <p>
            Somos uma casa de produtos. Do financeiro e fiscal à gestão de obras, transformamos rotinas manuais e
            dispersas em plataformas integradas, com a mesma precisão em cada detalhe.
          </p>
        </div>

        <dl className={styles.stats}>
          {stats.map((stat, i) => (
            <div key={stat.label} className={styles.stat} data-reveal="" style={{ "--reveal-delay": i } as React.CSSProperties}>
              <dt className={styles.statValue}>
                {stat.value !== null ? (
                  <>
                    {stat.prefix}
                    <CountUp to={stat.value} /> <span className={styles.unit}>{stat.label}</span>
                  </>
                ) : (
                  stat.label
                )}
              </dt>
              <dd>{stat.detail}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
