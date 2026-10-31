"use client";

import { useEffect, useRef } from "react";
import { edges, MARK_VIEWBOX, nodes, type NodeName } from "./Logo";
import styles from "./NetworkMark.module.css";

// Build order of the logo animation (same rhythm as the brand video):
// nodes appear one by one, then the connections are drawn between them.
const nodeOrder: NodeName[] = ["left", "upper", "lower", "top", "bottom", "right", "end"];

// Extra faint connections that sketch the "network" around the mark.
const ghost: [number, number, number, number][] = [
  [12, 118, 179, 197],
  [94, 89, 235, 117],
  [94, 157, 235, 117],
  [178, 12, 318, 118],
];

export function NetworkMark({ className, interactive = true }: { className?: string; interactive?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !interactive) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;

    let frame = 0;
    const onMove = (event: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        const x = (event.clientX - (rect.left + rect.width / 2)) / window.innerWidth;
        const y = (event.clientY - (rect.top + rect.height / 2)) / window.innerHeight;
        el.style.setProperty("--tilt-x", `${(-y * 10).toFixed(2)}deg`);
        el.style.setProperty("--tilt-y", `${(x * 14).toFixed(2)}deg`);
        el.style.setProperty("--shift-x", `${(x * 18).toFixed(1)}px`);
        el.style.setProperty("--shift-y", `${(y * 18).toFixed(1)}px`);
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
    };
  }, [interactive]);

  return (
    <div ref={ref} className={`${styles.wrap} ${className ?? ""}`} aria-hidden="true">
      <svg viewBox={MARK_VIEWBOX} className={styles.svg} overflow="visible" focusable="false">
        <g className={styles.ghost}>
          {ghost.map(([x1, y1, x2, y2], i) => (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} pathLength={1} style={{ "--i": i } as React.CSSProperties} />
          ))}
        </g>
        <g className={styles.edges}>
          {edges.map(([a, b], i) => (
            <line
              key={`${a}-${b}`}
              x1={nodes[a].x}
              y1={nodes[a].y}
              x2={nodes[b].x}
              y2={nodes[b].y}
              pathLength={1}
              style={{ "--i": i } as React.CSSProperties}
            />
          ))}
        </g>
        <g className={styles.pulses}>
          {edges.slice(0, 4).map(([a, b], i) => (
            <circle key={`p-${a}-${b}`} r="3" style={{ "--i": i } as React.CSSProperties}>
              <animateMotion
                dur={`${3.2 + i * 0.7}s`}
                begin={`${2.6 + i * 0.5}s`}
                repeatCount="indefinite"
                path={`M${nodes[a].x},${nodes[a].y} L${nodes[b].x},${nodes[b].y}`}
              />
            </circle>
          ))}
        </g>
        <g className={styles.nodes}>
          {nodeOrder.map((name, i) => {
            const n = nodes[name];
            return (
              <g key={name} className={styles.node} style={{ "--i": i } as React.CSSProperties}>
                {!n.hollow && <circle cx={n.x} cy={n.y} r="16" className={styles.halo} />}
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={n.hollow ? 10 : 9}
                  className={n.hollow ? styles.hollow : styles.filled}
                />
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
