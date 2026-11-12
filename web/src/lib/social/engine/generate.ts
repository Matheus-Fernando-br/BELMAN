import "server-only";
import { generatePost, type FormatKey } from "./ai";
import { enqueue, sb, setPost } from "./db";
import { loadBrand, logUsage, type Job } from "./brand";

/** Tema (ou tema livre) → texto estruturado (IA) → lint → no máximo 1 correção → artes. */
export async function generateCopy(job: Job) {
  if (!job.entity_id || !job.post_id) throw new Error("Job sem post.");
  const { profile } = await loadBrand(job.entity_id);
  const { data: post } = await sb().from("social_posts").select("*").eq("id", job.post_id).single();
  if (!post) throw new Error("Post não encontrado.");
  const { data: recent } = await sb()
    .from("social_posts")
    .select("theme")
    .eq("entity_id", job.entity_id)
    .neq("id", job.post_id)
    .not("theme", "is", null)
    .order("created_at", { ascending: false })
    .limit(15);
  const redo = job.payload.purpose === "redo";
  const g = await generatePost(profile, {
    theme: post.theme || "Escolha você um tema novo, específico e útil para o público, diferente dos recentes.",
    format: post.format as FormatKey,
    post_type: post.post_type,
    recentThemes: (recent ?? []).map((r) => r.theme as string),
    instruction: redo ? String(job.payload.instruction ?? "") : undefined,
    current: redo ? { caption: post.caption, hashtags: post.hashtags, ...post.copy } : undefined,
  });
  for (const u of g.usages) await logUsage(job.entity_id, job.post_id, redo ? "redo" : "post", u);
  await setPost(job.post_id, {
    theme: post.theme || g.theme,
    post_type: g.post_type,
    caption: g.caption,
    hashtags: g.hashtags,
    alt_texts: g.alt_texts,
    copy: g.copy,
    status: "rendering",
    error: null,
    revision: (post.revision ?? 0) + 1,
  });
  await enqueue({ entity_id: job.entity_id, post_id: job.post_id, kind: "render", payload: { reason: redo ? "redo" : "new" }, dedupe_key: `render:${job.post_id}` });
  return { format: g.format, cost_usd: g.usages.reduce((s, u) => s + u.cost_usd, 0) };
}
