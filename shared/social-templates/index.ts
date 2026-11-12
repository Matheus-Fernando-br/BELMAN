// Templates de arte das redes sociais (JSX → SVG via Satori no worker).
// Componentes "puros": objetos { type, props } sem React nem Next, para servir ao worker
// (render) e a qualquer prévia leve. Parametrizados por paleta, fontes, logo e @.

import type { CarouselCopy, PostCopy, StoryCopy, YoutubeCopy } from "../social/copy";

export type Node = { type: string; props: Record<string, unknown> & { children?: unknown } } | string | null | undefined | false;
export function h(type: string, props: Record<string, unknown> | null, ...children: (Node | Node[])[]): Node {
  const flat = children.flat().filter((c) => c !== null && c !== undefined && c !== false);
  return { type, props: { ...(props ?? {}), children: flat.length === 0 ? undefined : flat.length === 1 ? flat[0] : flat } };
}

export type Brand = {
  handle: string;
  palette: { primary: string; accent: string; bg: string; text: string };
  fonts: { heading: string; body: string };
  logo?: string | null; // data URL
};

export type Frame = { node: Node; width: number; height: number; name: string };

// ---------------------------------------------------------------- cores
function hex(c: string) {
  const v = c.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
}
function mix(a: string, b: string, t: number) {
  const [x, y] = [hex(a), hex(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("")}`;
}
function luminance(c: string) {
  const [r, g, b] = hex(c).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** Texto legível sobre um fundo (branco ou quase preto). */
export const onColor = (bg: string) => (luminance(bg) > 0.45 ? "#1A1714" : "#FFFFFF");

function tones(b: Brand) {
  const p = b.palette;
  return {
    primary: p.primary,
    accent: p.accent,
    dark: p.bg,
    light: mix("#FFFFFF", p.primary, 0.05),
    ink: "#1F1A16",
    line: mix("#FFFFFF", "#000000", 0.1),
  };
}

const SAFE = 120; // área segura (px) nas bordas

// ---------------------------------------------------------------- peças
function Footer(b: Brand, page: string | null, color: string, hgt: number) {
  return h(
    "div",
    { style: { position: "absolute", left: SAFE, top: hgt - 64 - 56, height: 56, width: 1080 - SAFE * 2, display: "flex", alignItems: "center", justifyContent: "space-between", color, fontSize: 30, fontWeight: 700 } },
    h(
      "div",
      { style: { display: "flex", alignItems: "center", gap: 18 } },
      b.logo ? h("img", { src: b.logo, width: 52, height: 52, style: { borderRadius: 12, objectFit: "contain" } }) : null,
      h("span", null, b.handle),
    ),
    page ? h("span", null, page) : null,
  );
}

function Shell(b: Brand, bg: string, children: Node[], page: string | null, w = 1080, hgt = 1350) {
  const fg = onColor(bg);
  return h(
    "div",
    { style: { width: w, height: hgt, display: "flex", flexDirection: "column", background: bg, color: fg, fontFamily: b.fonts.body, position: "relative" } },
    h(
      "div",
      { style: { display: "flex", flexDirection: "column", justifyContent: "center", width: w - SAFE * 2, height: hgt - SAFE * 2 - 60, marginLeft: SAFE, marginTop: SAFE } },
      ...children,
    ),
    Footer(b, page, fg, hgt),
  );
}

const Kicker = (text: string, color: string) =>
  text ? h("div", { style: { fontSize: 32, fontWeight: 800, letterSpacing: 5, textTransform: "uppercase", color, marginBottom: 28 } }, text) : null;

const Title = (b: Brand, text: string, size: number, color?: string) =>
  h("div", { style: { fontFamily: b.fonts.heading, fontSize: size, fontWeight: 800, lineHeight: 1.03, letterSpacing: -size * 0.03, color } }, text);

const Body = (text: string, size = 44, color?: string, opacity = 1) =>
  h("div", { style: { fontSize: size, lineHeight: 1.35, marginTop: 36, color, opacity } }, text);

// ---------------------------------------------------------------- carousel.classic (1080×1350)
export function carouselClassic(b: Brand, c: CarouselCopy): Frame[] {
  const t = tones(b);
  const total = c.slides.length + 3;
  const pg = (i: number) => `${i}/${total}`;
  const frames: Frame[] = [];
  const add = (node: Node, name: string) => frames.push({ node, width: 1080, height: 1350, name });

  // capa
  add(
    Shell(b, t.primary, [Kicker(c.cover.kicker, onColor(t.primary)), Title(b, c.cover.title, c.cover.title.length > 34 ? 104 : 124), Body(c.cover.subtitle, 46, undefined, 0.95)], pg(1)),
    "capa",
  );

  c.slides.forEach((s, i) => {
    const page = pg(i + 2);
    if (s.kind === "dor") {
      add(Shell(b, t.dark, [Kicker("O problema", t.accent), Title(b, s.title, 84), Body(s.body, 44, undefined, 0.9)], page), `slide ${i + 1}`);
    } else if (s.kind === "citacao") {
      add(Shell(b, t.primary, [h("div", { style: { fontSize: 160, lineHeight: 0.6, fontWeight: 800, opacity: 0.5 } }, '"'), Title(b, s.title, 80), Body(s.body, 40, undefined, 0.9)], page), `slide ${i + 1}`);
    } else if (s.kind === "numero" && s.number) {
      add(
        Shell(b, t.light, [h("div", { style: { fontFamily: b.fonts.heading, fontSize: 220, fontWeight: 800, color: t.primary, lineHeight: 1, letterSpacing: -8 } }, s.number), Title(b, s.title, 64, t.ink), Body(s.body, 42, t.ink)], page),
        `slide ${i + 1}`,
      );
    } else if (s.kind === "lista" && s.items.length) {
      add(
        Shell(
          b,
          t.light,
          [
            Title(b, s.title, 80, t.primary),
            h(
              "div",
              { style: { display: "flex", flexDirection: "column", marginTop: 40 } },
              ...s.items.slice(0, 6).map((item, n) =>
                h(
                  "div",
                  { style: { display: "flex", gap: 36, padding: "26px 0", borderBottom: `3px solid ${t.line}`, color: t.ink, fontSize: 42, lineHeight: 1.3 } },
                  h("span", { style: { color: t.primary, fontWeight: 800, width: 44 } }, String(n + 1)),
                  h("span", { style: { flex: 1 } }, item),
                ),
              ),
            ),
          ],
          page,
        ),
        `slide ${i + 1}`,
      );
    } else {
      add(Shell(b, t.light, [Title(b, s.title, 84, t.primary), Body(s.body, 46, t.ink)], page), `slide ${i + 1}`);
    }
  });

  // resumo
  add(
    Shell(
      b,
      t.dark,
      [
        Kicker("Resumo", t.accent),
        h(
          "div",
          { style: { display: "flex", flexDirection: "column", gap: 30 } },
          ...c.recap.slice(0, 5).map((r) =>
            h(
              "div",
              { style: { display: "flex", gap: 28, fontSize: 44, lineHeight: 1.3 } },
              h("div", { style: { width: 26, height: 26, marginTop: 14, borderRadius: 6, background: t.accent, flexShrink: 0 } }),
              h("span", { style: { flex: 1 } }, r),
            ),
          ),
        ),
      ],
      pg(total - 1),
    ),
    "resumo",
  );

  // chamada
  add(
    Shell(
      b,
      t.primary,
      [
        Title(b, c.cta, 92),
        h(
          "div",
          { style: { display: "flex", marginTop: 56 } },
          h("div", { style: { padding: "26px 46px", borderRadius: 999, background: onColor(t.primary), color: t.primary, fontSize: 40, fontWeight: 800 } }, "Link na bio"),
        ),
      ],
      pg(total),
    ),
    "chamada",
  );
  return frames;
}

// ---------------------------------------------------------------- post.single
export function postSingle(b: Brand, c: PostCopy): Frame[] {
  const t = tones(b);
  return [{ node: Shell(b, t.primary, [Kicker(c.kicker, onColor(t.primary)), Title(b, c.title, c.title.length > 40 ? 96 : 116), Body(c.body, 44, undefined, 0.95)], null), width: 1080, height: 1350, name: "arte" }];
}

// ---------------------------------------------------------------- story.frames (1080×1920)
export function storyFrames(b: Brand, c: StoryCopy): Frame[] {
  const t = tones(b);
  return c.frames.map((f, i) => {
    const bg = i % 2 ? t.dark : t.primary;
    return {
      node: Shell(
        b,
        bg,
        [
          Title(b, f.text, f.text.length > 60 ? 84 : 104),
          // espaço para a figurinha (enquete, caixinha, link): adicionada no app
          f.sticker_suggestion
            ? h(
                "div",
                { style: { marginTop: 80, height: 300, borderRadius: 48, border: `5px dashed ${onColor(bg)}`, opacity: 0.45, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34 } },
                f.sticker_suggestion,
              )
            : null,
        ],
        `${i + 1}/${c.frames.length}`,
        1080,
        1920,
      ),
      width: 1080,
      height: 1920,
      name: `story ${i + 1}`,
    };
  });
}

// ---------------------------------------------------------------- youtube.thumbnail (1280×720)
export function youtubeThumbnail(b: Brand, c: Pick<YoutubeCopy, "thumbnail_text">): Frame[] {
  const t = tones(b);
  return [
    {
      node: h(
        "div",
        { style: { width: 1280, height: 720, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: t.dark, color: "#FFFFFF", fontFamily: b.fonts.heading } },
        h("div", { style: { width: 180, height: 16, background: t.primary } }),
        h("div", { style: { fontSize: c.thumbnail_text.length > 24 ? 104 : 132, fontWeight: 800, lineHeight: 1, letterSpacing: -4 } }, c.thumbnail_text),
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: 18, fontSize: 36, fontWeight: 700, color: t.accent } },
          b.logo ? h("img", { src: b.logo, width: 56, height: 56, style: { objectFit: "contain" } }) : null,
          b.handle,
        ),
      ),
      width: 1280,
      height: 720,
      name: "miniatura",
    },
  ];
}

/** Capa (frame único 1080×1920) para Reels. */
export function reelCover(b: Brand, title: string): Frame {
  const t = tones(b);
  return { node: Shell(b, t.primary, [Title(b, title, title.length > 40 ? 110 : 132)], null, 1080, 1920), width: 1080, height: 1920, name: "capa" };
}

export const TEMPLATES: Record<string, string> = {
  carousel: "carousel.classic",
  post: "post.single",
  story: "story.frames",
  youtube_thumbnail: "youtube.thumbnail",
  youtube_video: "youtube.thumbnail",
};
