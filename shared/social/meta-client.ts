// Cliente da Graph API (Meta) para Instagram. Compartilhado pelo web e pelo worker.
// Só APIs oficiais: nada de login/scraping no instagram.com, curtir, seguir, comentar em
// perfis de terceiros ou DM em massa.
//
// Base por tipo de token:
//   ig_user (token "IG…", login do Instagram)  → https://graph.instagram.com
//   fb_user / fb_system_user (token "EAA…")     → https://graph.facebook.com

export type TokenKind = "ig_user" | "fb_user" | "fb_system_user";
export type MetaApp = { appId?: string | null; appSecret?: string | null; igAppId?: string | null; igAppSecret?: string | null };
type Fetch = typeof fetch;

export const GRAPH_VERSION = "v23.0";
export const FB_GRAPH = "https://graph.facebook.com";
export const IG_GRAPH = "https://graph.instagram.com";

export const baseUrl = (kind: TokenKind) => (kind === "ig_user" ? IG_GRAPH : FB_GRAPH);

/** Tipo pelo prefixo. O system user ("EAA…" que não expira) é confirmado via debug_token. */
export function detectTokenKind(token: string): "ig_user" | "fb_user" | null {
  const t = token.trim();
  if (/^IG[A-Za-z0-9_-]{20,}/.test(t)) return "ig_user";
  if (/^EAA[A-Za-z0-9_-]{20,}/.test(t)) return "fb_user";
  return null;
}

// ---------------------------------------------------------------- erros e limites
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613, 80001, 80002, 80003, 80004, 80005, 80006, 80008, 80009, 80014]);

export class MetaError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: number,
    public subcode?: number,
    public transient = false,
  ) {
    super(message);
    this.name = "MetaError";
  }
  get rateLimited() {
    return this.code != null && RATE_LIMIT_CODES.has(this.code);
  }
  /** Erro 190: token inválido/expirado → marcar conta como expirada. */
  get tokenInvalid() {
    return this.code === 190;
  }
  get retryable() {
    return this.rateLimited || this.transient || this.code === 1 || this.code === 2 || this.status >= 500;
  }
}

/** Maior percentual de uso informado pelos cabeçalhos X-Business-Use-Case-Usage / X-App-Usage. */
export function usagePercent(headers: Headers): number {
  let max = 0;
  const bump = (o: Record<string, unknown>) => {
    for (const k of ["call_count", "total_cputime", "total_time"]) {
      const v = Number(o[k]);
      if (Number.isFinite(v)) max = Math.max(max, v);
    }
  };
  try {
    const app = headers.get("x-app-usage");
    if (app) bump(JSON.parse(app));
  } catch {}
  try {
    const buc = headers.get("x-business-use-case-usage");
    if (buc) for (const list of Object.values(JSON.parse(buc) as Record<string, Record<string, unknown>[]>)) for (const o of list) bump(o);
  } catch {}
  return max;
}

export const scrub = (s: string) => s.replace(/(access_token|input_token|client_secret|fb_exchange_token)=[^&\s"]+/g, "$1=***");

export type Usage = { percent: number; at: number };

async function request<T>(
  fetchFn: Fetch,
  url: string,
  init: { method?: "GET" | "POST"; params?: Record<string, string | number | boolean | undefined | null>; token?: string; onUsage?: (u: Usage) => void } = {},
): Promise<T> {
  const u = new URL(url);
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(init.params ?? {})) {
    if (v == null) continue;
    (init.method === "POST" ? body : u.searchParams).set(k, String(v));
  }
  const headers: Record<string, string> = {};
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  if (init.method === "POST") headers["Content-Type"] = "application/x-www-form-urlencoded";
  let res: Response;
  try {
    res = await fetchFn(u, { method: init.method ?? "GET", headers, body: init.method === "POST" ? body : undefined, signal: AbortSignal.timeout(30_000) });
  } catch (e) {
    throw new MetaError(`Falha de rede ao falar com a Meta: ${scrub((e as Error).message)}`, 0, undefined, undefined, true);
  }
  init.onUsage?.({ percent: usagePercent(res.headers), at: Date.now() });
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number; error_subcode?: number; is_transient?: boolean; error_user_msg?: string } } & T;
  if (!res.ok || json.error) {
    const e = json.error ?? {};
    throw new MetaError(scrub(e.error_user_msg || e.message || `A Meta respondeu ${res.status}`), res.status, e.code, e.error_subcode, Boolean(e.is_transient));
  }
  return json;
}

