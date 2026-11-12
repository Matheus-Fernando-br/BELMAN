import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";

// Remotion: composições React renderizadas no Chromium headless do container.
// Licença: gratuita para pessoas físicas e empresas com até 3 funcionários (ver README).

const here = path.dirname(fileURLToPath(import.meta.url));
let served: Promise<string> | null = null;

function serveUrl() {
  served ??= bundle({
    entryPoint: path.join(here, "remotion", "index.ts"),
    publicDir: path.join(here, "..", "..", "assets", "fonts"),
    onProgress: () => undefined,
  });
  return served;
}

export async function renderComposition(id: string, inputProps: Record<string, unknown>, output: string) {
  const url = await serveUrl();
  const browserExecutable = process.env.REMOTION_BROWSER || null;
  const composition = await selectComposition({ serveUrl: url, id, inputProps, browserExecutable });
  await renderMedia({
    composition,
    serveUrl: url,
    codec: "h264",
    audioCodec: "aac",
    pixelFormat: "yuv420p",
    crf: 20,
    outputLocation: output,
    inputProps,
    browserExecutable,
    concurrency: Number(process.env.REMOTION_CONCURRENCY ?? 2),
    chromiumOptions: { gl: "swangle" },
    timeoutInMilliseconds: 120_000,
  });
  return { output, durationMs: Math.round((composition.durationInFrames / composition.fps) * 1000) };
}
