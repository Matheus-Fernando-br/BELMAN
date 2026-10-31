import styles from "./Hero.module.css";
import { NetworkMark } from "./NetworkMark";

const headline = [["Technology"], ["meets", "business."]];
const values = ["Minimalismo", "Tecnologia", "Sofisticação", "Precisão", "Integração", "Inteligência", "Evolução"];

export function Hero() {
  let word = 0;
  return (
    <section id="inicio" className={styles.hero} aria-labelledby="hero-title">
      <svg className={styles.backdrop} viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <g stroke="currentColor" strokeWidth="1" fill="none">
          <path d="M-20 640 L260 520 L520 610 L760 420 L1040 470 L1460 260" />
          <path d="M260 520 L380 300 L760 420 M1040 470 L1180 700 L1460 760" />
          <path d="M380 300 L640 160 L960 220 L1040 470 M960 220 L1240 90" />
        </g>
        <g fill="currentColor">
          {[
            [260, 520],
            [520, 610],
            [760, 420],
            [1040, 470],
            [380, 300],
            [640, 160],
            [960, 220],
            [1180, 700],
            [1240, 90],
          ].map(([cx, cy]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="3.5" />
          ))}
        </g>
      </svg>

      <div className={`container ${styles.layout}`}>
        <div className={styles.copy}>
          <p className={`eyebrow ${styles.eyebrow}`}>Bellman · Tecnologia que conecta negócios</p>
          <h1 id="hero-title" className={styles.title}>
            {headline.map((line, l) => (
              <span key={l} className={styles.line}>
                {line.map((w) => (
                  <span key={w} className={styles.word} style={{ "--w": word++ } as React.CSSProperties}>
                    {w}
                  </span>
                ))}
              </span>
            ))}
          </h1>
          <p className={styles.lead}>
            Criamos soluções digitais inteligentes para simplificar processos, conectar negócios e transformar a maneira
            como empresas trabalham.
          </p>
          <div className={styles.actions}>
            <a href="#sobre" className="button button-primary">
              Conheça a Bellman <span className="arrow" aria-hidden="true">→</span>
            </a>
            <a href="#produtos" className="button button-ghost">
              Explore nossos produtos
            </a>
          </div>
        </div>

        <div className={styles.visual}>
          <NetworkMark className={styles.mark} />
          <p className={styles.caption}>Conexões que constroem soluções.</p>
        </div>
      </div>

      <div className={styles.ticker} aria-hidden="true">
        <div className={styles.track}>
          {[0, 1].map((copy) => (
            <ul key={copy} role="list">
              {values.map((v) => (
                <li key={v}>{v}</li>
              ))}
            </ul>
          ))}
        </div>
      </div>

      <a href="#sobre" className={styles.scroll}>
        <span className="visually-hidden">Rolar para a próxima seção</span>
        <span className={styles.scrollLine} aria-hidden="true" />
      </a>
    </section>
  );
}
