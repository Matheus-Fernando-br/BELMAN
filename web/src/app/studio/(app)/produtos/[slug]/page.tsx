import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireStudio } from "@/lib/studio/session";

export const metadata: Metadata = { title: "Produto" };

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireStudio();
  const product = ctx.visible.find((e) => e.slug === slug && e.kind === "product");
  if (!product) notFound();

  return (
    <>
      <div className="st-page-head">
        <div>
          <p className="st-eyebrow">Produto</p>
          <h1 style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <span className="st-dot" style={{ background: product.color, width: "0.9rem", height: "0.9rem" }} aria-hidden="true" />
            {product.name}
          </h1>
          {product.description && <p>{product.description}</p>}
        </div>
        <div className="st-actions">
          {product.site_url && (
            <a className="st-btn" data-variant="ghost" href={product.site_url} target="_blank" rel="noopener noreferrer">
              Abrir site ↗
            </a>
          )}
          {product.admin_url && (
            <a className="st-btn" href={product.admin_url} target="_blank" rel="noopener noreferrer">
              Abrir admin do {product.name} ↗
            </a>
          )}
        </div>
      </div>

      <div className="st-grid" data-cols="2">
        <article className="st-card">
          <div className="st-card-head">
            <h2>Integração de métricas</h2>
            <span className="st-tag">Em breve</span>
          </div>
          <p>
            Usuários, assinaturas por plano, MRR e pagamentos aprovados do {product.name} vão aparecer aqui, somente
            leitura, assim que o backend do produto disponibilizar os endpoints internos combinados
            (<code>GET /internal/metrics</code> e <code>GET /internal/payments</code>).
          </p>
          <p className="st-hint">
            {product.metrics_url ? `Endpoint cadastrado: ${product.metrics_url}` : "Endpoint ainda não cadastrado."}
          </p>
        </article>
        <article className="st-card">
          <div className="st-card-head">
            <h2>Divisão de responsabilidades</h2>
          </div>
          <p>
            Usuários do app, planos e preços, Mercado Pago, webhooks, chaves e configurações continuam no admin do{" "}
            {product.name}. O Studio cuida da gestão do negócio: financeiro, operações, vendas e desenvolvimento.
          </p>
        </article>
      </div>
    </>
  );
}
