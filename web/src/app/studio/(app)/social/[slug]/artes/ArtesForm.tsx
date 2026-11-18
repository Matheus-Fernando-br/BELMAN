"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { FORMATOS, ICONES, MODELOS, type Campo, type FormatoArte, type ModeloId } from "@shared/social-templates/obra-facil-modelos";
import { gerarArteAction, type ArteResult } from "./actions";

type Valores = Record<string, string | boolean>;
const padroes = (id: ModeloId): Valores => Object.fromEntries(MODELOS.find((m) => m.id === id)!.campos.map((c) => [c.id, c.padrao]));

/** Reduz a foto a 1440 px (lado maior) em JPEG, no navegador, antes de enviar. */
async function reduzirFoto(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, erro) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => erro(new Error("Não foi possível abrir a imagem."));
      i.src = url;
    });
    const escala = Math.min(1, 1440 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * escala);
    canvas.height = Math.round(img.naturalHeight * escala);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.88);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function CampoInput({ campo, valor, onChange }: { campo: Campo; valor: string | boolean; onChange: (v: string | boolean) => void }) {
  const id = `arte-${campo.id}`;
  if (campo.tipo === "sim-nao")
    return (
      <label className="st-check">
        <input type="checkbox" checked={Boolean(valor)} onChange={(e) => onChange(e.target.checked)} /> {campo.rotulo}
      </label>
    );
  return (
    <div className="st-field">
      <label htmlFor={id}>{campo.rotulo}</label>
      {campo.tipo === "texto-longo" ? (
        <textarea id={id} className="st-input" rows={3} maxLength={400} value={String(valor)} onChange={(e) => onChange(e.target.value)} />
      ) : campo.tipo === "texto" ? (
        <input id={id} className="st-input" maxLength={120} value={String(valor)} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <select id={id} className="st-input" value={String(valor)} onChange={(e) => onChange(e.target.value)}>
          {Object.entries<string>(campo.tipo === "icone" ? ICONES : campo.tipo === "opcoes" ? campo.opcoes : {}).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

export function ArtesForm({ slug }: { slug: string }) {
  const [modelo, setModelo] = useState<ModeloId>("icone");
  const [formato, setFormato] = useState<FormatoArte>("quadrado");
  const [valores, setValores] = useState<Valores>(() => padroes("icone"));
  const [foto, setFoto] = useState<string | null>(null);
  const [fotoErro, setFotoErro] = useState("");
  const [arte, setArte] = useState<ArteResult | null>(null);
  const [gerando, startTransition] = useTransition();
  const ultimo = useRef(0);
  const info = useMemo(() => MODELOS.find((m) => m.id === modelo)!, [modelo]);

  // Prévia automática: espera a pessoa parar de digitar (0,7 s) e descarta respostas antigas.
  useEffect(() => {
    const n = ++ultimo.current;
    const t = setTimeout(() => {
      startTransition(async () => {
        const r = await gerarArteAction(slug, { modelo, formato, campos: valores, foto: info.precisaFoto ? foto : null });
        if (n === ultimo.current) setArte(r);
      });
    }, 700);
    return () => clearTimeout(t);
  }, [slug, modelo, formato, valores, foto, info.precisaFoto]);

  const ok = arte && "png" in arte ? arte : null;
  const proporcao = `${FORMATOS[formato].largura} / ${FORMATOS[formato].altura}`;

  return (
    <div className="st-grid" data-cols="2">
      <article className="st-card">
        <h2>Modelo</h2>
        <div className="st-form">
          <fieldset className="st-field" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend>Escolha o modelo</legend>
            {MODELOS.map((m) => (
              <label key={m.id} className="st-check" style={{ alignItems: "flex-start" }}>
                <input
                  type="radio"
                  name="modelo"
                  value={m.id}
                  checked={modelo === m.id}
                  onChange={() => {
                    setModelo(m.id);
                    setValores(padroes(m.id));
                  }}
                />
                <span>
                  <strong>{m.nome}</strong>
                  <br />
                  <small style={{ color: "var(--st-muted)" }}>{m.descricao}</small>
                </span>
              </label>
            ))}
          </fieldset>
          <div className="st-field">
            <label htmlFor="arte-formato">Formato</label>
            <select id="arte-formato" className="st-input" value={formato} onChange={(e) => setFormato(e.target.value as FormatoArte)}>
              {Object.entries(FORMATOS).map(([k, f]) => (
                <option key={k} value={k}>
                  {f.nome}
                </option>
              ))}
            </select>
          </div>
          {info.precisaFoto && (
            <div className="st-field">
              <label htmlFor="arte-foto">Foto</label>
              <input
                id="arte-foto"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="st-input"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  setFotoErro("");
                  if (!f) return setFoto(null);
                  if (f.size > 25 * 1024 * 1024) return setFotoErro("Imagem acima de 25 MB.");
                  try {
                    setFoto(await reduzirFoto(f));
                  } catch (err) {
                    setFotoErro((err as Error).message);
                  }
                }}
              />
              <span className="st-hint">A foto fica só nesta arte; nada é salvo no servidor.</span>
              {fotoErro && (
                <p className="st-alert" role="alert">
                  {fotoErro}
                </p>
              )}
            </div>
          )}
          {info.campos.map((c) => (
            <CampoInput key={`${modelo}-${c.id}`} campo={c} valor={valores[c.id] ?? c.padrao} onChange={(v) => setValores((x) => ({ ...x, [c.id]: v }))} />
          ))}
        </div>
      </article>

      <article className="st-card" style={{ alignSelf: "start", position: "sticky", top: "1rem" }}>
        <div className="st-card-head">
          <h2>Prévia</h2>
          <span aria-live="polite">{gerando ? "Gerando…" : ok ? `${ok.width}×${ok.height}` : ""}</span>
        </div>
        <div style={{ width: "100%", maxWidth: formato === "story" ? 340 : 480, margin: "0 auto", aspectRatio: proporcao, borderRadius: 12, overflow: "hidden", background: "#eee", opacity: gerando ? 0.6 : 1, transition: "opacity 160ms" }}>
          {ok && (
            // eslint-disable-next-line @next/next/no-img-element -- PNG gerado na hora (data URL)
            <img src={ok.png} alt={`Prévia da arte: ${info.nome}`} style={{ width: "100%", height: "100%", display: "block" }} />
          )}
        </div>
        {arte && "error" in arte && (
          <p className="st-alert" role="alert">
            {arte.error}
          </p>
        )}
        <div className="st-actions" style={{ marginTop: "1rem" }}>
          {ok ? (
            <a className="st-btn" href={ok.png} download={`obra-facil-${ok.name}.png`}>
              Baixar PNG
            </a>
          ) : (
            <button type="button" className="st-btn" disabled aria-disabled>
              Baixar PNG
            </button>
          )}
        </div>
      </article>
    </div>
  );
}