/** Backoff exponencial com jitter para erros de limite (4, 17, 32, 613, 8000x) e transitórios. */
export async function withBackoff<T>(fn: () => Promise<T>, opts: { retries?: number; baseMs?: number; sleep?: (ms: number) => Promise<void>; random?: () => number } = {}) {
  const retries = opts.retries ?? 4;
  const base = opts.baseMs ?? 2000;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const random = opts.random ?? Math.random;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (!(e instanceof MetaError) || !e.retryable || attempt >= retries) throw e;
      const delay = Math.min(60_000, base * 2 ** attempt) * (0.5 + random() / 2);
      await sleep(delay);
    }
  }
}

// ---------------------------------------------------------------- token: debug, exchange, refresh
export type DebugInfo = {
  isValid: boolean;
  type: string | null;
  appId: string | null;
  userId: string | null;
  expiresAt: Date | null; // null = não expira
  dataAccessExpiresAt: Date | null;
  scopes: string[];
  igUserIds: string[];
};

const epoch = (v?: number | null) => (v ? new Date(v * 1000) : null);

/** Sem app cadastrado, o próprio token se inspeciona (vale para o desenvolvedor do app). */
export async function debugToken(token: string, app: MetaApp | null, fetchFn: Fetch = fetch): Promise<DebugInfo> {
  const appToken = app?.appId && app.appSecret ? `${app.appId}|${app.appSecret}` : token;
  const r = await request<{
    data: {
      is_valid: boolean;
      type?: string;
      app_id?: string;
      user_id?: string;
      expires_at?: number;
      data_access_expires_at?: number;
      scopes?: string[];
      granular_scopes?: { scope: string; target_ids?: string[] }[];
    };
  }>(fetchFn, `${FB_GRAPH}/${GRAPH_VERSION}/debug_token`, { params: { input_token: token, access_token: appToken } });
  const d = r.data;
  const igUserIds = [...new Set((d.granular_scopes ?? []).filter((g) => g.scope.startsWith("instagram")).flatMap((g) => g.target_ids ?? []))];
  return {
    isValid: Boolean(d.is_valid),
    type: d.type ?? null,
    appId: d.app_id ?? null,
    userId: d.user_id ?? null,
    expiresAt: epoch(d.expires_at), // 0 = nunca expira
    dataAccessExpiresAt: epoch(d.data_access_expires_at),
    scopes: d.scopes ?? [],
    igUserIds,
  };
}

export type LongLived = { token: string; expiresAt: Date | null };

export async function exchangeForLongLived(token: string, kind: TokenKind, app: MetaApp, fetchFn: Fetch = fetch, now = Date.now()): Promise<LongLived> {
  if (kind === "fb_system_user") return { token, expiresAt: null };
  if (kind === "ig_user") {
    if (!app.igAppSecret) throw new MetaError("Cadastre o Instagram App Secret em Configurações → Meta.", 400);
    const r = await request<{ access_token: string; expires_in?: number }>(fetchFn, `${IG_GRAPH}/access_token`, {
      params: { grant_type: "ig_exchange_token", client_secret: app.igAppSecret, access_token: token },
    });
    return { token: r.access_token, expiresAt: r.expires_in ? new Date(now + r.expires_in * 1000) : null };
  }
  if (!app.appId || !app.appSecret) throw new MetaError("Cadastre o App ID e o App Secret da Meta em Configurações → Meta.", 400);
  const r = await request<{ access_token: string; expires_in?: number }>(fetchFn, `${FB_GRAPH}/${GRAPH_VERSION}/oauth/access_token`, {
    params: { grant_type: "fb_exchange_token", client_id: app.appId, client_secret: app.appSecret, fb_exchange_token: token },
  });
  return { token: r.access_token, expiresAt: r.expires_in ? new Date(now + r.expires_in * 1000) : null };
}

/** Só ig_user renova sozinho (token com 24h+ e ainda válido). fb_user não tem refresh silencioso. */
export async function refreshToken(token: string, kind: TokenKind, fetchFn: Fetch = fetch, now = Date.now()): Promise<LongLived | null> {
  if (kind !== "ig_user") return null;
  const r = await request<{ access_token: string; expires_in: number }>(fetchFn, `${IG_GRAPH}/refresh_access_token`, {
    params: { grant_type: "ig_refresh_token", access_token: token },
  });
  return { token: r.access_token, expiresAt: new Date(now + r.expires_in * 1000) };
}

/** Situação do token para a tela e para o job diário. */
export function tokenHealth(kind: TokenKind, expiresAt: Date | null, now = Date.now()): "connected" | "expiring" | "expired" {
  if (!expiresAt) return "connected";
  const left = expiresAt.getTime() - now;
  if (left <= 0) return "expired";
  if (kind === "fb_user" && left < 10 * 864e5) return "expiring";
  if (kind === "ig_user" && left < 5 * 864e5) return "expiring";
  return "connected";
}

