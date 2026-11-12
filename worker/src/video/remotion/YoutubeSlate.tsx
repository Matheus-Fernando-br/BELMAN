import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFonts } from "./fonts";
import type { BrandProps } from "./ReelTextBeats";

export type SlateProps = { brand: BrandProps; title: string; subtitle: string; kind: "intro" | "outro" };

loadFonts();

/** Abertura e encerramento do YouTube (1920×1080, 5 s). */
export function YoutubeSlate({ brand, title, subtitle, kind }: SlateProps) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200 } });
  const out = interpolate(frame, [durationInFrames - 12, durationInFrames], [1, 0], { extrapolateLeft: "clamp" });
  return (
    <AbsoluteFill style={{ background: kind === "intro" ? brand.bg : brand.primary, justifyContent: "center", alignItems: "center", fontFamily: brand.font, opacity: out }}>
      {brand.logo && <Img src={brand.logo} style={{ width: 160, height: 160, objectFit: "contain", marginBottom: 40, transform: `scale(${enter})` }} />}
      <div style={{ color: "#FFFFFF", fontSize: 120, fontWeight: 800, letterSpacing: -4, transform: `translateY(${(1 - enter) * 40}px)` }}>{title}</div>
      <div style={{ width: 240 * enter, height: 14, background: kind === "intro" ? brand.primary : "#FFFFFF", margin: "36px 0" }} />
      <div style={{ color: "#FFFFFF", fontSize: 50, opacity: 0.9 }}>{subtitle}</div>
    </AbsoluteFill>
  );
}
