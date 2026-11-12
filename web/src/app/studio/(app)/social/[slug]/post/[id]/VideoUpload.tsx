"use client";

import { useState } from "react";
import { attachVideo, videoUploadUrl } from "../../../actions";
import { Uploader } from "../../../ui";

export function VideoUpload({ slug, id }: { slug: string; id: string }) {
  const [subs, setSubs] = useState(true);
  return (
    <>
      <label className="st-check">
        <input type="checkbox" checked={subs} onChange={(e) => setSubs(e.target.checked)} /> Gerar legendas da fala (whisper.cpp)
      </label>
      <Uploader accept="video/mp4" label="Arquivo MP4" maxMb={50} getUrl={() => videoUploadUrl(slug, id)} onUploaded={(path) => attachVideo(slug, id, path, { subtitles: subs })} />
    </>
  );
}
