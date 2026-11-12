"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { FormMessage, SubmitButton } from "@/components/studio/SubmitButton";

type State = { error?: string; message?: string } | undefined;

/** Formulário com mensagem de retorno para ações já "amarradas" (bind) no servidor. */
export function StateForm({
  action,
  children,
  submit,
  pending = "Aguarde…",
  variant,
  inline,
}: {
  action: (s: State, f: FormData) => Promise<State>;
  children?: React.ReactNode;
  submit: string;
  pending?: string;
  variant?: "ghost" | "danger";
  inline?: boolean;
}) {
  const [state, run] = useActionState(action, undefined);
  return (
    <form action={run} className={inline ? "st-actions" : "st-form"} noValidate>
      {children}
      <FormMessage state={state} />
      <div className="st-actions">
        <SubmitButton pendingLabel={pending} variant={variant}>
          {submit}
        </SubmitButton>
      </div>
    </form>
  );
}

/** Atualiza a página enquanto o worker trabalha (gerando/renderizando/publicando). */
export function AutoRefresh({ active, every = 4000 }: { active: boolean; every?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), every);
    return () => clearInterval(t);
  }, [active, every, router]);
  return null;
}

export function CopyButton({ text, label = "Copiar" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="st-btn"
      data-variant="ghost"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? "Copiado" : label}
    </button>
  );
}

/** Campo de texto com contagem de caracteres (conta emoji como 1). */
export function CountedText({ name, max, defaultValue, rows = 3, id, label }: { name: string; max: number; defaultValue?: string | null; rows?: number; id: string; label: string }) {
  const [value, setValue] = useState(defaultValue ?? "");
  const n = [...value].length;
  return (
    <div className="st-field">
      <label htmlFor={id}>{label}</label>
      {rows > 1 ? (
        <textarea id={id} name={name} rows={rows} className="st-input" value={value} onChange={(e) => setValue(e.target.value)} />
      ) : (
        <input id={id} name={name} className="st-input" value={value} onChange={(e) => setValue(e.target.value)} />
      )}
      <span className="st-hint" style={{ color: n > max ? "var(--st-bad)" : undefined }} aria-live="polite">
        {n}/{max}
      </span>
    </div>
  );
}

/** Envio direto ao Storage por URL assinada (o arquivo não passa pela Vercel). */
export function Uploader({
  accept,
  label,
  getUrl,
  onUploaded,
  maxMb = 200,
  preview,
}: {
  accept: string;
  label: string;
  getUrl: (ext: string) => Promise<{ path: string; url: string }>;
  onUploaded: (path: string) => Promise<State>;
  maxMb?: number;
  preview?: "circle";
}) {
  const [state, setState] = useState<State>();
  const [busy, startTransition] = useTransition();
  const [local, setLocal] = useState<string | null>(null);
  const [small, setSmall] = useState<boolean | null>(null);
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="st-form">
      <div className="st-field">
        <label htmlFor={`up-${label}`}>{label}</label>
        <input
          id={`up-${label}`}
          ref={input}
          type="file"
          accept={accept}
          className="st-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            setState(undefined);
            if (local) URL.revokeObjectURL(local);
            setLocal(f && preview ? URL.createObjectURL(f) : null);
          }}
        />
      </div>
      {preview === "circle" && local && <CirclePreview src={local} onCheck={setSmall} />}
      {small === false && <p className="st-alert">A foto tem pouco contraste em 110 px: pode ficar ilegível na miniatura.</p>}
      {state && <FormMessage state={state} />}
      <div className="st-actions">
        <button
          type="button"
          className="st-btn"
          disabled={busy}
          aria-disabled={busy}
          onClick={() => {
            const f = input.current?.files?.[0];
            if (!f) return setState({ error: "Escolha um arquivo." });
            if (f.size > maxMb * 1024 * 1024) return setState({ error: `Arquivo acima de ${maxMb} MB.` });
            startTransition(async () => {
              try {
                const ext = (f.name.split(".").pop() || "").toLowerCase();
                const { path, url } = await getUrl(ext);
                const res = await fetch(url, { method: "PUT", headers: { "content-type": f.type || "application/octet-stream", "x-upsert": "true" }, body: f });
                if (!res.ok) throw new Error("Falha no envio.");
                setState(await onUploaded(path));
                router.refresh();
              } catch (err) {
                setState({ error: (err as Error).message || "Falha no envio." });
              }
            });
          }}
        >
          {busy ? "Enviando…" : "Enviar"}
        </button>
      </div>
    </div>
  );
}

