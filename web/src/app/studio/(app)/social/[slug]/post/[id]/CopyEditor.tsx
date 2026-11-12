"use client";

import { useState } from "react";
import { COPY_LABELS } from "@shared/social/copy";

type J = string | number | boolean | null | J[] | { [k: string]: J };

const lbl = (k: string) => COPY_LABELS[k] ?? k;
// ordem de leitura (o banco devolve as chaves do JSON em outra ordem)
const ORDER = ["carousel", "post", "reel", "story", "youtube", "cover", "kicker", "title", "subtitle", "hook", "number", "body", "items", "on_screen_text", "voiceover", "seconds", "text", "sticker_suggestion", "slides", "beats", "frames", "recap", "description", "chapters", "time", "label", "tags", "thumbnail_text", "script", "cta", "first_line", "keywords"];
const sorted = (o: Record<string, J>) => Object.entries(o).sort(([a], [b]) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99));

/** Editor genérico do texto estruturado: cada campo de texto vira um input; listas de texto, linhas. */
export function CopyEditor({ initial }: { initial: Record<string, J> }) {
  const [copy, setCopy] = useState<Record<string, J>>(initial);
  const set = (path: (string | number)[], value: J) => {
    setCopy((prev) => {
      const next = structuredClone(prev) as Record<string, J>;
      let cur: J = next;
      for (const p of path.slice(0, -1)) cur = (cur as Record<string, J>)[p as string];
      (cur as Record<string, J>)[path.at(-1) as string] = value;
      return next;
    });
  };
  const render = (value: J, path: (string | number)[], key: string): React.ReactNode => {
    const id = `cp-${path.join("-")}`;
    if (value === null || typeof value === "boolean") return null;
    if (typeof value === "number")
      return (
        <div className="st-field" key={id}>
          <label htmlFor={id}>{lbl(key)}</label>
          <input id={id} type="number" className="st-input" value={value} onChange={(e) => set(path, Number(e.target.value))} />
        </div>
      );
    if (typeof value === "string") {
      if (key === "kind") return null;
      const long = value.length > 70 || ["body", "description", "script", "voiceover"].includes(key);
      return (
        <div className="st-field" key={id}>
          <label htmlFor={id}>{lbl(key)}</label>
          {long ? (
            <textarea id={id} rows={Math.min(8, Math.ceil(value.length / 60) + 1)} className="st-input" value={value} onChange={(e) => set(path, e.target.value)} />
          ) : (
            <input id={id} className="st-input" value={value} onChange={(e) => set(path, e.target.value)} />
          )}
        </div>
      );
    }
    if (Array.isArray(value)) {
      if (value.every((v) => typeof v === "string"))
        return (
          <div className="st-field" key={id}>
            <label htmlFor={id}>{lbl(key)}</label>
            <textarea
              id={id}
              rows={Math.max(2, value.length)}
              className="st-input"
              value={(value as string[]).join("\n")}
              onChange={(e) => set(path, e.target.value.split("\n"))}
            />
          </div>
        );
      return (
        <fieldset key={id} className="st-form" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 700 }}>{lbl(key)}</legend>
          {value.map((item, i) => (
            <details key={i} className="st-card" style={{ padding: "0.7rem" }} open={value.length <= 3}>
              <summary style={{ cursor: "pointer", fontWeight: 600 }}>
                {i + 1}. {typeof item === "object" && item && !Array.isArray(item) ? String((item as Record<string, J>).title ?? (item as Record<string, J>).on_screen_text ?? (item as Record<string, J>).text ?? (item as Record<string, J>).label ?? "") : ""}
              </summary>
              <div className="st-form" style={{ marginTop: "0.5rem" }}>
                {typeof item === "object" && item && !Array.isArray(item) ? sorted(item as Record<string, J>).map(([k, v]) => render(v, [...path, i, k], k)) : render(item, [...path, i], key)}
              </div>
            </details>
          ))}
        </fieldset>
      );
    }
    return (
      <fieldset key={id} className="st-form" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 700 }}>{lbl(key)}</legend>
        {sorted(value as Record<string, J>).map(([k, v]) => render(v, [...path, k], k))}
      </fieldset>
    );
  };
  // limpa linhas vazias de listas de texto antes de enviar
  const clean = (v: J): J => (Array.isArray(v) ? (v.every((x) => typeof x === "string") ? (v as string[]).map((s) => s.trim()).filter(Boolean) : v.map(clean)) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clean(x)])) : v);
  return (
    <>
      <input type="hidden" name="copy" value={JSON.stringify(clean(copy))} />
      {sorted(copy).map(([k, v]) => render(v, [k], k))}
    </>
  );
}
