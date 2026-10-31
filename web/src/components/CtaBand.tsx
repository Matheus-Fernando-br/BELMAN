import styles from "./CtaBand.module.css";
import { Mark } from "./Logo";

export function CtaBand() {
  return (
    <section className={styles.band} aria-labelledby="cta-title">
      <div className={`container ${styles.inner}`} data-reveal="">
        <div className={styles.copy}>
          <h2 id="cta-title" className={styles.title}>
            Let&apos;s build what&apos;s next.
          </h2>
          <p>Vamos construir juntos o futuro da tecnologia e dos negócios.</p>
          <a href="#contato" className="button button-light">
            Fale conosco <span className="arrow" aria-hidden="true">→</span>
          </a>
        </div>
        <Mark className={styles.mark} strokeWidth={2.4} radius={8} />
      </div>
    </section>
  );
}
