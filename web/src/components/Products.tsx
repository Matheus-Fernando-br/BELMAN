import Image from "next/image";
import { products } from "@/content/products";
import { FincPreview } from "./FincPreview";
import { InterestLink } from "./InterestLink";
import { Wordmark } from "./Logo";
import styles from "./Products.module.css";

function GrowthIcon() {
  return (
    <svg viewBox="0 0 120 90" className={styles.icon} aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <path d="M8 86V60h18v26M34 86V46h18v40M60 86V34h18v52M86 86V18h18v68" />
        <path d="M6 50 38 30l22 8L104 6" />
        <path d="M92 6h12v12" />
      </g>
    </svg>
  );
}

function HelmetIcon() {
  return (
    <svg viewBox="0 0 120 90" className={styles.icon} aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
        <path d="M18 66a42 42 0 0 1 84 0" />
        <path d="M8 66h104v10H8z" />
        <path d="M50 26V14a4 4 0 0 1 4-4h12a4 4 0 0 1 4 4v12" />
        <path d="M50 26v24M70 26v24" />
      </g>
    </svg>
  );
}

export function Products() {
  const [finc, obra] = products;

  return (
    <section id="produtos" className={`section ${styles.products}`} aria-labelledby="produtos-title">
      <div className="container">
        <div className={styles.head}>
          <div className={styles.headCopy}>
            <p className="eyebrow" data-reveal="">
              Nosso ecossistema
            </p>
            <h2 id="produtos-title" className="section-title" data-reveal="" style={{ "--reveal-delay": 1 } as React.CSSProperties}>
              Dois produtos. Uma mesma visão.
            </h2>
            <p className="section-intro" data-reveal="" style={{ "--reveal-delay": 2 } as React.CSSProperties}>
              Cada produto Bellman resolve um setor inteiro, do primeiro cadastro ao relatório final. Mesma engenharia,
              mesmo cuidado, problemas diferentes.
            </p>
          </div>

          <div className={styles.tree} data-reveal="" style={{ "--reveal-delay": 2 } as React.CSSProperties} aria-hidden="true">
            <Wordmark className={styles.treeRoot} title="" />
            <svg viewBox="0 0 400 60" className={styles.treeLines} preserveAspectRatio="none">
              <path d="M200 0V30M100 30H300M100 30V60M300 30V60" pathLength={1} />
            </svg>
            <div className={styles.treeLeaves}>
              <div className={styles.leafLight}>
                <strong>FINC</strong>
                <span>{finc.segment}</span>
              </div>
              <div className={styles.leafDark}>
                <strong>ObraFácil</strong>
                <span>{obra.segment}</span>
              </div>
            </div>
          </div>
        </div>

        <article className={`${styles.card} ${styles.light}`} aria-labelledby="finc-title" data-reveal="">
          <div className={styles.copy}>
            <div className={styles.cardTop}>
              <span className={styles.badge}>{finc.status}</span>
              <span className={styles.segment}>{finc.segment}</span>
            </div>
            <h3 id="finc-title" className={styles.name}>
              {finc.name}
            </h3>
            <p className={styles.tagline}>{finc.tagline}</p>
            <p className={styles.summary}>{finc.problem}</p>
            <ul role="list" className={styles.features}>
              {finc.features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <ul role="list" className={styles.stack} aria-label="Tecnologias">
              {finc.stack.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            <div className={styles.actions}>
              {finc.link && (
                <a href={finc.link.href} target="_blank" rel="noopener noreferrer" className="button button-primary">
                  {finc.link.label} <span className="arrow" aria-hidden="true">↗</span>
                  <span className="visually-hidden">(abre em nova aba)</span>
                </a>
              )}
              <InterestLink type="finc">
                Tenho interesse <span className="arrow" aria-hidden="true">→</span>
              </InterestLink>
            </div>
          </div>
          <div className={styles.visual}>
            <GrowthIcon />
            <FincPreview />
          </div>
        </article>

        <article className={`${styles.card} ${styles.dark}`} aria-labelledby="obra-title" data-reveal="">
          <div className={styles.copy}>
            <div className={styles.cardTop}>
              <span className={styles.badge}>{obra.status}</span>
              <span className={styles.segment}>{obra.segment}</span>
            </div>
            <h3 id="obra-title" className={styles.name}>
              {obra.name}
            </h3>
            <p className={styles.tagline}>{obra.tagline}</p>
            <p className={styles.summary}>{obra.problem}</p>
            <ul role="list" className={styles.features}>
              {obra.features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <ul role="list" className={styles.stack} aria-label="Tecnologias">
              {obra.stack.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            <div className={styles.actions}>
              <InterestLink type="obra-facil" className="button button-light">
                Conhecer o Obra Fácil <span className="arrow" aria-hidden="true">→</span>
              </InterestLink>
            </div>
          </div>
          <div className={styles.visual}>
            <HelmetIcon />
            <figure className={styles.shot}>
              <Image
                src="/products/obra-facil.webp"
                alt="Três telas do aplicativo Obra Fácil: lista de orçamentos, painel inicial com receita aprovada e lista de obras no tema escuro."
                width={1600}
                height={1000}
                sizes="(min-width: 1100px) 600px, 92vw"
              />
            </figure>
          </div>
        </article>
      </div>
    </section>
  );
}
