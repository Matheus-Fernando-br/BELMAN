import { Shell } from "@/components/studio/Shell";
import { filterOptions } from "@/lib/studio/filter";
import { ROLE_LABEL, requireStudio } from "@/lib/studio/session";
import { createClient } from "@/lib/supabase/server";

export default async function StudioAppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireStudio();
  // Sócio/Admin vê no menu quantos chamados estão esperando análise
  let openTickets = 0;
  if (ctx.isAdmin) {
    const supabase = await createClient();
    const { count } = await supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "aberto");
    openTickets = count ?? 0;
  }
  return (
    <Shell
      user={{
        name: ctx.profile.full_name || ctx.profile.email,
        email: ctx.profile.email,
        role: ROLE_LABEL[ctx.profile.role],
      }}
      products={ctx.visible
        .filter((e) => e.kind === "product")
        .map((e) => ({ slug: e.slug, name: e.name, color: e.color, adminUrl: e.admin_url }))}
      filter={filterOptions(ctx.visible, ctx.fullAccess)}
      badges={{ "/studio/desenvolvimento": openTickets }}
    >
      {children}
    </Shell>
  );
}
