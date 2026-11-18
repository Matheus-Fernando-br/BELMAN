"use server";

import { arteKit } from "@shared/social-templates/obra-facil";
import { temKit } from "@shared/social-templates/obra-facil-modelos";
import { renderPng } from "@/lib/social/engine/images";
import { requireWorkspace } from "@/lib/social/server";

export type ArteInput = { modelo: string; formato: string; campos: Record<string, string | boolean>; foto?: string | null };
export type ArteResult = { png: string; width: number; height: number; name: string } | { error: string };

const MAX_FOTO = 4_000_000; // data URL (a foto já chega reduzida a 1440 px pelo navegador)

/** Desenha uma arte do kit visual da entidade e devolve o PNG (data URL) para prévia e download. Nada é salvo. */
export async function gerarArteAction(slug: string, input: ArteInput): Promise<ArteResult> {
  try {
    await requireWorkspace(slug);
    if (!temKit(slug)) return { error: "Esta entidade ainda não tem kit visual." };
    if (input.foto && (typeof input.foto !== "string" || input.foto.length > MAX_FOTO)) return { error: "Foto grande demais. Use uma imagem menor." };
    const frame = arteKit(slug, { modelo: String(input.modelo), formato: String(input.formato), campos: input.campos ?? {}, foto: input.foto ?? null });
    const png = await renderPng(frame);
    return { png: `data:image/png;base64,${Buffer.from(png).toString("base64")}`, width: frame.width, height: frame.height, name: frame.name };
  } catch (e) {
    return { error: (e as Error).message || "Não foi possível gerar a arte." };
  }
}
