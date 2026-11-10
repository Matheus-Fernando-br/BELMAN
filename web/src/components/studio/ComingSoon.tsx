export function ComingSoon({
  eyebrow,
  title,
  intro,
  phase,
  items,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  phase: string;
  items: string[];
}) {
  return (
    <>
      <div className="st-page-head">
        <div>
          <p className="st-eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p>{intro}</p>
        </div>
        <span className="st-tag">{phase}</span>
      </div>
      <article className="st-card st-soon">
        <h2>O que entra aqui</h2>
        <ul>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </article>
    </>
  );
}
