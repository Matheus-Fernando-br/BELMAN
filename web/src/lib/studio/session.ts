import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type Role = "admin" | "collaborator" | "viewer";

export type Entity = {
  id: string;
  slug: string;
  name: string;
  kind: "holding" | "product" | "shared";
  color: string;
  description: string | null;
  site_url: string | null;
  admin_url: string | null;
  metrics_url: string | null;
  sort_order: number;
  active: boolean;
};

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  all_entities: boolean;
  active: boolean;
};

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Sócio/Admin",
  collaborator: "Colaborador",
  viewer: "Leitura",
};

export type StudioContext = {
  profile: Profile;
  entities: Entity[]; // all active entities (for labels/colors)
  visible: Entity[]; // entities this user may see
  fullAccess: boolean;
  canWrite: boolean;
  isAdmin: boolean;
  canSeeFinance: boolean;
  hasMfa: boolean;
};

/** Loads the signed-in member once per request, or redirects. */
export const requireStudio = cache(async (): Promise<StudioContext> => {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) redirect("/studio/login");

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") redirect("/studio/mfa");

  const [{ data: profile }, { data: entities }, { data: access }] = await Promise.all([
    supabase.from("profiles").select("id,email,full_name,role,all_entities,active").eq("id", userId).maybeSingle(),
    supabase.from("entities").select("*").eq("active", true).order("sort_order"),
    supabase.from("user_entity_access").select("entity_id").eq("user_id", userId),
  ]);

  if (!profile || !profile.active) {
    await supabase.auth.signOut();
    redirect("/studio/login?erro=sem-acesso");
  }

  const all = (entities ?? []) as Entity[];
  const p = profile as Profile;
  const fullAccess = p.role === "admin" || p.all_entities;
  const allowed = new Set((access ?? []).map((a) => a.entity_id as string));
  const visible = fullAccess ? all : all.filter((e) => allowed.has(e.id) || e.kind === "shared");

  return {
    profile: p,
    entities: all,
    visible,
    fullAccess,
    isAdmin: p.role === "admin",
    canWrite: p.role !== "viewer",
    canSeeFinance: p.role === "admin",
    hasMfa: aal?.nextLevel === "aal2",
  };
});

export async function requireAdmin() {
  const ctx = await requireStudio();
  if (!ctx.isAdmin) redirect("/studio?erro=restrito");
  return ctx;
}
