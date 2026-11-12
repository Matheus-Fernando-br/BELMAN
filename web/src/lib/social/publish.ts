import "server-only";
import { decrypt, encrypt, hint } from "@/lib/studio/vault";
import { createAdminClient } from "@/lib/supabase/server";
import * as ig from "./instagram";
import { fullCaption } from "./caption";
import { signedUrls, type MediaItem } from "./posts";

// Publicação no Instagram. O token é decifrado só aqui, no servidor, na hora do uso.

const aad = (entityId: string, network: string) => `social:${entityId}:${network}`;

function admin() {
  const a = createAdminClient();
  if (!a) throw new Error("SUPABASE_SECRET_KEY não configurada.");
  return a;
}

export type Connection = { id: string; entity_id: string; account_id: string; username: string | null; token: string; token_expires_at: string | null; last_refresh_at: string | null; created_at: string };

export async function getConnection(entityId: string, network = "instagram"): Promise<Connection | null> {
  const { data } = await admin()
    .from("social_connections")
    .select("id,entity_id,account_id,username,token_ciphertext,token_expires_at,last_refresh_at,created_at,status")
    .eq("entity_id", entityId)
    .eq("network", network)
    .maybeSingle();
  if (!data?.token_ciphertext || data.status === "disconnected") return null;
  return { ...data, token: decrypt(data.token_ciphertext, aad(entityId, network)) };
}

/** Valida o token no Instagram e guarda cifrado. O token nunca volta para o navegador. */
export async function saveInstagramToken(entityId: string, token: string, userId: string) {
  const clean = token.trim();
  if (!/^[A-Za-z0-9_\-|.]{40,}$/.test(clean)) throw new Error("Esse não parece um token de acesso do Instagram.");
  const account = await ig.getAccount(clean);
  // Tenta renovar já (garante +60 dias). Token recém-criado (< 24h) não renova: fica com o prazo atual.
  let expiresAt: Date | null = null;
  let finalToken = clean;
  try {
    const r = await ig.refreshToken(clean);
    finalToken = r.token;
    expiresAt = r.expiresAt;
  } catch {
    expiresAt = new Date(Date.now() + 59 * 864e5); // estimativa conservadora; a rotina diária renova
  }
  const now = new Date().toISOString();
  const { error } = await admin()
    .from("social_connections")
    .upsert(
      {
        entity_id: entityId,
        network: "instagram",
        account_id: account.userId,
        username: account.username,
        token_ciphertext: encrypt(finalToken, aad(entityId, "instagram")),
        token_hint: hint(finalToken),
        token_expires_at: expiresAt.toISOString(),
        status: "active",
        last_check_at: now,
        last_refresh_at: finalToken !== clean ? now : null,
        last_error: null,
        updated_at: now,
        updated_by: userId,
        created_by: userId,
      },
      { onConflict: "entity_id,network" },
    );
  if (error) throw new Error("Não foi possível salvar a conexão.");
  return account;
}

export async function disconnect(entityId: string, network: string, userId: string) {
  await admin()
    .from("social_connections")
    .update({ token_ciphertext: null, token_hint: null, status: "disconnected", updated_by: userId, last_error: null })
    .eq("entity_id", entityId)
    .eq("network", network);
}

/** Confere o token e renova quando faltar menos de 15 dias (ou se forçado). */
export async function checkAndRefresh(entityId: string, force = false) {
  const a = admin();
  const conn = await getConnection(entityId);
  if (!conn) return { ok: false, message: "sem conexão" };
  const now = Date.now();
  const expires = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
  const lastRefresh = new Date(conn.last_refresh_at ?? conn.created_at).getTime();
  try {
    const account = await ig.getAccount(conn.token);
    const patch: Record<string, unknown> = { last_check_at: new Date().toISOString(), username: account.username, status: "active", last_error: null };
    if ((force || expires - now < 15 * 864e5) && now - lastRefresh > 24 * 3600e3) {
      const r = await ig.refreshToken(conn.token);
      Object.assign(patch, {
        token_ciphertext: encrypt(r.token, aad(entityId, "instagram")),
        token_hint: hint(r.token),
        token_expires_at: r.expiresAt.toISOString(),
        last_refresh_at: new Date().toISOString(),
      });
    }
    await a.from("social_connections").update(patch).eq("id", conn.id);
    return { ok: true, message: patch.token_expires_at ? "renovado" : "válido" };
  } catch (error) {
    const msg = (error as Error).message.slice(0, 300);
    const expired = expires && expires < now;
    await a.from("social_connections").update({ last_check_at: new Date().toISOString(), status: expired ? "expired" : "error", last_error: msg }).eq("id", conn.id);
    return { ok: false, message: msg };
  }
}

async function log(postId: string, entityId: string, ok: boolean, message: string) {
  await admin().from("social_publish_log").insert({ post_id: postId, entity_id: entityId, ok, message: message.slice(0, 500) });
}

/**
 * Publica um post aprovado/agendado. Trava o post em "publishing" antes de começar,
 * para nunca publicar duas vezes (cron e botão ao mesmo tempo).
 */
