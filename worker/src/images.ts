import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import satori from "satori";
import sharp from "sharp";
import type { Frame, Node } from "@shared/social-templates/index";

// Satori (JSX → SVG) + resvg (SVG → PNG) + sharp (PNG → JPEG q92, sem metadados).

const here = path.dirname(fileURLToPath(import.meta.url));
const FONT_DIR = path.join(here, "..", "assets", "fonts");

type Font = { name: string; data: Buffer; weight: 400 | 600 | 700 | 800; style: "normal" };
let fonts: Font[] | null = null;
async function loadFonts() {
  if (fonts) return fonts;
  const files: [string, string, Font["weight"]][] = [
    ["Inter", "inter-latin-400-normal.woff", 400],
    ["Inter", "inter-latin-600-normal.woff", 600],
    ["Inter", "inter-latin-700-normal.woff", 700],
    ["Inter", "inter-latin-800-normal.woff", 800],
    ["Manrope", "manrope-latin-400-normal.woff", 400],
    ["Manrope", "manrope-latin-700-normal.woff", 700],
    ["Manrope", "manrope-latin-800-normal.woff", 800],
  ];
  fonts = await Promise.all(files.map(async ([name, file, weight]) => ({ name, data: await readFile(path.join(FONT_DIR, file)), weight, style: "normal" as const })));
  return fonts;
}

// Emojis via Twemoji (SVG), baixados sob demanda e guardados em memória.
const emojiCache = new Map<string, string>();
async function emoji(segment: string) {
  const code = [...segment]
    .map((c) => c.codePointAt(0)!.toString(16))
    .filter((c) => c !== "fe0f")
    .join("-");
  if (emojiCache.has(code)) return emojiCache.get(code)!;
  try {
    const res = await fetch(`https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/${code}.svg`, { signal: AbortSignal.timeout(8000) });
    const svg = res.ok ? await res.text() : "";
    const data = svg ? `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}` : "";
    emojiCache.set(code, data);
    return data;
  } catch {
    return "";
  }
}

export async function toPng(node: Node, width: number, height: number) {
  const svg = await satori(node as Parameters<typeof satori>[0], {
    width,
    height,
    fonts: await loadFonts(),
    loadAdditionalAsset: async (code, segment) => (code === "emoji" ? emoji(segment) : ""),
  });
  return new Resvg(svg, { fitTo: { mode: "width", value: width }, font: { loadSystemFonts: false } }).render().asPng();
}

export type Rendered = { jpeg: Buffer; preview: Buffer; width: number; height: number; name: string };

export async function renderFrames(frames: Frame[]): Promise<Rendered[]> {
  const out: Rendered[] = [];
  for (const f of frames) {
    const png = await toPng(f.node, f.width, f.height);
    // sharp não copia metadados a menos que peça (withMetadata); JPEG q92 para a Meta
    const jpeg = await sharp(png).flatten({ background: "#ffffff" }).jpeg({ quality: 92, chromaSubsampling: "4:4:4", mozjpeg: true }).toBuffer();
    const preview = await sharp(png).resize({ width: 360 }).png({ compressionLevel: 9 }).toBuffer();
    out.push({ jpeg, preview, width: f.width, height: f.height, name: f.name });
  }
  return out;
}
