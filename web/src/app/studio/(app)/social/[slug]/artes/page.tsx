import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { temKit } from "@shared/social-templates/obra-facil-modelos";
import { requireWorkspace } from "@/lib/social/server";
import { ArtesForm } from "./ArtesForm";

export const metadata: Metadata = { title: "Artes · Redes Sociais" };

export default async function ArtesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { entity } = await requireWorkspace(slug);
  if (!temKit(slug)) notFound();
  return (
    <div style={{ marginTop: "1rem" }}>
      <p className="st-muted" style={{ marginTop: 0 }}>
        Artes avulsas na identidade visual do {entity.name}: escolha o modelo, escreva o texto e baixe o PNG. Use *asteriscos* para deixar trechos em laranja. Os posts
        automáticos deste perfil também saem nesta identidade.
      </p>
      <ArtesForm slug={slug} />
    </div>
  );
}
