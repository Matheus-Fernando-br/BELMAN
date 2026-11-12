import { AbsoluteFill, interpolate, OffthreadVideo, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFonts } from "./fonts";
import type { BrandProps } from "./ReelTextBeats";

export type ScreenProps = { brand: BrandProps; videoUrl: string; durationMs: number; captions: { startMs: number; endMs: number; text: string }[]; zoom: number };

loadFonts();

/** Gravação de tela com zoom suave e legenda em destaque. */
export function ScreenDemo({ brand, videoUrl, captions, zoom }: ScreenProps) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const ms = (frame / fps) * 1000;
  const scale = interpolate(frame, [0, durationInFrames], [1, zoom]);
  const cap = captions.find((c) => ms >= c.startMs && ms < c.endMs);
  return (
    <AbsoluteFill style={{ background: brand.bg, fontFamily: brand.font }}>
      <AbsoluteFill style={{ transform: `scale(${scale})` }}>
        <OffthreadVideo src={videoUrl} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      </AbsoluteFill>
      {cap && (
        <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", padding: "0 80px 260px" }}>
          <div style={{ background: brand.primary, color: "#FFFFFF", fontSize: 58, fontWeight: 800, lineHeight: 1.15, padding: "18px 28px", borderRadius: 18, textAlign: "center" }}>{cap.text}</div>
        </AbsoluteFill>
      )}
      <AbsoluteFill style={{ justifyContent: "flex-start", padding: "110px 80px 0" }}>
        <div style={{ color: "#FFFFFF", fontSize: 32, fontWeight: 700, textShadow: "0 2px 8px rgba(0,0,0,.6)" }}>{brand.handle}</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
