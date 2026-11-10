import type { Entity } from "./session";

export const CONSOLIDATED = "consolidado";

export type FilterOption = { slug: string; label: string; color: string };

/** Options for the global filter: Consolidado first, then products and Compartilhado. */
export function filterOptions(visible: Entity[], fullAccess: boolean): FilterOption[] {
  const scoped = visible
    .filter((e) => e.kind !== "holding")
    .map((e) => ({ slug: e.slug, label: e.name, color: e.color }));
  return fullAccess ? [{ slug: CONSOLIDATED, label: "Consolidado", color: "#000000" }, ...scoped] : scoped;
}

/** Resolves ?e= against what the user may see; falls back to the first option. */
export function resolveFilter(raw: string | string[] | undefined, options: FilterOption[]): FilterOption {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return options.find((o) => o.slug === value) ?? options[0] ?? { slug: CONSOLIDATED, label: "Consolidado", color: "#000000" };
}
