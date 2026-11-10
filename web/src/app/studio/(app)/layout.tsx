import { Shell } from "@/components/studio/Shell";
import { filterOptions } from "@/lib/studio/filter";
import { ROLE_LABEL, requireStudio } from "@/lib/studio/session";

export default async function StudioAppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireStudio();
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
    >
      {children}
    </Shell>
  );
}
