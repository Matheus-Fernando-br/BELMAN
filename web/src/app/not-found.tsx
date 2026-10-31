import Link from "next/link";

export default function NotFound() {
  return (
    <main className="container section" style={{ minHeight: "70vh", display: "grid", alignContent: "center", gap: "1.5rem" }}>
      <p className="eyebrow">Erro 404</p>
      <h1 className="section-title">Esta conexão não existe.</h1>
      <p className="section-intro">O endereço acessado não foi encontrado. Volte para a página inicial da Bellman.</p>
      <p>
        <Link href="/" className="button button-primary">
          Ir para o início <span className="arrow" aria-hidden="true">→</span>
        </Link>
      </p>
    </main>
  );
}
