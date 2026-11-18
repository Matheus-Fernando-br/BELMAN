// Esqueleto exibido enquanto a próxima tela carrega os dados.
export default function Loading() {
  return (
    <div className="st-skeleton" role="status" aria-live="polite">
      <span className="visually-hidden">Carregando…</span>
      <div className="st-sk st-sk-eyebrow" />
      <div className="st-sk st-sk-title" />
      <div className="st-sk-row">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="st-sk st-sk-kpi" />
        ))}
      </div>
      <div className="st-sk st-sk-card" />
      <div className="st-sk st-sk-card st-sk-short" />
    </div>
  );
}
