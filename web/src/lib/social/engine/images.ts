import "server-only";
import { Resvg } from "@resvg/resvg-js";
import satori from "satori";
import sharp from "sharp";
import type { Frame, Node } from "@shared/social-templates/index";
import { FONT_DATA } from "./fonts-data";

// Satori (JSX → SVG) + resvg (SVG → PNG) + sharp (PNG → JPEG q92, sem metadados).

type Font = { name: string; data: Buffer; weight: 400 | 600 | 700 | 800; style: "normal" };
let fonts: Font[] | null = null;
function loadFonts() {
  const f = (name: string, file: string, weight: Font["weight"]): Font => ({ name, data: Buffer.from(FONT_DATA[file], "base64"), weight, style: "normal" });
  fonts ??= [
    f("Inter", "inter-latin-400-normal.woff", 400),
    f("Inter", "inter-latin-600-normal.woff", 600),
    f("Inter", "inter-latin-700-normal.woff", 700),
    f("Inter", "inter-latin-800-normal.woff", 800),
    f("Manrope", "manrope-latin-400-normal.woff", 400),
    f("Manrope", "manrope-latin-700-normal.woff", 700),
    f("Manrope", "manrope-latin-800-normal.woff", 800),
  ];
  return fonts;
}

// Emojis via Twemoji (SVG), sob demanda.
const emojiCache = new Map<string, string>();
async function emoji(segment: string) {
  const code = [...segment]
    .map((c) => c.codePointAt(0)!.toString(16))
    .filter((c) => c !== "fe0f")
    .join("-");
  if (emojiCache.has(code)) return emojiCache.get(code)!;
  try {
    const res = await fetch(`https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/${code}.svg`, { signal: AbortSignal.timeout(8000) });
    const data = res.ok ? `data:image/svg+xml;base64,${Buffer.from(await res.text()).toString("base64")}` : "";
    emojiCache.set(code, data);
    return data;
  } catch {
    return "";
  }
}

async function toPng(node: Node, width: number, height: number) {
  const svg = await satori(node as Parameters<typeof satori>[0], {
    width,
    height,
    fonts: loadFonts(),
    loadAdditionalAsset: async (code, segment) => (code === "emoji" ? emoji(segment) : ""),
  });
  return new Resvg(svg, { fitTo: { mode: "width", value: width }, font: { loadSystemFonts: false } }).render().asPng();
}

export type Rendered = { jpeg: Buffer; preview: Buffer; width: number; height: number; name: string };

export async function renderFrames(frames: Frame[]): Promise<Rendered[]> {
  const out: Rendered[] = [];
  for (const f of frames) {
    const png = await toPng(f.node, f.width, f.height);
    const jpeg = await sharp(png).flatten({ background: "#ffffff" }).jpeg({ quality: 92, chromaSubsampling: "4:4:4", mozjpeg: true }).toBuffer();
    const preview = await sharp(png).resize({ width: 360 }).png({ compressionLevel: 9 }).toBuffer();
    out.push({ jpeg, preview, width: f.width, height: f.height, name: f.name });
  }
  return out;
}
