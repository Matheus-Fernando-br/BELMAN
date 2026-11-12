import "server-only";
import { createClient } from "@/lib/supabase/server";
import { CONSOLIDATED, filterOptions, resolveFilter, type FilterOption } from "./filter";
import type { Option } from "./records";
import { requireStudio, type Entity, type StudioContext } from "./session";

export type ScopeContext = StudioContext & { filter: FilterOption; scope: Entity[]; scopeIds: string[]; entityOptions: Option[] };

/** Contexto + escopo do filtro global (?e=) para qualquer área. */
export async function requireScope(raw?: string | string[]): Promise<ScopeContext> {
  const ctx = await requireStudio();
  const filter = resolveFilter(raw, filterOptions(ctx.visible, ctx.fullAccess));
  const scope = filter.slug === CONSOLIDATED ? ctx.visible : ctx.visible.filter((e) => e.slug === filter.slug);
  return {
    ...ctx,
    filter,
    scope,
    scopeIds: scope.map((e) => e.id),
    entityOptions: (scope.length ? scope : ctx.visible).map((e) => [e.id, e.name] as const),
  };
}

/** Opções dos campos de referência (responsável, projeto, cliente, versão, campanha). */
export async function loadRefs(scopeIds: string[], needs: ("profiles" | "projects" | "customers" | "releases" | "campaigns")[]) {
  const supabase = await createClient();
  const out: Partial<Record<(typeof needs)[number], Option[]>> = {};
  await Promise.all(
    needs.map(async (n) => {
      if (n === "profiles") {
        const { data } = await supabase.from("profiles").select("id,full_name,email").eq("active", true).order("full_name");
        out.profiles = (data ?? []).map((p) => [p.id, p.full_name || p.email] as const);
      } else if (n === "projects") {
        const { data } = await supabase.from("projects").select("id,name").in("entity_id", scopeIds).neq("status", "done").order("name");
        out.projects = (data ?? []).map((p) => [p.id, p.name] as const);
      } else if (n === "customers") {
        const { data } = await supabase.from("customers").select("id,name").in("entity_id", scopeIds).order("name").limit(500);
        out.customers = (data ?? []).map((p) => [p.id, p.name] as const);
      } else if (n === "releases") {
        const { data } = await supabase.from("releases").select("id,version,entity_id").in("entity_id", scopeIds).neq("status", "released").order("target_date");
        out.releases = (data ?? []).map((p) => [p.id, p.version] as const);
      } else if (n === "campaigns") {
        const { data } = await supabase.from("campaigns").select("id,name").in("entity_id", scopeIds).order("name");
        out.campaigns = (data ?? []).map((p) => [p.id, p.name] as const);
      }
    }),
  );
  return out;
}

export function todayLocal() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}

export function br(date?: string | null) {
  if (!date) return "—";
  const [y, m, d] = date.slice(0, 10).split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

/** Data/hora ISO de N dias atrás (fora do render, para manter os componentes puros). */
export function daysAgoISO(days: number) {
  return new Date(Date.now() - days * 864e5).toISOString();
}

/** Dias inteiros até uma data (fora do render). */
export function daysUntil(iso: string) {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 864e5);
}