export async function publishPost(postId: string) {
  const a = admin();
  const { data: post } = await a
    .from("social_posts")
    .update({ status: "publishing", error: null })
    .eq("id", postId)
    .in("status", ["approved", "scheduled", "failed"])
    .select("*")
    .maybeSingle();
  if (!post) throw new Error("Este post não está aprovado para publicação (ou já está sendo publicado).");
  try {
    if (post.network !== "instagram") throw new Error("Publicação automática disponível só para o Instagram por enquanto.");
    if (post.format === "youtube") throw new Error("YouTube ainda é publicado manualmente: baixe o pacote do post.");
    const conn = await getConnection(post.entity_id);
    if (!conn) throw new Error("Instagram não conectado para esta marca (Redes sociais → Conexões).");
    const media = (post.media ?? []) as MediaItem[];
    const images = media.filter((m) => m.kind === "image");
    const video = media.find((m) => m.kind === "video");
    const caption = fullCaption(post.caption, post.hashtags ?? []).slice(0, 2200);
    const alt = (post.content?.alt_text as string | undefined) ?? post.title;
    const result: { mediaId: string; permalink: string | null }[] = [];

    if (post.format === "carousel") {
      const urls = await signedUrls(images.slice(0, 10).map((m) => m.path));
      if (urls.length < 2) throw new Error("O carrossel precisa de pelo menos 2 artes.");
      const children: string[] = [];
      for (const url of urls) children.push((await ig.createImage(conn.token, conn.account_id, { imageUrl: url, carouselItem: true, altText: alt })).id);
      for (const c of children) await ig.waitReady(conn.token, c, 60_000);
      const parent = await ig.createCarousel(conn.token, conn.account_id, children, caption);
      await ig.waitReady(conn.token, parent.id, 60_000);
      result.push(await ig.publish(conn.token, conn.account_id, parent.id));
    } else if (post.format === "single") {
      const [url] = await signedUrls(images.slice(0, 1).map((m) => m.path));
      if (!url) throw new Error("Post sem arte.");
      const c = await ig.createImage(conn.token, conn.account_id, { imageUrl: url, caption, altText: alt });
      await ig.waitReady(conn.token, c.id, 60_000);
      result.push(await ig.publish(conn.token, conn.account_id, c.id));
    } else if (post.format === "reels") {
      if (!video) throw new Error("Reels precisa do vídeo gravado: envie o MP4 na página do post.");
      const [videoUrl, coverUrl] = await signedUrls([video.path, ...(images[0] ? [images[0].path] : [])]);
      const c = await ig.createVideo(conn.token, conn.account_id, { videoUrl, caption, coverUrl });
      await ig.waitReady(conn.token, c.id, 240_000);
      result.push(await ig.publish(conn.token, conn.account_id, c.id));
    } else if (post.format === "stories") {
      if (video) {
        const [videoUrl] = await signedUrls([video.path]);
        const c = await ig.createVideo(conn.token, conn.account_id, { videoUrl, story: true });
        await ig.waitReady(conn.token, c.id, 240_000);
        result.push(await ig.publish(conn.token, conn.account_id, c.id));
      } else {
        const urls = await signedUrls(images.map((m) => m.path));
        for (const url of urls) {
          const c = await ig.createImage(conn.token, conn.account_id, { imageUrl: url, story: true });
          await ig.waitReady(conn.token, c.id, 60_000);
          result.push(await ig.publish(conn.token, conn.account_id, c.id));
        }
      }
    }
    const first = result[0];
    await a
      .from("social_posts")
      .update({ status: "published", published_at: new Date().toISOString(), external_id: result.map((r) => r.mediaId).join(","), permalink: first?.permalink ?? null, error: null })
      .eq("id", postId);
    await log(postId, post.entity_id, true, `Publicado no Instagram (@${conn.username ?? conn.account_id}).`);
    return first;
  } catch (error) {
    const msg = (error as Error).message.slice(0, 400);
    await a.from("social_posts").update({ status: "failed", error: msg }).eq("id", postId);
    await log(postId, post.entity_id, false, msg);
    throw error;
  }
}

/** Publica o que está agendado e venceu. Limitado por execução para caber no tempo da função. */
export async function publishDue(limit = 3) {
  const { data } = await admin()
    .from("social_posts")
    .select("id")
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at")
    .limit(limit);
  const out: { id: string; ok: boolean }[] = [];
  for (const p of data ?? []) {
    try {
      await publishPost(p.id);
      out.push({ id: p.id, ok: true });
    } catch {
      out.push({ id: p.id, ok: false });
    }
  }
  return out;
}

/** Coleta métricas dos posts publicados nos últimos 30 dias. */
export async function collectMetrics() {
  const a = admin();
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const { data: posts } = await a.from("social_posts").select("id,entity_id,format,external_id").eq("status", "published").eq("network", "instagram").gte("published_at", since).not("external_id", "is", null);
  const tokens = new Map<string, Connection | null>();
  let ok = 0;
  for (const p of posts ?? []) {
    if (!tokens.has(p.entity_id)) tokens.set(p.entity_id, await getConnection(p.entity_id).catch(() => null));
    const conn = tokens.get(p.entity_id);
    if (!conn) continue;
    const ids = String(p.external_id).split(",");
    const kind = p.format === "reels" ? "reels" : p.format === "stories" ? "story" : "feed";
    const sum = { reach: 0, views: 0, likes: 0, comments: 0, saves: 0, shares: 0 };
    let any = false;
    for (const id of ids) {
      const m = await ig.mediaInsights(conn.token, id, kind).catch(() => null);
      if (!m) continue;
      any = true;
      for (const k of Object.keys(sum) as (keyof typeof sum)[]) sum[k] += Number(m[k] ?? 0);
    }
    if (!any) continue;
    await a.from("social_post_metrics").insert({ post_id: p.id, entity_id: p.entity_id, source: "api", ...sum });
    ok++;
  }
  return ok;
}
