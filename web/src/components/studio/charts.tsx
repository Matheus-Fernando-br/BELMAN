"use client";

import { useId, useRef, useState } from "react";
import { brl, compact } from "@/lib/studio/format";

export type Series = { label: string; color: string; values: number[]; dashed?: boolean };

const W = 560;
const H = 250;
const PAD = { top: 16, right: 84, bottom: 30, left: 64 };

function niceMax(max: number) {
  if (max <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(max)));
  const n = max / exp;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * exp;
}


function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="st-legend" role="list">
      {series.map((s) => (
        <li key={s.label}>
          <span
            className="st-swatch"
            style={
              s.dashed
                ? { background: `repeating-linear-gradient(90deg, ${s.color} 0 4px, transparent 4px 6px)`, height: 3 }
                : { background: s.color }
            }
          />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

function DataTable({ caption, labels, series, money }: { caption: string; labels: string[]; series: Series[]; money: boolean }) {
  return (
    <details className="st-table-toggle">
      <summary>Ver tabela</summary>
      <div className="st-table-wrap" style={{ marginTop: "0.5rem" }}>
        <table className="st-table">
          <caption className="visually-hidden">{caption}</caption>
          <thead>
            <tr>
              <th scope="col">Mês</th>
              {series.map((s) => (
                <th key={s.label} scope="col">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {labels.map((l, i) => (
              <tr key={l}>
                <th scope="row">{l}</th>
                {series.map((s) => (
                  <td key={s.label} className="st-num">
                    {money ? brl(s.values[i]) : s.values[i].toLocaleString("pt-BR")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function Tooltip({ x, y, title, rows, money }: { x: number; y: number; title: string; rows: { label: string; color: string; value: number }[]; money: boolean }) {
  return (
    <div className="st-tip" style={{ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` }} role="presentation">
      <strong>{title}</strong>
      {rows.map((r) => (
        <span key={r.label}>
          <i style={{ background: r.color }} />
          {r.label}
          <b>{money ? brl(r.value) : r.value.toLocaleString("pt-BR")}</b>
        </span>
      ))}
    </div>
  );
}

function useHover(count: number, banded = false) {
  const ref = useRef<SVGSVGElement>(null);
  const [index, setIndex] = useState<number | null>(null);
  const onMove = (event: React.PointerEvent) => {
    const svg = ref.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * W;
    const inner = W - PAD.left - PAD.right;
    const i = banded ? Math.floor(((x - PAD.left) / inner) * count) : Math.round((x - PAD.left) / (inner / Math.max(1, count - 1)));
    setIndex(Math.min(count - 1, Math.max(0, i)));
  };
  return { ref, index, setIndex, onMove };
}

function YAxis({ max, money }: { max: number; money: boolean }) {
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const y = (v: number) => PAD.top + (H - PAD.top - PAD.bottom) * (1 - v / max);
  return (
    <g className="st-axis">
      {ticks.map((t) => (
        <g key={t}>
          <line className="st-gridline" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
          <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end">
            {compact(t, money)}
          </text>
        </g>
      ))}
    </g>
  );
}

/** Multi-series line chart with crosshair tooltip and end labels. */
export function LineChart({ title, labels, series, money = true }: { title: string; labels: string[]; series: Series[]; money?: boolean }) {
  const id = useId();
  const max = money ? niceMax(Math.max(...series.flatMap((s) => s.values)) * 1.08) : Math.max(4, niceMax(Math.max(...series.flatMap((s) => s.values)) * 1.08));
  const { ref, index, setIndex, onMove } = useHover(labels.length);
  const x = (i: number) => PAD.left + ((W - PAD.left - PAD.right) * i) / Math.max(1, labels.length - 1);
  const y = (v: number) => PAD.top + (H - PAD.top - PAD.bottom) * (1 - v / max);
  const last = labels.length - 1;

  // End labels, nudged apart when they would overlap.
  const ends = series
    .map((s) => ({ s, y: y(s.values[last]) }))
    .sort((a, b) => a.y - b.y)
    .reduce<{ s: Series; y: number }[]>((acc, cur) => {
      const prev = acc[acc.length - 1];
      acc.push({ ...cur, y: prev && cur.y - prev.y < 14 ? prev.y + 14 : cur.y });
      return acc;
    }, []);

  return (
    <figure className="st-chart" aria-labelledby={`${id}-t`} style={{ margin: 0, display: "grid", gap: "0.6rem" }}>
      <figcaption id={`${id}-t`} className="visually-hidden">
        {title}
      </figcaption>
      <Legend series={series} />
      <div style={{ position: "relative" }}>
        <svg
          ref={ref}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`${title}. Use “Ver tabela” para os valores.`}
          onPointerMove={onMove}
          onPointerLeave={() => setIndex(null)}
        >
          <YAxis max={max} money={money} />
          <g className="st-axis">
            {labels.map((l, i) => (
              <text key={l} x={x(i)} y={H - 8} textAnchor="middle">
                {l}
              </text>
            ))}
          </g>
          {index !== null && <line x1={x(index)} x2={x(index)} y1={PAD.top} y2={H - PAD.bottom} stroke="#bdbdbd" strokeWidth="1" />}
          {series.map((s) => (
            <g key={s.label}>
              <polyline
                fill="none"
                stroke={s.color}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
                strokeDasharray={s.dashed ? "5 4" : undefined}
                points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
              />
              <circle cx={x(last)} cy={y(s.values[last])} r="4.5" fill={s.color} stroke="#fff" strokeWidth="2" />
              {index !== null && <circle cx={x(index)} cy={y(s.values[index])} r="4.5" fill={s.color} stroke="#fff" strokeWidth="2" />}
            </g>
          ))}
          {ends.map(({ s, y: ly }) => (
            <text key={s.label} x={x(last) + 10} y={ly + 4} fontSize="13" fill="#1b1b1b" fontWeight="600">
              {compact(s.values[last], money)}
            </text>
          ))}
          <rect x={PAD.left} y={PAD.top} width={W - PAD.left - PAD.right} height={H - PAD.top - PAD.bottom} fill="transparent" />
        </svg>
        {index !== null && (
          <Tooltip
            x={x(index)}
            y={Math.min(...series.map((s) => y(s.values[index])))}
            title={labels[index]}
            rows={series.map((s) => ({ label: s.label, color: s.color, value: s.values[index] }))}
            money={money}
          />
        )}
      </div>
      <DataTable caption={title} labels={labels} series={series} money={money} />
    </figure>
  );
}

/** Stacked columns (one stack per month) with a 2px surface gap between segments. */
export function StackedColumns({ title, labels, series, money = true }: { title: string; labels: string[]; series: Series[]; money?: boolean }) {
  const id = useId();
  const totals = labels.map((_, i) => series.reduce((sum, s) => sum + s.values[i], 0));
  const max = money ? niceMax(Math.max(...totals) * 1.12) : Math.max(4, niceMax(Math.max(...totals) * 1.12));
  const { ref, index, setIndex, onMove } = useHover(labels.length, true);
  const band = (W - PAD.left - PAD.right) / labels.length;
  const x = (i: number) => PAD.left + band * (i + 0.5);
  const scale = (v: number) => ((H - PAD.top - PAD.bottom) * v) / max;
  const barW = 24;
  const base = H - PAD.bottom;

  return (
    <figure className="st-chart" aria-labelledby={`${id}-t`} style={{ margin: 0, display: "grid", gap: "0.6rem" }}>
      <figcaption id={`${id}-t`} className="visually-hidden">
        {title}
      </figcaption>
      <Legend series={series} />
      <div style={{ position: "relative" }}>
        <svg
          ref={ref}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`${title}. Use “Ver tabela” para os valores.`}
          onPointerMove={onMove}
          onPointerLeave={() => setIndex(null)}
        >
          <YAxis max={max} money={money} />
          <g className="st-axis">
            {labels.map((l, i) => (
              <text key={l} x={x(i)} y={H - 8} textAnchor="middle">
                {l}
              </text>
            ))}
          </g>
          {labels.map((l, i) => {
            let top = base;
            const visible = series.filter((s) => s.values[i] > 0);
            return (
              <g key={l} opacity={index === null || index === i ? 1 : 0.45}>
                {visible.map((s, k) => {
                  const h = Math.max(0, scale(s.values[i]) - (k > 0 ? 2 : 0));
                  top -= h + (k > 0 ? 2 : 0);
                  const isTop = k === visible.length - 1;
                  const r = isTop ? Math.min(4, h) : 0;
                  const x0 = x(i) - barW / 2;
                  const d = `M${x0},${top + h} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + barW - r} Q${x0 + barW},${top} ${x0 + barW},${top + r} V${top + h} Z`;
                  return <path key={s.label} d={d} fill={s.color} />;
                })}
                {i === labels.length - 1 && (
                  <text x={x(i)} y={base - scale(totals[i]) - 8} textAnchor="middle" fontSize="13" fontWeight="600" fill="#1b1b1b">
                    {compact(totals[i], money)}
                  </text>
                )}
              </g>
            );
          })}
          <rect x={PAD.left} y={PAD.top} width={W - PAD.left - PAD.right} height={H - PAD.top - PAD.bottom} fill="transparent" />
        </svg>
        {index !== null && (
          <Tooltip
            x={x(index)}
            y={base - scale(totals[index])}
            title={`${labels[index]} · ${money ? brl(totals[index]) : totals[index]}`}
            rows={series.map((s) => ({ label: s.label, color: s.color, value: s.values[index] }))}
            money={money}
          />
        )}
      </div>
      <DataTable caption={title} labels={labels} series={series} money={money} />
    </figure>
  );
}
