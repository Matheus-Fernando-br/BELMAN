import type { Metadata } from "next";
import { MfaForm } from "./MfaForm";

export const metadata: Metadata = { title: "Verificação em duas etapas" };

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <>
      <div>
        <h1>Verificação em duas etapas</h1>
        <p>Digite o código de 6 dígitos que aparece no seu aplicativo autenticador.</p>
      </div>
      <MfaForm next={next?.startsWith("/studio") ? next : "/studio"} />
    </>
  );
}
