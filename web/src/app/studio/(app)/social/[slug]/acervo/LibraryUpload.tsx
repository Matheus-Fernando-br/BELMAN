"use client";

import { useState } from "react";
import { addLibraryItem, profileUploadUrl } from "../../actions";
import { Uploader } from "../../ui";

export function LibraryUpload({ slug }: { slug: string }) {
  const [kind, setKind] = useState("screen_recording");
  const [title, setTitle] = useState("");
  const [license, setLicense] = useState("");
  return (
    <div className="st-form">
      <div className="st-field">
        <label htmlFor="lib-kind">Tipo</label>
        <select id="lib-kind" className="st-input" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="screen_recording">Gravação de tela (MP4)</option>
          <option value="music">Trilha (MP3/WAV)</option>
          <option value="photo">Foto</option>
          <option value="logo">Logo</option>
        </select>
      </div>
      <div className="st-field">
        <label htmlFor="lib-title">Título</label>
        <input id="lib-title" className="st-input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      {kind === "music" && (
        <div className="st-field">
          <label htmlFor="lib-license">Licença (obrigatória)</label>
          <input id="lib-license" className="st-input" value={license} onChange={(e) => setLicense(e.target.value)} placeholder="ex.: YouTube Audio Library, uso comercial liberado" />
        </div>
      )}
      <Uploader
        accept={kind === "music" ? "audio/mpeg,audio/wav" : kind === "screen_recording" ? "video/mp4" : "image/png,image/jpeg"}
        label="Arquivo"
        getUrl={(ext) => profileUploadUrl(slug, "library", ext)}
        onUploaded={(path) => addLibraryItem(slug, { path, kind, title, license })}
      />
    </div>
  );
}
