import { zipSync, strToU8 } from "fflate";
import { NextResponse } from "next/server";
import { fullCaption } from "@shared/social/lint";
import { admin, BUCKET, requireWorkspace } from "@/lib/social/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Pacote do post: mídias na ordem + legenda.txt + alt.txt (+ youtube.txt).
export async function GET(_: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { entity } = await requireWorkspace(slug);
  const supabase = await createClient();
  const { data: post } = await supabase.from("social_posts").select("*").eq("id", id).eq("entity_id", entity.id).maybeSingle();
  if (!post) return NextResponse.json({ error: "não encontrado" }, { status: 404 });
  const { data: assets } = await supabase.from("social_assets").select("*").eq("post_id", id).neq("kind", "preview").order("kind").order("idx");
  const files: Record<string, Uint8Array> = {};
  const store = admin().storage.from(BUCKET);
  for (const a of assets ?? []) {
    const { data } = await store.download(a.storage_path);
    if (!data) continue;
    const ext = a.storage_path.split(".").pop();
    const name = a.kind === "image" ? `${String(a.idx + 1).padStart(2, "0")}.${ext}` : `${a.kind}${a.idx ? `-${a.idx}` : ""}.${ext}`;
    files[name] = new Uint8Array(await data.arrayBuffer());
  }
  files["legenda.txt"] = strToU8(fullCaption(post.caption ?? "", post.hashtags ?? []));
  files["alt.txt"] = strToU8((post.alt_texts ?? []).map((t: string, i: number) => `${i + 1}. ${t}`).join("\n"));
  const yt = post.copy?.youtube;
  if (yt) files["youtube.txt"] = strToU8(`${yt.title}\n\n${yt.description}\n\n${(yt.chapters ?? []).map((c: { time: string; label: string }) => `${c.time} ${c.label}`).join("\n")}\n\nTags: ${(yt.tags ?? []).join(", ")}`);
  const zip = zipSync(files, { level: 0 });
  return new NextResponse(Buffer.from(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${entity.slug}-${id.slice(0, 8)}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
