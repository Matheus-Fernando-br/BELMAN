import styles from "./FincPreview.module.css";

// Illustrative FINC dashboard drawn in HTML/SVG, in the Bellman monochrome style.
const kpis = [
  { label: "Notas emitidas hoje", value: "248", delta: "12%" },
  { label: "Faturamento hoje", value: "R$ 48.720", delta: "8%" },
  { label: "Total no mês", value: "R$ 412.580", delta: "15%" },
];

const notes = [
  { type: "NF-e", id: "#000245", value: "R$ 2.480,00" },
  { type: "NFC-e", id: "#000244", value: "R$ 1.280,00" },
  { type: "NFS-e", id: "#000243", value: "R$ 980,00" },
];

const menu = ["Dashboard", "Notas fiscais", "Clientes", "Produtos", "Relatórios"];

const points = [110, 160, 120, 175, 205, 190, 255, 230, 285, 340];

export function FincPreview() {
  const w = 300;
  const h = 120;
  const max = 360;
  const step = w / (points.length - 1);
  const coords = points.map((p, i) => [i * step, h - (p / max) * h] as const);
  const line = coords.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;

  return (
    <figure className={styles.device}>
      <div className={styles.chrome} aria-hidden="true">
        <span />
        <span />
        <span />
        <p>finc · visão geral</p>
      </div>
      <div className={styles.app} aria-hidden="true">
        <aside className={styles.side}>
          <p className={styles.logo}>FINC</p>
          <ul role="list">
            {menu.map((item, i) => (
              <li key={item} data-active={i === 0}>
                {item}
              </li>
            ))}
          </ul>
        </aside>
        <div className={styles.main}>
          <p className={styles.heading}>Visão geral</p>
          <div className={styles.kpis}>
            {kpis.map((k) => (
              <div key={k.label} className={styles.kpi}>
                <p>{k.label}</p>
                <strong>{k.value}</strong>
                <span>↑ {k.delta}</span>
              </div>
            ))}
          </div>
          <div className={styles.lower}>
            <div className={styles.chart}>
              <p>Emissão de notas · últimos 10 dias</p>
              <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
                <defs>
                  <linearGradient id="finc-area" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0" stopColor="currentColor" stopOpacity="0.18" />
                    <stop offset="1" stopColor="currentColor" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {[0.25, 0.5, 0.75].map((g) => (
                  <line key={g} x1="0" x2={w} y1={h * g} y2={h * g} className={styles.grid} />
                ))}
                <path d={area} fill="url(#finc-area)" className={styles.area} />
                <path d={line} className={styles.line} pathLength={1} vectorEffect="non-scaling-stroke" />
              </svg>
            </div>
            <div className={styles.list}>
              <p>Últimas notas emitidas</p>
              <ul role="list">
                {notes.map((n) => (
                  <li key={n.id}>
                    <b>{n.type}</b>
                    <span>{n.id}</span>
                    <em>{n.value}</em>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="visually-hidden">Prévia ilustrativa do painel da FINC com notas emitidas e faturamento.</figcaption>
    </figure>
  );
}
