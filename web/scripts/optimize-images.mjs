// One-off helper: converts the original portfolio screenshots into
// web-ready 16:10 WebP files. Usage: node scripts/optimize-images.mjs <source-dir>
import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const sourceDir = process.argv[2];
if (!sourceDir) throw new Error("Pass the folder with the original screenshots.");

const outDir = path.resolve("public/projects");
const WIDTH = 1600;
const HEIGHT = 1000;
const MAT = { r: 226, g: 231, b: 238, alpha: 1 };

// [source file, output slug, mode, pixels to trim from the top]. "cover" crops
// from the top of full-page captures; "mat" centers small captures on a
// neutral mat instead of upscaling. The trim removes browser/OS chrome.
const images = [
  ["PROJETO FINC.png", "finc", "cover"],
  ["Gerador de Currículo Online.png", "gerador-curriculo", "cover"],
  ["retiro.png", "retiro", "cover", 146],
  ["saite.png", "saite", "cover", 146],
  ["Centro Internacional de Avivamento Primavera.png", "cia-primavera", "cover"],
  ["casamento.png", "casamento", "cover"],
  ["DownYT.png", "conversor-video", "cover"],
  ["formulario.png", "formulario", "cover"],
  ["Mario Game.png", "mario-game", "cover"],
  ["Restaurante.jpg", "reserva-restaurante", "mat"],
  ["Calculadora.png", "calculadora", "mat"],
];

await mkdir(outDir, { recursive: true });

for (const [file, slug, mode, trimTop = 0] of images) {
  let input = sharp(path.join(sourceDir, file));
  if (trimTop) {
    const meta = await input.metadata();
    input = sharp(
      await input
        .extract({ left: 0, top: trimTop, width: meta.width, height: meta.height - trimTop })
        .toBuffer(),
    );
  }
  let pipeline;
  if (mode === "cover") {
    pipeline = input.resize(WIDTH, HEIGHT, { fit: "cover", position: "top" });
  } else {
    const meta = await input.metadata();
    const scale = Math.min((HEIGHT * 0.78) / meta.height, (WIDTH * 0.7) / meta.width, 1.6);
    const inner = await input
      .resize(Math.round(meta.width * scale), Math.round(meta.height * scale))
      .toBuffer();
    pipeline = sharp({ create: { width: WIDTH, height: HEIGHT, channels: 4, background: MAT } })
      .composite([{ input: inner, gravity: "center" }]);
  }
  const out = path.join(outDir, `${slug}.webp`);
  const info = await pipeline.webp({ quality: 80 }).toFile(out);
  console.log(`${slug}.webp ${Math.round(info.size / 1024)} KB`);
}
