import { AbsoluteFill, Img, interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFonts } from "./fonts";

export type BrandProps = { handle: string; primary: string; accent: string; bg: string; font: string; logo: string | null };
export type ReelProps = { brand: BrandProps; hook: string; beats: { text: string; seconds: number }[]; cta: string };

loadFonts();

function Beat({ text, color, bg, font, big }: { text: string; color: string; bg: string; font: string; big?: boolean }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200 } });
  const words = text.split(" ");
  return (
    <AbsoluteFill style={{ background: bg, padding: 120, justifyContent: "center", fontFamily: font }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0 22px", transform: `translateY(${(1 - enter) * 60}px)`, opacity: enter }}>
        {words.map((w, i) => {
          const o = interpolate(frame, [i * 2, i * 2 + 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          return (
            <span key={i} style={{ color, fontSize: big ? 128 : 96, fontWeight: 800, lineHeight: 1.08, letterSpacing: -3, opacity: o }}>
              {w}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

export function ReelTextBeats({ brand, hook, beats, cta }: ReelProps) {
  const { fps } = useVideoConfig();
  let at = 0;
  const seq: { from: number; dur: number; text: string; bg: string; big?: boolean }[] = [];
  seq.push({ from: 0, dur: 2 * fps, text: hook, bg: brand.primary, big: true });
  at = 2 * fps;
  beats.forEach((b, i) => {
    const dur = Math.max(1, Math.round(b.seconds * fps));
    seq.push({ from: at, dur, text: b.text, bg: i % 2 ? brand.primary : brand.bg });
    at += dur;
  });
  seq.push({ from: at, dur: 3 * fps, text: cta, bg: brand.primary, big: true });
  return (
    <AbsoluteFill style={{ background: brand.bg }}>
      {seq.map((s, i) => (
        <Sequence key={i} from={s.from} durationInFrames={s.dur}>
          <Beat text={s.text} color="#FFFFFF" bg={s.bg} font={brand.font} big={s.big} />
        </Sequence>
      ))}
      <AbsoluteFill style={{ justifyContent: "flex-end", padding: "0 120px 110px", fontFamily: brand.font }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, color: "#FFFFFF", fontSize: 34, fontWeight: 700 }}>
          {brand.logo && <Img src={brand.logo} style={{ width: 56, height: 56, objectFit: "contain" }} />}
          {brand.handle}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
