import { redirect } from "next/navigation";
import { requireStudio } from "@/lib/studio/session";

export default async function SettingsIndex() {
  const ctx = await requireStudio();
  redirect(ctx.isAdmin ? "/studio/configuracoes/usuarios" : "/studio/configuracoes/seguranca");
}
