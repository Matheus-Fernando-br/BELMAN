import { Composition, type CalculateMetadataFunction } from "remotion";
import { ReelTextBeats, type ReelProps } from "./ReelTextBeats";
import { ScreenDemo, type ScreenProps } from "./ScreenDemo";
import { YoutubeSlate, type SlateProps } from "./YoutubeSlate";

const FPS = 30;

const reelMeta: CalculateMetadataFunction<ReelProps> = ({ props }) => ({
  durationInFrames: Math.max(FPS * 5, Math.round(FPS * (2 + props.beats.reduce((s, b) => s + b.seconds, 0) + 3))),
});
const screenMeta: CalculateMetadataFunction<ScreenProps> = ({ props }) => ({ durationInFrames: Math.max(FPS * 3, Math.round((props.durationMs / 1000) * FPS)) });

const brand = { handle: "@marca", primary: "#C2570C", accent: "#F08A3C", bg: "#141110", font: "Inter", logo: null };

export function Root() {
  return (
    <>
      <Composition
        id="reel-textBeats"
        component={ReelTextBeats}
        width={1080}
        height={1920}
        fps={FPS}
        durationInFrames={300}
        defaultProps={{ brand, hook: "Gancho", beats: [{ text: "Texto", seconds: 3 }], cta: "Link na bio" }}
        calculateMetadata={reelMeta}
      />
      <Composition
        id="reel-screenDemo"
        component={ScreenDemo}
        width={1080}
        height={1920}
        fps={FPS}
        durationInFrames={300}
        defaultProps={{ brand, videoUrl: "", durationMs: 10000, captions: [], zoom: 1.08 }}
        calculateMetadata={screenMeta}
      />
      <Composition id="youtube-intro" component={YoutubeSlate} width={1920} height={1080} fps={FPS} durationInFrames={FPS * 5} defaultProps={{ brand, title: "Título", subtitle: "", kind: "intro" as const }} />
      <Composition id="youtube-outro" component={YoutubeSlate} width={1920} height={1080} fps={FPS} durationInFrames={FPS * 5} defaultProps={{ brand, title: "Obrigado", subtitle: "Inscreva-se", kind: "outro" as const }} />
    </>
  );
}
