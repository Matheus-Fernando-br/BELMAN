import type { Brand } from "@shared/social-templates/index";
import type { BrandProfile } from "../ai.js";
import { BUCKET, db } from "../db.js";

export type Job = { id: string; entity_id: string | null; post_id: string | null; kind: string; payload: Record<string, unknown>; attempts: number; max_attempts: number; created_by: string | null };

export async function loadBrand(entityId: string) {
  const [{ data: b }, { data: e }] = await Promise.all([
    db.from("brand_profiles").select("*").eq("entity_id", entityId).maybeSingle(),
    db.from("entities").select("slug,name").eq("id", entityId).single(),
  ]);
  if (!b) throw new Error("Configure o perfil de marca (Redes Sociais → Marca).");
  return { profile: b as BrandProfile & { palette: Brand["palette"]; fonts: Brand["fonts"]; logo_path: string | null }, entity: e as { slug: string; name: string } };
}

const logoCache = new Map<string, string>();
export async function templateBrand(entityId: string): Promise<Brand> {
  const { profile, entity } = await loadBrand(entityId);
  let logo: string | null = null;
  if (profile.logo_path) {
    if (logoCache.has(profile.logo_path)) logo = logoCache.get(profile.logo_path)!;
    else {
      const { data } = await db.storage.from(BUCKET).download(profile.logo_path);
      if (data) {
        const buf = Buffer.from(await data.arrayBuffer());
        logo = `data:${profile.logo_path.endsWith(".png") ? "image/png" : "image/jpeg"};base64,${buf.toString("base64")}`;
        logoCache.set(profile.logo_path, logo);
      }
    }
  }
  return {
    handle: profile.handle || `@${entity.slug}`,
    palette: { ...{ primary: "#000000", accent: "#FFFFFF", bg: "#000000", text: "#FFFFFF" }, ...(profile.palette as Partial<Brand["palette"]>) },
    fonts: { ...{ heading: "Inter", body: "Inter" }, ...(profile.fonts as Partial<Brand["fonts"]>) },
    logo,
  };
}

export async function logUsage(entityId: string, postId: string | null, purpose: string, u: { model: string; input_tokens: number; output_tokens: number; cache_read_tokens: number; cache_write_tokens: number; cost_usd: number }) {
  await db.from("ai_usage").insert({ entity_id: entityId, post_id: postId, purpose, ...u, cost_usd: Number(u.cost_usd.toFixed(5)) });
}
