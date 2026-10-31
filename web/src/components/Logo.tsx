import { projectBy, wordmark } from "@/lib/logo-paths";

// Geometry of the Bellman network mark, measured from the official logo.
export const MARK_VIEWBOX = "0 0 330 210";

export const nodes = {
  left: { x: 12, y: 118, hollow: true },
  top: { x: 178, y: 12, hollow: false },
  upper: { x: 94, y: 89, hollow: false },
  lower: { x: 94, y: 157, hollow: false },
  bottom: { x: 179, y: 197, hollow: false },
  right: { x: 235, y: 117, hollow: true },
  end: { x: 318, y: 118, hollow: true },
} as const;

export type NodeName = keyof typeof nodes;

export const edges: [NodeName, NodeName][] = [
  ["left", "right"],
  ["left", "top"],
  ["left", "upper"],
  ["upper", "top"],
  ["left", "lower"],
  ["top", "lower"],
  ["lower", "bottom"],
  ["top", "right"],
  ["bottom", "right"],
  ["right", "end"],
];

export function Mark({
  className,
  strokeWidth = 4,
  radius = 9,
  title,
}: {
  className?: string;
  strokeWidth?: number;
  radius?: number;
  title?: string;
}) {
  return (
    <svg
      viewBox={MARK_VIEWBOX}
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      <g stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" fill="none">
        {edges.map(([a, b]) => (
          <line key={`${a}-${b}`} x1={nodes[a].x} y1={nodes[a].y} x2={nodes[b].x} y2={nodes[b].y} />
        ))}
      </g>
      {Object.entries(nodes).map(([name, n]) => (
        <circle
          key={name}
          cx={n.x}
          cy={n.y}
          r={n.hollow ? radius + 1 : radius}
          fill={n.hollow ? "var(--mark-hollow, #fff)" : "currentColor"}
          stroke="currentColor"
          strokeWidth={n.hollow ? strokeWidth * 0.7 : 0}
        />
      ))}
    </svg>
  );
}

export function Wordmark({ className, title = "Bellman" }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox={wordmark.viewBox}
      className={className}
      role={title ? "img" : undefined}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <path d={wordmark.d} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}

export function ProjectBy({ className }: { className?: string }) {
  return (
    <svg viewBox={projectBy.viewBox} className={className} aria-hidden="true" focusable="false">
      <path d={projectBy.d} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}
