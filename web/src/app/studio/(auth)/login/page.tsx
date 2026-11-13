import type { Metadata } from "next";
import { supabaseEnv } from "@/lib/supabase/config";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Entrar" };

const NOTICES: Record<string, string> = {
  "sem-acesso": "Sua conta não tem acesso ativo ao Studio. Fale com um Sócio/Admin.",
  link: "O link expirou ou já foi usado. Peça um novo.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const next = params.next?.startsWith("/studio") ? params.next : "/studio";
  const configured = Boolean(supabaseEnv());
  return (
    <>
      <div>
        <h1>Entrar no Studio</h1>
        <p>Central de gestão da Bellman</p>
      </div>
      {configured ? (
        <LoginForm next={next} notice={params.erro ? NOTICES[params.erro] : undefined} />
      ) : (
        <p className="st-alert" role="alert">
          O Studio ainda não foi configurado neste ambiente.
        </p>
      )}
    </>
  );
}
