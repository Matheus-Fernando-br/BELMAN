import "server-only";
import { readFile } from "node:fs/promises";
import { ImageResponse } from "next/og";
import sharp from "sharp";

// Artes geradas a partir de modelos com a identidade de cada marca.
// Saída em JPEG (o Instagram aceita só JPEG para imagens).

export type Brand = {
  name: string;
  handle: string | null;
  font: string;
  colors: { primary?: string; accent?: string; background?: string; text?: string };
};

type Font = { name: string; data: Buffer; weight: 400 | 600 | 700 | 800; style: "normal" };
let fontCache: Font[] | null = null;
async function fonts(): Promise<Font[]> {
  if (fontCache) return fontCache;
  const load = (file: string) => readFile(new URL(`../../fonts/og/${file}`, import.meta.url));
  const [i4, i6, i7, i8, m4, m7, m8] = await Promise.all([
    load("inter-latin-400-normal.woff"),
    load("inter-latin-600-normal.woff"),
    load("inter-latin-700-normal.woff"),
    load("inter-latin-800-normal.woff"),
    load("manrope-latin-400-normal.woff"),
    load("manrope-latin-700-normal.woff"),
    load("manrope-latin-800-normal.woff"),
  ]);
  fontCache = [
    { name: "Inter", data: i4, weight: 400, style: "normal" },
    { name: "Inter", data: i6, weight: 600, style: "normal" },
    { name: "Inter", data: i7, weight: 700, style: "normal" },
    { name: "Inter", data: i8, weight: 800, style: "normal" },
    { name: "Manrope", data: m4, weight: 400, style: "normal" },
    { name: "Manrope", data: m7, weight: 700, style: "normal" },
    { name: "Manrope", data: m8, weight: 800, style: "normal" },
  ];
  return fontCache;
}

// Emojis não são desenhados nas artes (ficam só na legenda).
const clean = (s?: string | null) => (s ?? "").replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "").replace(/\s+/g, " ").trim();

function palette(b: Brand) {
  return {
    bg: b.colors.background || "#000000",
    fg: b.colors.text || "#FFFFFF",
    primary: b.colors.primary || "#FFFFFF",
    accent: b.colors.accent || b.colors.primary || "#FFFFFF",
    font: b.font === "Manrope" ? "Manrope" : "Inter",
  };
}

async function toJpeg(el: React.ReactElement, width: number, height: number) {
  const png = Buffer.from(await new ImageResponse(el, { width, height, fonts: await fonts() }).arrayBuffer());
  return sharp(png).jpeg({ quality: 90, chromaSubsampling: "4:4:4", mozjpeg: true }).toBuffer();
}

function Frame({ b, children, w, h, footer = true, page }: { b: Brand; children: React.ReactNode; w: number; h: number; footer?: boolean; page?: string }) {
  const p = palette(b);
  const pad = Math.round(w * 0.08);
  return (
    <div style={{ width: w, height: h, display: "flex", flexDirection: "column", background: p.bg, color: p.fg, fontFamily: p.font, padding: pad, position: "relative" }}>
      <div style={{ position: "absolute", top: 0, left: 0, width: w, height: Math.round(h * 0.012), background: p.primary, display: "flex" }} />
      <div style={{ display: "flex", flex: 1, flexDirection: "column" }}>{children}</div>
      {footer && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: Math.round(w * 0.028), opacity: 0.85 }}>
          <span style={{ fontWeight: 700 }}>{b.handle || b.name}</span>
          {page && <span style={{ fontWeight: 600, color: p.accent }}>{page}</span>}
        </div>
      )}
    </div>
  );
}

const W = 1080;
const H = 1350;

export type SlideContent = { heading: string; body: string };

export async function renderCarousel(b: Brand, c: { cover: { headline: string; subtitle: string }; slides: SlideContent[]; summary: string[]; cta: string }) {
  const p = palette(b);
  const total = c.slides.length + 3;
  const out: Buffer[] = [];
  out.push(
    await toJpeg(
      <Frame b={b} w={W} h={H} page={`1/${total} · arraste`}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, gap: 36 }}>
          <div style={{ display: "flex", width: 120, height: 12, background: p.primary }} />
          <div style={{ display: "flex", fontSize: 96, fontWeight: 800, lineHeight: 1.02, letterSpacing: -3 }}>{clean(c.cover.headline)}</div>
          <div style={{ display: "flex", fontSize: 44, lineHeight: 1.3, opacity: 0.85 }}>{clean(c.cover.subtitle)}</div>
        </div>
      </Frame>,
      W,
      H,
    ),
  );
  for (const [i, s] of c.slides.entries()) {
    out.push(
      await toJpeg(
        <Frame b={b} w={W} h={H} page={`${i + 2}/${total}`}>
          <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 40, paddingTop: 40 }}>
            <div style={{ display: "flex", fontSize: 140, fontWeight: 800, color: p.primary, lineHeight: 1 }}>{String(i + 1).padStart(2, "0")}</div>
            <div style={{ display: "flex", fontSize: 72, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>{clean(s.heading)}</div>
            <div style={{ display: "flex", fontSize: 42, lineHeight: 1.4, opacity: 0.9 }}>{clean(s.body)}</div>
          </div>
        </Frame>,
        W,
        H,
      ),
    );
  }
  out.push(
    await toJpeg(
      <Frame b={b} w={W} h={H} page={`${total - 1}/${total}`}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 34, paddingTop: 40 }}>
          <div style={{ display: "flex", fontSize: 40, fontWeight: 700, color: p.primary, textTransform: "uppercase", letterSpacing: 4 }}>Resumo</div>
          {c.summary.slice(0, 6).map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 24, fontSize: 46, lineHeight: 1.3 }}>
              <div style={{ display: "flex", width: 22, height: 22, marginTop: 18, background: p.primary, borderRadius: 4, flexShrink: 0 }} />
              <div style={{ display: "flex" }}>{clean(item)}</div>
            </div>
          ))}
        </div>
      </Frame>,
      W,
      H,
    ),
  );
  out.push(
    await toJpeg(
      <Frame b={b} w={W} h={H} page={`${total}/${total}`}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "flex-start", flex: 1, gap: 44 }}>
          <div style={{ display: "flex", fontSize: 84, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>{clean(c.cta)}</div>
          <div style={{ display: "flex", padding: "26px 44px", background: p.primary, color: p.bg === p.primary ? p.fg : p.bg, borderRadius: 999, fontSize: 40, fontWeight: 800 }}>
            Salve e compartilhe
          </div>
        </div>
      </Frame>,
      W,
      H,
    ),
  );
  return out;
}

