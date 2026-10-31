import { site } from "@/lib/site";
import styles from "./Contact.module.css";
import { ContactForm } from "./ContactForm";
import { SocialIcons } from "./SocialIcons";

export function Contact() {
  return (
    <section id="contato" className={`section ${styles.contact}`} aria-labelledby="contato-title">
      <div className={`container ${styles.layout}`}>
        <div className={styles.intro}>
          <p className="eyebrow" data-reveal="">
            Contato
          </p>
          <h2 id="contato-title" className={styles.title} data-reveal="" style={{ "--reveal-delay": 1 } as React.CSSProperties}>
            Vamos conversar sobre o seu negócio?
          </h2>
          <p className={styles.lead} data-reveal="" style={{ "--reveal-delay": 2 } as React.CSSProperties}>
            Quer usar a FINC ou o Obra Fácil, propor uma parceria ou tirar um projeto do papel? Envie uma mensagem: a
            equipe Bellman responde pessoalmente, com objetividade.
          </p>

          <dl className={styles.channels} data-reveal="" style={{ "--reveal-delay": 3 } as React.CSSProperties}>
            <div className={styles.channel}>
              <dt>E-mail</dt>
              <dd>
                <a href={`mailto:${site.contact.email}`}>{site.contact.email}</a>
              </dd>
            </div>
            <div className={styles.channel}>
              <dt>Redes</dt>
              <dd>
                <SocialIcons />
              </dd>
            </div>
          </dl>
        </div>

        <div className={styles.panel} data-reveal="" style={{ "--reveal-delay": 1 } as React.CSSProperties}>
          <h3 className={styles.panelTitle}>Fale com a Bellman</h3>
          <ContactForm />
        </div>
      </div>
    </section>
  );
}
