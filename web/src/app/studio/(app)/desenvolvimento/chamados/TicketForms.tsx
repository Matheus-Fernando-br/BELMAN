"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { FormMessage } from "@/components/studio/SubmitButton";
import { TICKET_KIND, TICKET_PRIORITY, TICKET_STATUS } from "@/lib/studio/ticket-labels";
import { deleteTicket, openTicket, ticketToBacklog, ticketUploadUrl, updateTicket, type TicketState } from "./actions";

const MAX = 2;
const MAX_MB = 5;

/** Formulário "Abrir chamado": sistema, tipo, título, descrição e até 2 imagens. */
export function OpenTicketForm({ entities, defaultEntity }: { entities: { id: string; name: string }[]; defaultEntity?: string }) {
  const router = useRouter();
  const [state, setState] = useState<TicketState>();
  const [busy, start] = useTransition();
  // cada imagem escolhida guarda o arquivo e uma prévia local (blob:), liberada ao remover
  const [picked, setPicked] = useState<{ file: File; url: string }[]>([]);
  const files = picked.map((p) => p.file);
  const form = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const latest = useRef(picked);
  useEffect(() => {
    latest.current = picked;
  }, [picked]);
  useEffect(() => () => latest.current.forEach((p) => URL.revokeObjectURL(p.url)), []);
  const clear = () => {
    picked.forEach((p) => URL.revokeObjectURL(p.url));
    setPicked([]);
  };

  const pick = (list: FileList | null) => {
    const chosen = Array.from(list ?? []).filter((f) => f.type.startsWith("image/"));
    const room = chosen.slice(0, MAX - picked.length);
    if (room.some((f) => f.size > MAX_MB * 1048576)) return setState({ error: `Cada imagem pode ter até ${MAX_MB} MB.` });
    setState(undefined);
    setPicked([...picked, ...room.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
    if (input.current) input.current.value = "";
  };

  const submit = (fd: FormData) =>
    start(async () => {
      try {
        const sent = [];
        for (const f of files) {
          const ext = (f.name.split(".").pop() || f.type.split("/")[1] || "").toLowerCase();
          const { path, url } = await ticketUploadUrl(ext);
          const res = await fetch(url, { method: "PUT", headers: { "content-type": f.type, "x-upsert": "true" }, body: f });
          if (!res.ok) throw new Error("Falha ao enviar a imagem.");
          sent.push({ path, name: f.name, mime: f.type, bytes: f.size });
        }
        const r = await openTicket({
          entityId: String(fd.get("entity") ?? ""),
          kind: String(fd.get("kind") ?? ""),
          title: String(fd.get("title") ?? ""),
          description: String(fd.get("description") ?? ""),
          files: sent,
        });
        setState(r);
        if (!r?.error) {
          form.current?.reset();
          clear();
          router.refresh();
        }
      } catch (e) {
        setState({ error: (e as Error).message || "Não foi possível abrir o chamado." });
      }
    });

  return (
    <form ref={form} action={submit} className="st-form">
      <div className="st-row">
        <div className="st-field">
          <label htmlFor="tk-entity">Sobre qual sistema?</label>
          <select id="tk-entity" name="entity" className="st-input" defaultValue={defaultEntity ?? entities[0]?.id}>
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
        <div className="st-field">
          <label htmlFor="tk-kind">Tipo</label>
          <select id="tk-kind" name="kind" className="st-input" defaultValue="melhoria">
            {TICKET_KIND.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="st-field">
        <label htmlFor="tk-title">Título</label>
        <input id="tk-title" name="title" className="st-input" required minLength={3} maxLength={140} placeholder="Ex.: Poder filtrar lançamentos por cliente" />
      </div>
      <div className="st-field">
        <label htmlFor="tk-desc">Descreva a ideia ou o problema</label>
        <textarea id="tk-desc" name="description" className="st-input" rows={5} maxLength={5000} placeholder="O que acontece hoje, o que você gostaria que acontecesse e onde fica no sistema." />
      </div>
      <div className="st-field">
        <span className="st-label">Imagens (opcional, até {MAX})</span>
        <div className="st-drop">
          {picked.map((p, i) => (
            <figure key={p.url} className="st-drop-item">
              {/* eslint-disable-next-line @next/next/no-img-element -- prévia local (blob:) */}
              <img src={p.url} alt={`Imagem ${i + 1}`} />
              <button
                type="button"
                className="st-drop-remove"
                onClick={() => {
                  URL.revokeObjectURL(p.url);
                  setPicked(picked.filter((_, j) => j !== i));
                }}
                aria-label={`Remover imagem ${i + 1}`}
              >
                ×
              </button>
            </figure>
          ))}
          {picked.length < MAX && (
            <label className="st-drop-add">
              <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple onChange={(e) => pick(e.target.files)} className="visually-hidden" />
              <span aria-hidden="true">+</span>
              Adicionar imagem
              <small>PNG, JPG ou WebP · até {MAX_MB} MB</small>
            </label>
          )}
        </div>
        <span className="st-hint">Print da tela ajuda muito. As imagens são apagadas quando o chamado é fechado.</span>
      </div>
      <FormMessage state={state} />
      <div className="st-actions">
        <button type="submit" className="st-btn" disabled={busy} aria-disabled={busy}>
          {busy ? "Enviando…" : "Abrir chamado"}
        </button>
      </div>
    </form>
  );
}

/** Painel de quem trata (Sócio/Admin): situação, prioridade, resposta, Backlog e excluir. */
export function TicketAdminPanel({ id, status, priority, answer, backlogId, hasFiles }: { id: string; status: string; priority: string | null; answer: string | null; backlogId: string | null; hasFiles: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<TicketState>();
  const [busy, start] = useTransition();
  const [st, setSt] = useState(status);
  const run = (fn: () => Promise<TicketState>, after?: (r: TicketState) => void) =>
    start(async () => {
      const r = await fn();
      setState(r);
      if (!r?.error) {
        after?.(r);
        router.refresh();
      }
    });
  const closing = st === "concluido" || st === "recusado";
  return (
    <form
      className="st-form"
      action={(fd) => run(() => updateTicket(id, { status: st, priority: String(fd.get("priority") ?? ""), answer: String(fd.get("answer") ?? "") }))}
    >
      <div className="st-field">
        <span className="st-label">Situação</span>
        <div className="st-actions" role="radiogroup" aria-label="Situação">
          {TICKET_STATUS.map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={st === v} className="st-tag" aria-current={st === v ? "true" : undefined} onClick={() => setSt(v)} style={{ cursor: "pointer" }}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="st-field">
        <label htmlFor="tk-prio">Prioridade</label>
        <select id="tk-prio" name="priority" className="st-input" defaultValue={priority ?? ""}>
          <option value="">—</option>
          {TICKET_PRIORITY.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <div className="st-field">
        <label htmlFor="tk-answer">Resposta para quem abriu</label>
        <textarea id="tk-answer" name="answer" className="st-input" rows={4} maxLength={3000} defaultValue={answer ?? ""} placeholder="O que foi decidido ou feito." />
      </div>
      {closing && hasFiles && <p className="st-hint">Ao salvar como fechado, as imagens deste chamado serão apagadas.</p>}
      <FormMessage state={state} />
      <div className="st-actions">
        <button type="submit" className="st-btn" disabled={busy}>
          {busy ? "Salvando…" : "Salvar"}
        </button>
        {backlogId ? (
          <Link className="st-btn" data-variant="ghost" href={`/studio/desenvolvimento/backlog/${backlogId}`}>
            Ver no Backlog
          </Link>
        ) : (
          <button type="button" className="st-btn" data-variant="ghost" disabled={busy} onClick={() => run(() => ticketToBacklog(id))}>
            Enviar para o Backlog
          </button>
        )}
        <button
          type="button"
          className="st-btn"
          data-variant="danger"
          disabled={busy}
          onClick={() => confirm("Excluir este chamado e as imagens dele?") && run(() => deleteTicket(id), () => router.push("/studio/desenvolvimento/chamados?ver=fila"))}
        >
          Excluir
        </button>
      </div>
    </form>
  );
}