export async function renderSingle(b: Brand, c: { headline: string; body: string }) {
  const p = palette(b);
  return [
    await toJpeg(
      <Frame b={b} w={W} h={H}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, gap: 40 }}>
          <div style={{ display: "flex", width: 120, height: 12, background: p.primary }} />
          <div style={{ display: "flex", fontSize: 92, fontWeight: 800, lineHeight: 1.04, letterSpacing: -3 }}>{clean(c.headline)}</div>
          <div style={{ display: "flex", fontSize: 44, lineHeight: 1.35, opacity: 0.88 }}>{clean(c.body)}</div>
        </div>
      </Frame>,
      W,
      H,
    ),
  ];
}

const SW = 1080;
const SH = 1920;

export async function renderStories(b: Brand, frames: { text: string; sticker: string | null }[]) {
  const p = palette(b);
  const out: Buffer[] = [];
  for (const [i, f] of frames.entries()) {
    out.push(
      await toJpeg(
        <Frame b={b} w={SW} h={SH} page={`${i + 1}/${frames.length}`}>
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, gap: 60 }}>
            <div style={{ display: "flex", fontSize: 88, fontWeight: 800, lineHeight: 1.08, letterSpacing: -2 }}>{clean(f.text)}</div>
            {/* Espaço livre para a figurinha (enquete, caixinha, link), adicionada no app. */}
            {f.sticker && <div style={{ display: "flex", height: 260, border: `4px dashed ${p.accent}`, borderRadius: 40, opacity: 0.5 }} />}
          </div>
        </Frame>,
        SW,
        SH,
      ),
    );
  }
  return out;
}

export async function renderReelFrames(b: Brand, scenes: { on_screen_text: string }[], cover: string) {
  const p = palette(b);
  const out: Buffer[] = [];
  const all = [{ on_screen_text: cover, cover: true }, ...scenes.map((s) => ({ ...s, cover: false }))];
  for (const s of all) {
    out.push(
      await toJpeg(
        <Frame b={b} w={SW} h={SH} footer={!s.cover}>
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, gap: 40 }}>
            {s.cover && <div style={{ display: "flex", fontSize: 44, fontWeight: 700, color: p.primary }}>{b.handle || b.name}</div>}
            <div style={{ display: "flex", fontSize: s.cover ? 120 : 96, fontWeight: 800, lineHeight: 1.04, letterSpacing: -3 }}>{clean(s.on_screen_text)}</div>
          </div>
        </Frame>,
        SW,
        SH,
      ),
    );
  }
  return out;
}

export async function renderYoutube(b: Brand, c: { thumbnail_text: string; title: string }) {
  const p = palette(b);
  const thumb = await toJpeg(
    <div style={{ width: 1280, height: 720, display: "flex", background: p.bg, color: p.fg, fontFamily: p.font, padding: 72, flexDirection: "column", justifyContent: "space-between" }}>
      <div style={{ display: "flex", width: 160, height: 14, background: p.primary }} />
      <div style={{ display: "flex", fontSize: 104, fontWeight: 800, lineHeight: 1, letterSpacing: -3 }}>{clean(c.thumbnail_text)}</div>
      <div style={{ display: "flex", fontSize: 36, fontWeight: 700, color: p.primary }}>{b.name}</div>
    </div>,
    1280,
    720,
  );
  const slate = (title: string, sub: string) =>
    toJpeg(
      <div style={{ width: 1920, height: 1080, display: "flex", background: p.bg, color: p.fg, fontFamily: p.font, alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 40 }}>
        <div style={{ display: "flex", fontSize: 140, fontWeight: 800, letterSpacing: -4 }}>{clean(title)}</div>
        <div style={{ display: "flex", width: 220, height: 14, background: p.primary }} />
        <div style={{ display: "flex", fontSize: 48, opacity: 0.85 }}>{clean(sub)}</div>
      </div>,
      1920,
      1080,
    );
  return [thumb, await slate(b.name, clean(c.title)), await slate(b.name, `${b.handle ?? ""} · inscreva-se`.trim())];
}
