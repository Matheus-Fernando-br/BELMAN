import { continueRender, delayRender, staticFile } from "remotion";

// Fontes locais (Inter/Manrope) servidas pela pasta public do bundle.
const faces: [string, string, string][] = [
  ["Inter", "inter-latin-400-normal.woff", "400"],
  ["Inter", "inter-latin-700-normal.woff", "700"],
  ["Inter", "inter-latin-800-normal.woff", "800"],
  ["Manrope", "manrope-latin-400-normal.woff", "400"],
  ["Manrope", "manrope-latin-800-normal.woff", "800"],
];

let loaded = false;
export function loadFonts() {
  if (loaded || typeof document === "undefined") return;
  loaded = true;
  const handle = delayRender("fontes");
  Promise.all(
    faces.map(([family, file, weight]) => {
      const face = new FontFace(family, `url(${staticFile(file)})`, { weight });
      document.fonts.add(face);
      return face.load();
    }),
  )
    .then(() => continueRender(handle))
    .catch(() => continueRender(handle));
}
