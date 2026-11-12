import { existsSync } from "node:fs";
import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { run } from "./ffmpeg.js";

// Voz e legendas sem tokens: Piper TTS (pt_BR-faber-medium) e whisper.cpp (modelo small, pt).
// Ficam no container (Dockerfile). Sem os binários, o worker segue sem voz/legenda e avisa.

const PIPER = process.env.PIPER_BIN || "/opt/piper/piper";
const PIPER_VOICE = process.env.PIPER_VOICE || "/opt/piper/pt_BR-faber-medium.onnx";
const WHISPER = process.env.WHISPER_BIN || "/opt/whisper/whisper-cli";
const WHISPER_MODEL = process.env.WHISPER_MODEL || "/opt/whisper/ggml-small.bin";

export const hasPiper = () => existsSync(PIPER) && existsSync(PIPER_VOICE);
export const hasWhisper = () => existsSync(WHISPER) && existsSync(WHISPER_MODEL);

/** Sintetiza um texto em WAV. */
export async function speak(text: string, out: string) {
  const input = `${out}.txt`;
  await writeFile(input, text);
  // piper lê do stdin; usamos sh para redirecionar o arquivo
  await run("sh", ["-c", `"${PIPER}" --model "${PIPER_VOICE}" --output_file "${out}" < "${input}"`]);
  return out;
}

/** Transcreve (pt) e devolve o caminho do .srt. */
export async function transcribe(wav: string, dir: string) {
  const base = path.join(dir, "legendas");
  await run(WHISPER, ["-m", WHISPER_MODEL, "-f", wav, "-l", "pt", "-osrt", "-of", base, "-t", String(Math.max(1, Number(process.env.WHISPER_THREADS ?? 2)))], 30 * 60_000);
  const files = await readdir(dir);
  const srt = files.find((f) => f.startsWith("legendas") && f.endsWith(".srt"));
  if (!srt) throw new Error("whisper.cpp não gerou legendas.");
  return path.join(dir, srt);
}