/** ig_user: renova quando o token tem mais de 50 dias (ou faltam < 10 dias). */
export function shouldRefresh(kind: TokenKind, issuedOrRefreshedAt: Date, expiresAt: Date | null, now = Date.now()) {
  if (kind !== "ig_user" || !expiresAt) return false;
  const age = now - issuedOrRefreshedAt.getTime();
  return age > 24 * 3600e3 && (age > 50 * 864e5 || expiresAt.getTime() - now < 10 * 864e5);
}

// ---------------------------------------------------------------- cliente da conta
export type Profile = {
  id: string;
  username: string;
  name: string | null;
  biography: string | null;
  website: string | null;
  profile_picture_url: string | null;
  followers_count: number | null;
  media_count: number | null;
};

export type ContainerStatus = "FINISHED" | "IN_PROGRESS" | "ERROR" | "EXPIRED" | "PUBLISHED";

export const PUBLISH_SCOPES = ["instagram_business_content_publish", "instagram_content_publish"];

/** Contas do Instagram ligadas às páginas do token (quando o debug não traz o id). */
export async function instagramAccounts(token: string, fetchFn: Fetch = fetch) {
  const r = await request<{ data: { instagram_business_account?: { id: string; username?: string } }[] }>(fetchFn, `${FB_GRAPH}/${GRAPH_VERSION}/me/accounts`, {
    params: { fields: "instagram_business_account{id,username}", limit: 50 },
    token,
  });
  return r.data.map((p) => p.instagram_business_account).filter((x): x is { id: string; username?: string } => Boolean(x?.id));
}

