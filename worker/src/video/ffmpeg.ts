import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";

// FFmpeg/ffprobe para normalizar vídeos (H.264 + AAC, 30 fps, faststart), mixar trilha com
// ducking sob a voz, extrair capa e queimar legendas.

export function run(bin: string, args: string[], timeoutMs = 15 * 60_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => p.kill("SIGKILL"), timeoutMs);
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err = (err + d).slice(-4000)));
    p.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    p.on("close", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve(out) : reject(new Error(`${path.basename(bin)} saiu com código ${code}: ${err.split("\n").slice(-4).join(" ")}`));
    });
  });
}

const FFMPEG = process.env.FFMPEG_BIN || "ffmpeg";
const FFPROBE = process.env.FFPROBE_BIN || "ffprobe";

export type Probe = { durationMs: number; width: number; height: number; fps: number; hasAudio: boolean };

export async function probe(file: string): Promise<Probe> {
  const json = JSON.parse(await run(FFPROBE, ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", file])) as {
    streams: { codec_type: string; width?: number; height?: number; r_frame_rate?: string }[];
    format: { duration?: string };
  };
  const v = json.streams.find((s) => s.codec_type === "video");
  const [n, d] = (v?.r_frame_rate ?? "30/1").split("/").map(Number);
  return { durationMs: Math.round(Number(json.format.duration ?? 0) * 1000), width: v?.width ?? 0, height: v?.height ?? 0, fps: d ? n / d : 30, hasAudio: json.streams.some((s) => s.codec_type === "audio") };
}

/** 1080×1920 (ou 1920×1080), 30 fps, H.264 High + AAC 128k, faststart; legendas opcionais queimadas. */
export async function normalize(input: string, output: string, opts: { vertical?: boolean; srt?: string | null } = {}) {
  const [w, h] = opts.vertical === false ? [1920, 1080] : [1080, 1920];
  const info = await probe(input);
  const filters = [`scale=${w}:${h}:force_original_aspect_ratio=decrease`, `pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black`, "fps=30", "format=yuv420p"];
  if (opts.srt) filters.push(`subtitles=${opts.srt.replace(/:/g, "\\:")}:force_style='FontName=Inter,FontSize=13,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,BorderStyle=3,Outline=2,MarginV=90'`);
  const audio = info.hasAudio ? ["-c:a", "aac", "-b:a", "128k", "-ar", "48000"] : ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-shortest", "-c:a", "aac", "-b:a", "128k"];
  const args = info.hasAudio
    ? ["-y", "-i", input, "-vf", filters.join(","), "-c:v", "libx264", "-profile:v", "high", "-preset", "medium", "-crf", "20", ...audio, "-movflags", "+faststart", output]
    : ["-y", "-i", input, "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-shortest", "-vf", filters.join(","), "-c:v", "libx264", "-profile:v", "high", "-preset", "medium", "-crf", "20", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", output];
  await run(FFMPEG, args);
  return probe(output);
}

/** Mixa voz (opcional) e trilha (opcional) no vídeo; a trilha abaixa sob a voz (sidechaincompress). */
export async function mixAudio(video: string, output: string, voice: string | null, music: string | null) {
  if (!voice && !music) return run(FFMPEG, ["-y", "-i", video, "-c", "copy", "-movflags", "+faststart", output]);
  const inputs = ["-i", video];
  if (voice) inputs.push("-i", voice);
  if (music) inputs.push("-stream_loop", "-1", "-i", music);
  const vi = voice ? 1 : -1;
  const mi = music ? (voice ? 2 : 1) : -1;
  let filter: string;
  if (voice && music) {
    filter = `[${mi}:a]volume=0.35[m];[${vi}:a]asplit=2[v1][v2];[m][v1]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[duck];[duck][v2]amix=inputs=2:duration=first:normalize=0[a]`;
  } else if (voice) {
    filter = `[${vi}:a]anull[a]`;
  } else {
    filter = `[${mi}:a]volume=0.5[a]`;
  }
  await run(FFMPEG, ["-y", ...inputs, "-filter_complex", filter, "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", output]);
}

export async function extractCover(video: string, output: string, atSeconds = 1) {
  await run(FFMPEG, ["-y", "-ss", String(atSeconds), "-i", video, "-frames:v", "1", "-q:v", "2", output]);
}

export async function extractWav(video: string, output: string) {
  await run(FFMPEG, ["-y", "-i", video, "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", output]);
}

/** Junta trechos de voz, cada um começando no seu instante (ms). */
export async function alignVoice(parts: { file: string; startMs: number }[], output: string) {
  if (!parts.length) return null;
  const inputs = parts.flatMap((p) => ["-i", p.file]);
  const delays = parts.map((p, i) => `[${i}:a]adelay=${p.startMs}|${p.startMs}[d${i}]`).join(";");
  const mix = `${parts.map((_, i) => `[d${i}]`).join("")}amix=inputs=${parts.length}:normalize=0[a]`;
  await run(FFMPEG, ["-y", ...inputs, "-filter_complex", `${delays};${mix}`, "-map", "[a]", "-ar", "48000", output]);
  return output;
}

/** SRT a partir do roteiro (o texto e os tempos já são conhecidos: sem Whisper). */
export async function srtFromBeats(beats: { text: string; startMs: number; endMs: number }[], file: string) {
  const ts = (ms: number) => {
    const h = Math.floor(ms / 3600e3);
    const m = Math.floor((ms % 3600e3) / 60e3);
    const s = Math.floor((ms % 60e3) / 1000);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
  };
  await writeFile(file, beats.map((b, i) => `${i + 1}\n${ts(b.startMs)} --> ${ts(b.endMs)}\n${b.text}\n`).join("\n"));
  return file;
}
