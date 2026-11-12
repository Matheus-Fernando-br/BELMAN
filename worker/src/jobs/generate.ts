import { generatePost, suggestBios, type FormatKey } from "../ai.js";
import { db, enqueue, setPost } from "../db.js";
import { loadBrand, logUsage, type Job } from "./brand.js";

/** Tema → texto estruturado (Claude) → lint → (no máximo 1 correção) → enfileira o render. */
export async function generateCopy(job: Job) {
  if (!job.entity_id) throw new Error("Job sem entidade.");
  const { profile } = await loadBrand(job.entity_id);

  if (job.payload.purpose === "bio") {
    const { data: acc } = await db.from("social_accounts").select("name,biography").eq("entity_id", job.entity_id).eq("platform", "instagram").maybeSingle();
    const r = await suggestBios(profile, acc ?? {}, String(job.payload.hint ?? ""));
    await logUsage(job.entity_id, null, "bio", r.usage);
    return { suggestions: r.suggestions };
  }

  if (!job.post_id) throw new Error("Job sem post.");
  const { data: post } = await db.from("social_posts").select("*").eq("id", job.post_id).single();
  if (!post) throw new Error("Post não encontrado.");
  const { data: recent } = await db
    .from("social_posts")
    .select("theme")
    .eq("entity_id", job.entity_id)
    .neq("id", job.post_id)
    .not("theme", "is", null)
    .order("created_at", { ascending: false })
    .limit(10);
  const redo = job.payload.purpose === "redo";
  const g = await generatePost(profile, {
    theme: post.theme ?? "Tema livre da marca",
    format: job.payload.auto_format ? "auto" : (post.format as FormatKey),
    post_type: post.post_type,
    recentThemes: (recent ?? []).map((r) => r.theme as string),
    instruction: redo ? String(job.payload.instruction ?? "") : undefined,
    current: redo ? { caption: post.caption, hashtags: post.hashtags, ...post.copy } : undefined,
  });
  for (const u of g.usages) await logUsage(job.entity_id, job.post_id, redo ? "redo" : "post", u);
  await setPost(job.post_id, {
    format: g.format,
    post_type: g.post_type,
    caption: g.caption,
    hashtags: g.hashtags,
    alt_texts: g.alt_texts,
    copy: g.copy,
    status: "rendering",
    error: g.issues.some((i) => i.level === "error") ? `Lint: ${g.issues.filter((i) => i.level === "error").map((i) => i.message).join(" ")}` : null,
    revision: (post.revision ?? 0) + 1,
  });
  await enqueue({ entity_id: job.entity_id, post_id: job.post_id, kind: "render", payload: { reason: redo ? "redo" : "new" }, dedupe_key: `render:${job.post_id}` });
  return { format: g.format, issues: g.issues.length, cost_usd: g.usages.reduce((s, u) => s + u.cost_usd, 0) };
}