export class MetaClient {
  readonly base: string;
  lastUsage: Usage = { percent: 0, at: 0 };
  constructor(
    private token: string,
    readonly kind: TokenKind,
    readonly igUserId: string,
    private fetchFn: Fetch = fetch,
    private sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {
    this.base = `${baseUrl(kind)}/${GRAPH_VERSION}`;
  }

  private call<T>(path: string, init: { method?: "GET" | "POST"; params?: Record<string, string | number | boolean | undefined | null> } = {}) {
    return request<T>(this.fetchFn, `${this.base}${path}`, { ...init, token: this.token, onUsage: (u) => (this.lastUsage = u) });
  }

  /** Lê o id e o @ do próprio token (útil para tokens ig_user, onde não há debug_token). */
  async me() {
    const r = await this.call<{ id?: string; user_id?: string; username?: string }>("/me", { params: { fields: this.kind === "ig_user" ? "user_id,username" : "id,name" } });
    return { id: String(r.user_id ?? r.id ?? ""), username: r.username ?? null };
  }

  async getProfile(): Promise<Profile> {
    const fields = "id,username,name,biography,website,profile_picture_url,followers_count,media_count";
    const r = await this.call<Partial<Profile> & { user_id?: string }>(this.kind === "ig_user" ? "/me" : `/${this.igUserId}`, { params: { fields } });
    return {
      id: String(r.user_id ?? r.id ?? this.igUserId),
      username: r.username ?? "",
      name: r.name ?? null,
      biography: r.biography ?? null,
      website: r.website ?? null,
      profile_picture_url: r.profile_picture_url ?? null,
      followers_count: r.followers_count ?? null,
      media_count: r.media_count ?? null,
    };
  }

  async createImageContainer(p: { image_url: string; is_carousel_item?: boolean; caption?: string; alt_text?: string; story?: boolean }) {
    const params = {
      image_url: p.image_url,
      is_carousel_item: p.is_carousel_item ? "true" : undefined,
      caption: p.is_carousel_item || p.story ? undefined : p.caption,
      alt_text: p.story ? undefined : p.alt_text?.slice(0, 1000),
      media_type: p.story ? "STORIES" : undefined,
    };
    try {
      return (await this.call<{ id: string }>(`/${this.igUserId}/media`, { method: "POST", params })).id;
    } catch (e) {
      // contas/versões sem alt_text: tenta de novo sem ele
      if (params.alt_text && e instanceof MetaError && /alt_text/i.test(e.message)) {
        return (await this.call<{ id: string }>(`/${this.igUserId}/media`, { method: "POST", params: { ...params, alt_text: undefined } })).id;
      }
      throw e;
    }
  }

  async createVideoContainer(p: { media_type: "REELS" | "STORIES"; video_url: string; caption?: string; cover_url?: string; thumb_offset?: number; share_to_feed?: boolean }) {
    const story = p.media_type === "STORIES";
    return (
      await this.call<{ id: string }>(`/${this.igUserId}/media`, {
        method: "POST",
        params: {
          media_type: p.media_type,
          video_url: p.video_url,
          caption: story ? undefined : p.caption,
          cover_url: story ? undefined : p.cover_url,
          thumb_offset: story ? undefined : p.thumb_offset,
          share_to_feed: story ? undefined : p.share_to_feed === false ? "false" : "true",
        },
      })
    ).id;
  }

  async createCarousel(p: { children: string[]; caption: string }) {
    if (p.children.length < 2 || p.children.length > 10) throw new MetaError("Carrossel precisa de 2 a 10 itens.", 400);
    return (await this.call<{ id: string }>(`/${this.igUserId}/media`, { method: "POST", params: { media_type: "CAROUSEL", children: p.children.join(","), caption: p.caption } })).id;
  }

  /** Polling de status_code com backoff até FINISHED / ERROR / EXPIRED. */
  async waitContainer(id: string, timeoutMs = 300_000) {
    const start = Date.now();
    let delay = 2000;
    for (;;) {
      const r = await this.call<{ status_code?: ContainerStatus; status?: string }>(`/${id}`, { params: { fields: "status_code,status" } });
      const s = r.status_code;
      if (!s || s === "FINISHED" || s === "PUBLISHED") return;
      if (s === "ERROR" || s === "EXPIRED") throw new MetaError(`A Meta não conseguiu processar a mídia (${r.status ?? s}).`, 400);
      if (Date.now() - start > timeoutMs) throw new MetaError("A mídia ainda está em processamento na Meta.", 408, undefined, undefined, true);
      await this.sleep(delay);
      delay = Math.min(15_000, Math.round(delay * 1.5));
    }
  }

  async publish(containerId: string) {
    const r = await this.call<{ id: string }>(`/${this.igUserId}/media_publish`, { method: "POST", params: { creation_id: containerId } });
    const info = await this.call<{ permalink?: string }>(`/${r.id}`, { params: { fields: "permalink" } }).catch(() => ({ permalink: undefined }));
    return { mediaId: r.id, permalink: info.permalink ?? null };
  }

  async getPublishingLimit() {
    const r = await this.call<{ data?: { quota_usage?: number; config?: { quota_total?: number } }[] }>(`/${this.igUserId}/content_publishing_limit`, {
      params: { fields: "quota_usage,config" },
    });
    const row = r.data?.[0];
    return { used: row?.quota_usage ?? 0, total: row?.config?.quota_total ?? 100 };
  }

  // ---- comentários (somente nos NOSSOS posts)
  async listComments(mediaId: string) {
    const r = await this.call<{ data: { id: string; text: string; username?: string; timestamp: string; hidden?: boolean }[] }>(`/${mediaId}/comments`, {
      params: { fields: "id,text,username,timestamp,hidden" },
    });
    return r.data;
  }
  async replyComment(commentId: string, message: string) {
    return (await this.call<{ id: string }>(`/${commentId}/replies`, { method: "POST", params: { message } })).id;
  }
  async hideComment(commentId: string, hide = true) {
    await this.call(`/${commentId}`, { method: "POST", params: { hide: hide ? "true" : "false" } });
  }

  // ---- métricas
  /** Métricas de um post; métrica indisponível para o formato vira null, sem quebrar. */
  async getMediaInsights(mediaId: string, metrics = ["reach", "views", "likes", "comments", "saved", "shares", "total_interactions"]) {
    const out: Record<string, number | null> = Object.fromEntries(metrics.map((m) => [m, null]));
    const read = (data: { name: string; values?: { value: number }[]; total_value?: { value: number } }[]) => {
      for (const m of data) out[m.name] = m.total_value?.value ?? m.values?.[0]?.value ?? null;
    };
    try {
      read((await this.call<{ data: { name: string; values?: { value: number }[]; total_value?: { value: number } }[] }>(`/${mediaId}/insights`, { params: { metric: metrics.join(",") } })).data);
    } catch (e) {
      if (!(e instanceof MetaError) || e.code !== 100) throw e;
      // alguma métrica não existe para este tipo de mídia: pede uma a uma
      for (const m of metrics) {
        try {
          read((await this.call<{ data: { name: string; values?: { value: number }[]; total_value?: { value: number } }[] }>(`/${mediaId}/insights`, { params: { metric: m } })).data);
        } catch (inner) {
          if (!(inner instanceof MetaError) || inner.code !== 100) throw inner;
        }
      }
    }
    return out;
  }

  async getAccountInsights(metrics = ["reach", "profile_views", "follower_count"], period = "day") {
    const r = await this.call<{ data: { name: string; values?: { value: number; end_time?: string }[]; total_value?: { value: number } }[] }>(`/${this.igUserId}/insights`, {
      params: { metric: metrics.join(","), period, metric_type: "total_value" },
    });
    return Object.fromEntries(r.data.map((m) => [m.name, m.total_value?.value ?? m.values?.at(-1)?.value ?? null]));
  }
}
