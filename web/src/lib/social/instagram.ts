import "server-only";

// Instagram API com login do Instagram (conta profissional; não precisa de página do Facebook).
// Host graph.instagram.com; versão configurável. O token só existe aqui, no servidor,
// decifrado na hora do uso e enviado no cabeçalho Authorization.

const VERSION = process.env.INSTAGRAM_API_VERSION || "v27.0";
const BASE = `https://graph.instagram.com/${VERSION}`;

export class InstagramError extends Error {
  constructor(
    message: string,
    public code?: number,
  ) {
    super(message);
    this.name = "InstagramError";
  }
}

async function call<T>(token: string, path: string, init: { method?: "GET" | "POST"; params?: Record<string, string | undefined> } = {}): Promise<T> {
  const url = new URL(path.startsWith("http") ? path : `${BASE}${path}`);
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(init.params ?? {})) if (v != null) (init.method === "POST" ? body : url.searchParams).set(k, v);
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${token}`, ...(init.method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body: init.method === "POST" ? body : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number; error_user_msg?: string } } & T;
  if (!res.ok || json.error) {
    const e = json.error;
    // Mensagem do Instagram sem ecoar o token.
    throw new InstagramError((e?.error_user_msg || e?.message || `Instagram respondeu ${res.status}`).replace(/access_token=[^&\s]+/g, "access_token=***"), e?.code);
  }
  return json;
}

export async function getAccount(token: string) {
  const r = await call<{ user_id?: string; id?: string; username: string; account_type?: string; data?: { user_id: string; username: string }[] }>(token, "/me", {
    params: { fields: "user_id,username,account_type" },
  });
  const row = r.data?.[0] ?? r;
  return { userId: String(row.user_id ?? r.id), username: row.username, accountType: r.account_type ?? null };
}

/** Renova o token de longa duração (+60 dias). Precisa ter 24h+ de idade e não estar vencido. */
export async function refreshToken(token: string) {
  const r = await call<{ access_token: string; expires_in: number }>(token, "https://graph.instagram.com/refresh_access_token", {
    params: { grant_type: "ig_refresh_token", access_token: token },
  });
  return { token: r.access_token, expiresAt: new Date(Date.now() + r.expires_in * 1000) };
}

type Container = { id: string };

export async function createImage(token: string, igId: string, p: { imageUrl: string; caption?: string; altText?: string; carouselItem?: boolean; story?: boolean }) {
  const params = {
    image_url: p.imageUrl,
    caption: p.carouselItem || p.story ? undefined : p.caption,
    alt_text: p.story ? undefined : p.altText?.slice(0, 1000),
    is_carousel_item: p.carouselItem ? "true" : undefined,
    media_type: p.story ? "STORIES" : undefined,
  };
  try {
    return await call<Container>(token, `/${igId}/media`, { method: "POST", params });
  } catch (error) {
    // Se a conta/versão não aceitar alt_text, tenta de novo sem ele.
    if (params.alt_text && error instanceof InstagramError && /alt_text/i.test(error.message)) {
      return call<Container>(token, `/${igId}/media`, { method: "POST", params: { ...params, alt_text: undefined } });
    }
    throw error;
  }
}

export async function createCarousel(token: string, igId: string, children: string[], caption: string) {
  return call<Container>(token, `/${igId}/media`, { method: "POST", params: { media_type: "CAROUSEL", children: children.join(","), caption } });
}

export async function createVideo(token: string, igId: string, p: { videoUrl: string; caption?: string; story?: boolean; coverUrl?: string }) {
  return call<Container>(token, `/${igId}/media`, {
    method: "POST",
    params: { media_type: p.story ? "STORIES" : "REELS", video_url: p.videoUrl, caption: p.story ? undefined : p.caption, cover_url: p.story ? undefined : p.coverUrl, share_to_feed: p.story ? undefined : "true" },
  });
}

/** Espera o contêiner ficar pronto (vídeos levam mais tempo). */
export async function waitReady(token: string, containerId: string, timeoutMs = 120_000) {
  const start = Date.now();
  for (;;) {
    const r = await call<{ status_code?: string; status?: string }>(token, `/${containerId}`, { params: { fields: "status_code,status" } });
    if (!r.status_code || r.status_code === "FINISHED" || r.status_code === "PUBLISHED") return;
    if (r.status_code === "ERROR" || r.status_code === "EXPIRED") throw new InstagramError(`O Instagram não conseguiu processar a mídia (${r.status ?? r.status_code}).`);
    if (Date.now() - start > timeoutMs) throw new InstagramError("A mídia ainda está sendo processada pelo Instagram; tente publicar de novo em alguns minutos.");
    await new Promise((r2) => setTimeout(r2, 4000));
  }
}

export async function publish(token: string, igId: string, creationId: string) {
  const r = await call<{ id: string }>(token, `/${igId}/media_publish`, { method: "POST", params: { creation_id: creationId } });
  const info = await call<{ permalink?: string }>(token, `/${r.id}`, { params: { fields: "permalink" } }).catch(() => ({ permalink: undefined }));
  return { mediaId: r.id, permalink: info.permalink ?? null };
}

export async function publishingQuota(token: string, igId: string) {
  const r = await call<{ data?: { quota_usage?: number; config?: { quota_total?: number } }[] }>(token, `/${igId}/content_publishing_limit`, {
    params: { fields: "quota_usage,config" },
  }).catch(() => null);
  const row = r?.data?.[0];
  return row ? { used: row.quota_usage ?? 0, total: row.config?.quota_total ?? 100 } : null;
}

/** Métricas de um post publicado (o que não existir para o formato vem nulo). */
export async function mediaInsights(token: string, mediaId: string, format: "feed" | "reels" | "story") {
  const metrics = format === "reels" ? "reach,likes,comments,saved,shares,views" : format === "story" ? "reach,shares,views,replies" : "reach,likes,comments,saved,shares,views";
  const r = await call<{ data: { name: string; values?: { value: number }[]; total_value?: { value: number } }[] }>(token, `/${mediaId}/insights`, { params: { metric: metrics } });
  const get = (n: string) => {
    const m = r.data.find((x) => x.name === n);
    return m ? (m.total_value?.value ?? m.values?.[0]?.value ?? null) : null;
  };
  return { reach: get("reach"), likes: get("likes"), comments: get("comments") ?? get("replies"), saves: get("saved"), shares: get("shares"), views: get("views") };
}