/** Prévia em círculo em 110 px + checagem simples de legibilidade (contraste de luminância). */
export function CirclePreview({ src, onCheck }: { src: string; onCheck?: (ok: boolean) => void }) {
  return (
    <div className="st-actions" style={{ gap: "1rem" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Prévia da foto de perfil em 110 px"
        width={110}
        height={110}
        style={{ borderRadius: "50%", objectFit: "cover", border: "1px solid var(--st-line)" }}
        onLoad={(e) => {
          if (!onCheck) return;
          try {
            const c = document.createElement("canvas");
            c.width = c.height = 110;
            const g = c.getContext("2d");
            if (!g) return;
            g.drawImage(e.currentTarget, 0, 0, 110, 110);
            const d = g.getImageData(0, 0, 110, 110).data;
            let min = 255;
            let max = 0;
            for (let i = 0; i < d.length; i += 16) {
              const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
              min = Math.min(min, l);
              max = Math.max(max, l);
            }
            onCheck(max - min > 90);
          } catch {
            onCheck(true);
          }
        }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" width={40} height={40} style={{ borderRadius: "50%", objectFit: "cover" }} />
      <span className="st-hint">110 px (perfil) e 40 px (feed)</span>
    </div>
  );
}

/** Prévia no formato do feed: imagem 4:5 com slides navegáveis e legenda cortada no "… mais". */
export function FeedPreview({ images, video, username, caption, avatar }: { images: string[]; video?: string | null; username: string; caption: string; avatar?: string | null }) {
  const [i, setI] = useState(0);
  const [more, setMore] = useState(false);
  const short = caption.length > 125 && !more;
  return (
    <figure className="st-feed">
      <header>
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt="" width={32} height={32} />
        ) : (
          <span className="st-feed-avatar" aria-hidden="true" />
        )}
        <strong>{username}</strong>
      </header>
      <div className="st-feed-media">
        {video ? (
          <video src={video} controls playsInline preload="metadata" />
        ) : images.length ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={images[i]} alt={`Slide ${i + 1} de ${images.length}`} />
        ) : (
          <span className="st-hint">Sem mídia ainda</span>
        )}
        {images.length > 1 && !video && (
          <>
            <button type="button" className="st-feed-nav" data-dir="prev" onClick={() => setI((i - 1 + images.length) % images.length)} aria-label="Slide anterior">
              ‹
            </button>
            <button type="button" className="st-feed-nav" data-dir="next" onClick={() => setI((i + 1) % images.length)} aria-label="Próximo slide">
              ›
            </button>
            <span className="st-feed-count">
              {i + 1}/{images.length}
            </span>
          </>
        )}
      </div>
      <figcaption>
        <strong>{username}</strong> <span style={{ whiteSpace: "pre-wrap" }}>{short ? `${caption.slice(0, 125)}… ` : caption}</span>
        {short && (
          <button type="button" className="st-linkbtn" onClick={() => setMore(true)}>
            mais
          </button>
        )}
      </figcaption>
    </figure>
  );
}

/** Calendário: arrastar um post aprovado para outro dia mantém a hora e reagenda. */
export function DragCalendar({
  weeks,
  posts,
  canWrite,
  onMove,
  newHref,
}: {
  weeks: string[][];
  posts: { id: string; day: string; time: string; title: string; status: string; tone: string; href: string; movable: boolean }[];
  canWrite: boolean;
  onMove: (id: string, day: string, time: string) => Promise<State>;
  newHref: string;
}) {
  const [state, setState] = useState<State>();
  const [, start] = useTransition();
  const router = useRouter();
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  return (
    <>
      {state && <FormMessage state={state} />}
      <div className="st-cal" role="grid" aria-label="Calendário de posts">
        {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
          <div key={d} className="st-cal-head" role="columnheader">
            {d}
          </div>
        ))}
        {weeks.flat().map((day) => {
          const items = posts.filter((p) => p.day === day);
          return (
            <div
              key={day}
              role="gridcell"
              className="st-cal-day"
              data-today={day === today || undefined}
              data-past={day < today || undefined}
              onDragOver={(e) => canWrite && day >= today && e.preventDefault()}
              onDrop={(e) => {
                const [id, time] = e.dataTransfer.getData("text/plain").split("|");
                if (!id) return;
                start(async () => {
                  setState(await onMove(id, day, time));
                  router.refresh();
                });
              }}
            >
              <span className="st-cal-num">{Number(day.slice(8))}</span>
              {items.map((p) => (
                <a
                  key={p.id}
                  href={p.href}
                  className="st-cal-post"
                  data-tone={p.tone}
                  draggable={canWrite && p.movable}
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", `${p.id}|${p.time}`)}
                  title={p.movable ? "Arraste para outro dia para reagendar" : undefined}
                >
                  <b>{p.time}</b> {p.title}
                </a>
              ))}
              {canWrite && day >= today && !items.length && (
                <a className="st-cal-new" href={`${newHref}?dia=${day}`} aria-label={`Criar post em ${day}`}>
                  +
                </a>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
