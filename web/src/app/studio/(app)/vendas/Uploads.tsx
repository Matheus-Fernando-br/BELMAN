"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { FormMessage } from "@/components/studio/SubmitButton";
import type { Option } from "@/lib/studio/records";
import { attachDocumentFile, createMaterial, salesUploadUrl } from "./actions";

type State = { error?: string; message?: string } | undefined;
const MAX_MB = 50;

/** Envia o arquivo direto ao Storage pelo link assinado e devolve os dados dele. */
async function send(folder: "documentos" | "materiais", entityId: string, f: File) {
  const ext = (f.name.split(".").pop() || "").toLowerCase();
  const { path, url } = await salesUploadUrl(folder, entityId, ext);
  const res = await fetch(url, { method: "PUT", headers: { "content-type": f.type || "application/octet-stream", "x-upsert": "true" }, body: f });
  if (!res.ok) throw new Error("Falha no envio do arquivo.");
  return { path, name: f.name, mime: f.type, bytes: f.size };
}

function useUpload() {
  const [state, setState] = useState<State>();
  const [busy, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<State>) =>
    start(async () => {
      try {
        const r = await fn();
        setState(r);
        if (!r?.error) router.refresh();
      } catch (e) {
        setState({ error: (e as Error).message || "Falha no envio." });
      }
    });
  return { state, setState, busy, run };
}

export function DocumentFileUpload({ docId, entityId, hasFile }: { docId: string; entityId: string; hasFile: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const { state, setState, busy, run } = useUpload();
  return (
    <div className="st-form">
      <div className="st-field">
        <label htmlFor="doc-file">{hasFile ? "Trocar o arquivo" : "Anexar o arquivo (PDF, imagem, Word…)"}</label>
        <input id="doc-file" ref={input} type="file" className="st-input" />
        <span className="st-hint">Até {MAX_MB} MB. Fica guardado em área privada.</span>
      </div>
      <FormMessage state={state} />
      <div className="st-actions">
        <button
          type="button"
          className="st-btn"
          disabled={busy}
          aria-disabled={busy}
          onClick={() => {
            const f = input.current?.files?.[0];
            if (!f) return setState({ error: "Escolha um arquivo." });
            if (f.size > MAX_MB * 1048576) return setState({ error: `Arquivo acima de ${MAX_MB} MB.` });
            run(async () => attachDocumentFile(docId, await send("documentos", entityId, f)));
          }}
        >
          {busy ? "Enviando…" : "Enviar arquivo"}
        </button>
      </div>
    </div>
  );
}

export function MaterialUpload({
  entities,
  purposes,
  contacts,
  campaigns,
  defaultEntity,
  defaultContact,
}: {
  entities: Option[];
  purposes: readonly Option[];
  contacts: Option[];
  campaigns: Option[];
  defaultEntity?: string;
  defaultContact?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [entityId, setEntity] = useState(defaultEntity ?? entities[0]?.[0] ?? "");
  const [title, setTitle] = useState("");
  const [purpose, setPurpose] = useState("institucional");
  const [contactId, setContact] = useState(defaultContact ?? "");
  const [campaignId, setCampaign] = useState("");
  const [notes, setNotes] = useState("");
  const { state, setState, busy, run } = useUpload();
  return (
    <div className="st-form">
      <div className="st-field">
        <label htmlFor="mat-file">Arquivos (pode escolher vários)</label>
        <input id="mat-file" ref={input} type="file" multiple className="st-input" />
      </div>
      <div className="st-field">
        <label htmlFor="mat-title">Título (opcional: sem título, usa o nome do arquivo)</label>
        <input id="mat-title" className="st-input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="st-row">
        <div className="st-field">
          <label htmlFor="mat-entity">Empresa</label>
          <select id="mat-entity" className="st-input" value={entityId} onChange={(e) => setEntity(e.target.value)}>
            {entities.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div className="st-field">
          <label htmlFor="mat-purpose">Finalidade</label>
          <select id="mat-purpose" className="st-input" value={purpose} onChange={(e) => setPurpose(e.target.value)}>
            {purposes.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div className="st-field">
          <label htmlFor="mat-contact">Parceiro / contato (opcional)</label>
          <select id="mat-contact" className="st-input" value={contactId} onChange={(e) => setContact(e.target.value)}>
            <option value="">—</option>
            {contacts.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div className="st-field">
          <label htmlFor="mat-campaign">Campanha (opcional)</label>
          <select id="mat-campaign" className="st-input" value={campaignId} onChange={(e) => setCampaign(e.target.value)}>
            <option value="">—</option>
            {campaigns.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="st-field">
        <label htmlFor="mat-notes">Observações</label>
        <input id="mat-notes" className="st-input" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <FormMessage state={state} />
      <div className="st-actions">
        <button
          type="button"
          className="st-btn"
          disabled={busy}
          aria-disabled={busy}
          onClick={() => {
            const files = Array.from(input.current?.files ?? []);
            if (!files.length) return setState({ error: "Escolha pelo menos um arquivo." });
            if (files.some((f) => f.size > MAX_MB * 1048576)) return setState({ error: `Cada arquivo pode ter até ${MAX_MB} MB.` });
            run(async () => {
              let last: State;
              for (const f of files) {
                const file = await send("materiais", entityId, f);
                last = await createMaterial({ entityId, title: files.length > 1 ? "" : title, purpose, contactId: contactId || null, campaignId: campaignId || null, notes, file });
                if (last?.error) return last;
              }
              if (input.current) input.current.value = "";
              setTitle("");
              return { message: files.length > 1 ? `${files.length} materiais adicionados.` : "Material adicionado." };
            });
          }}
        >
          {busy ? "Enviando…" : "Enviar"}
        </button>
      </div>
    </div>
  );
}
