import { ImageResponse } from "next/og";
import { edges, nodes } from "@/components/Logo";
import { wordmark } from "@/lib/logo-paths";

export const alt = "Bellman — Technology meets business.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 96px",
          background: "#000000",
          color: "#ffffff",
        }}
      >
        <svg width="380" height="242" viewBox="0 0 330 210">
          {edges.map(([a, b]) => (
            <line
              key={`${a}-${b}`}
              x1={nodes[a].x}
              y1={nodes[a].y}
              x2={nodes[b].x}
              y2={nodes[b].y}
              stroke="#ffffff"
              strokeWidth="2.5"
            />
          ))}
          {Object.entries(nodes).map(([name, n]) => (
            <circle
              key={name}
              cx={n.x}
              cy={n.y}
              r={n.hollow ? 10 : 9}
              fill={n.hollow ? "#000000" : "#ffffff"}
              stroke="#ffffff"
              strokeWidth={n.hollow ? 2.5 : 0}
            />
          ))}
        </svg>
        <div style={{ width: 2, height: 260, background: "#333333", display: "flex" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 64, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2 }}>
            <span>Technology</span>
            <span>meets business.</span>
          </div>
          <svg width="260" height="56" viewBox={wordmark.viewBox}>
            <path d={wordmark.d} fill="#ffffff" fillRule="evenodd" />
          </svg>
        </div>
      </div>
    ),
    size,
  );
}
