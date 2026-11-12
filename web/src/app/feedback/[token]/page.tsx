import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import "../../studio/studio.css";
import { FeedbackForm } from "./FeedbackForm";

export const metadata: Metadata = { title: "Feedback", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PublicFeedbackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{24}$/.test(token)) notFound();
  const admin = createAdminClient();
  if (!admin) notFound();
  const { data: form } = await admin.from("feedback_forms").select("title,active,entities(name,color)").eq("token", token).maybeSingle();
  if (!form || !form.active) notFound();
  const entity = form.entities as unknown as { name: string; color: string };
  return (
    <div className="st-body">
      <div className="st-auth">
        <main id="conteudo" className="st-auth-card" style={{ width: "min(100% - 2rem, 34rem)" }}>
          <p className="st-eyebrow" style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <span className="st-dot" style={{ background: entity.color }} aria-hidden="true" />
            {entity.name}
          </p>
          <div>
            <h1>{form.title}</h1>
            <p>Encontrou um problema ou tem uma ideia? Conte aqui: vai direto para a equipe de desenvolvimento.</p>
          </div>
          <FeedbackForm token={token} />
        </main>
        <p className="st-auth-foot">Um projeto Bellman · seus dados são usados só para responder este feedback.</p>
      </div>
    </div>
  );
}
