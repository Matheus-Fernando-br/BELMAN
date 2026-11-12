// @vitest-environment node
import {
  debugToken,
  detectTokenKind,
  exchangeForLongLived,
  MetaClient,
  MetaError,
  refreshToken,
  shouldRefresh,
  tokenHealth,
  usagePercent,
  withBackoff,
} from "@shared/social/meta-client";

type Call = { url: URL; init: RequestInit };
function mockFetch(responses: (Response | ((c: Call) => Response))[]) {
  const calls: Call[] = [];
  const fn = (async (url: URL, init: RequestInit) => {
    const c = { url: new URL(url), init };
    calls.push(c);
    const r = responses.shift();
    if (!r) throw new Error("sem resposta mock");
    return typeof r === "function" ? r(c) : r;
  }) as unknown as typeof fetch;
  return { fn, calls };
}
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const err = (code: number, message = "erro", status = 400) => json({ error: { code, message } }, status);
const noSleep = async () => {};

describe("detectTokenKind", () => {
  it("IG → ig_user, EAA → fb_user", () => {
    expect(detectTokenKind("IGAAR" + "x".repeat(40))).toBe("ig_user");
    expect(detectTokenKind("EAAB" + "y".repeat(40))).toBe("fb_user");
    expect(detectTokenKind("abc")).toBeNull();
  });
});

describe("debugToken", () => {
  it("lê validade, escopos e IG user id dos granular_scopes", async () => {
    const { fn, calls } = mockFetch([
      json({
        data: {
          is_valid: true,
          type: "SYSTEM_USER",
          app_id: "1",
          expires_at: 0,
          data_access_expires_at: 1900000000,
          scopes: ["instagram_basic", "instagram_content_publish"],
          granular_scopes: [{ scope: "instagram_content_publish", target_ids: ["17841471283814167"] }, { scope: "pages_show_list", target_ids: ["999"] }],
        },
      }),
    ]);
    const d = await debugToken("EAAtoken", { appId: "1", appSecret: "s3cr3t" }, fn);
    expect(d.igUserIds).toEqual(["17841471283814167"]);
    expect(d.expiresAt).toBeNull();
    expect(d.type).toBe("SYSTEM_USER");
    expect(calls[0].url.hostname).toBe("graph.facebook.com");
    expect(calls[0].url.pathname).toBe("/v23.0/debug_token");
  });
  it("exige app cadastrado", async () => {
    await expect(debugToken("EAA", {}, mockFetch([]).fn)).rejects.toBeInstanceOf(MetaError);
  });
  it("não vaza segredo na mensagem de erro", async () => {
    const { fn } = mockFetch([json({ error: { code: 190, message: "bad access_token=EAAsecret&x=1" } }, 400)]);
    await expect(debugToken("EAA", { appId: "1", appSecret: "s" }, fn)).rejects.toThrow(/access_token=\*\*\*/);
  });
});

describe("exchange e refresh", () => {
  it("ig_user troca em graph.instagram.com", async () => {
    const { fn, calls } = mockFetch([json({ access_token: "IGlong", expires_in: 5184000 })]);
    const r = await exchangeForLongLived("IGshort", "ig_user", { igAppSecret: "x" }, fn, 0);
    expect(r.token).toBe("IGlong");
    expect(r.expiresAt?.getTime()).toBe(5184000 * 1000);
    expect(calls[0].url.href).toContain("graph.instagram.com/access_token");
    expect(calls[0].url.searchParams.get("grant_type")).toBe("ig_exchange_token");
  });
  it("fb_user troca em oauth/access_token", async () => {
    const { fn, calls } = mockFetch([json({ access_token: "EAAlong", expires_in: 5183944 })]);
    await exchangeForLongLived("EAAshort", "fb_user", { appId: "1", appSecret: "s" }, fn);
    expect(calls[0].url.pathname).toBe("/v23.0/oauth/access_token");
    expect(calls[0].url.searchParams.get("grant_type")).toBe("fb_exchange_token");
  });
  it("system user não troca", async () => {
    expect((await exchangeForLongLived("EAA", "fb_system_user", {}, mockFetch([]).fn)).expiresAt).toBeNull();
  });
  it("refresh só para ig_user", async () => {
    expect(await refreshToken("EAA", "fb_user", mockFetch([]).fn)).toBeNull();
    const { fn, calls } = mockFetch([json({ access_token: "IGnew", expires_in: 100 })]);
    expect((await refreshToken("IGold", "ig_user", fn, 0))?.token).toBe("IGnew");
    expect(calls[0].url.searchParams.get("grant_type")).toBe("ig_refresh_token");
  });
  it("saúde e momento de renovar", () => {
    const now = Date.UTC(2026, 0, 31);
    expect(tokenHealth("fb_system_user", null, now)).toBe("connected");
    expect(tokenHealth("fb_user", new Date(now + 9 * 864e5), now)).toBe("expiring");
    expect(tokenHealth("fb_user", new Date(now - 1), now)).toBe("expired");
    expect(shouldRefresh("ig_user", new Date(now - 51 * 864e5), new Date(now + 9 * 864e5), now)).toBe(true);
    expect(shouldRefresh("ig_user", new Date(now - 3600e3), new Date(now + 59 * 864e5), now)).toBe(false);
    expect(shouldRefresh("fb_user", new Date(now - 51 * 864e5), new Date(now + 1), now)).toBe(false);
  });
});

describe("MetaClient", () => {
  it("usa graph.facebook.com para fb_user e Bearer no cabeçalho", async () => {
    const { fn, calls } = mockFetch([json({ id: "c1" })]);
    const c = new MetaClient("EAAtok", "fb_user", "178", fn, noSleep);
    await c.createImageContainer({ image_url: "https://x/1.jpg", is_carousel_item: true, alt_text: "alt" });
    expect(calls[0].url.href).toBe("https://graph.facebook.com/v23.0/178/media");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer EAAtok");
    const body = new URLSearchParams(String(calls[0].init.body));
    expect(body.get("is_carousel_item")).toBe("true");
    expect(body.get("caption")).toBeNull();
    expect(calls[0].url.searchParams.get("access_token")).toBeNull();
  });
  it("usa graph.instagram.com para ig_user", () => {
    expect(new MetaClient("IG", "ig_user", "1").base).toBe("https://graph.instagram.com/v23.0");
  });
  it("tenta de novo sem alt_text se a API recusar", async () => {
    const { fn, calls } = mockFetch([err(100, "Invalid parameter alt_text"), json({ id: "c2" })]);
    const id = await new MetaClient("EAA", "fb_user", "1", fn).createImageContainer({ image_url: "u", alt_text: "a" });
    expect(id).toBe("c2");
    expect(new URLSearchParams(String(calls[1].init.body)).get("alt_text")).toBeNull();
  });
  it("carrossel exige 2 a 10 itens", async () => {
    const c = new MetaClient("EAA", "fb_user", "1", mockFetch([]).fn);
    await expect(c.createCarousel({ children: ["a"], caption: "" })).rejects.toThrow(/2 a 10/);
  });
  it("waitContainer espera FINISHED e falha em ERROR", async () => {
    const ok = mockFetch([json({ status_code: "IN_PROGRESS" }), json({ status_code: "FINISHED" })]);
    await new MetaClient("EAA", "fb_user", "1", ok.fn, noSleep).waitContainer("c");
    expect(ok.calls).toHaveLength(2);
    const bad = mockFetch([json({ status_code: "ERROR", status: "Error: formato" })]);
    await expect(new MetaClient("EAA", "fb_user", "1", bad.fn, noSleep).waitContainer("c")).rejects.toThrow(/não conseguiu processar/);
  });
  it("publish devolve id e permalink", async () => {
    const { fn } = mockFetch([json({ id: "m1" }), json({ permalink: "https://www.instagram.com/p/x/" })]);
    expect(await new MetaClient("EAA", "fb_user", "1", fn).publish("c")).toEqual({ mediaId: "m1", permalink: "https://www.instagram.com/p/x/" });
  });
  it("lê cota de publicação", async () => {
    const { fn } = mockFetch([json({ data: [{ quota_usage: 3, config: { quota_total: 100 } }] })]);
    expect(await new MetaClient("EAA", "fb_user", "1", fn).getPublishingLimit()).toEqual({ used: 3, total: 100 });
  });
  it("métrica indisponível vira null sem quebrar", async () => {
    const { fn } = mockFetch([
      err(100, "metric views not supported"),
      json({ data: [{ name: "reach", values: [{ value: 10 }] }] }),
      err(100, "views not supported"),
    ]);
    const m = await new MetaClient("EAA", "fb_user", "1", fn).getMediaInsights("m", ["reach", "views"]);
    expect(m).toEqual({ reach: 10, views: null });
  });
  it("erro 190 marca token inválido; 4/17/32/613/80002 são limite", async () => {
    const { fn } = mockFetch([err(190, "expired")]);
    const e = await new MetaClient("EAA", "fb_user", "1", fn).getProfile().catch((x) => x);
    expect(e).toBeInstanceOf(MetaError);
    expect(e.tokenInvalid).toBe(true);
    expect(e.retryable).toBe(false);
    for (const code of [4, 17, 32, 613, 80002]) expect(new MetaError("x", 400, code).rateLimited).toBe(true);
  });
  it("registra o uso a partir dos cabeçalhos", async () => {
    const { fn } = mockFetch([
      json({ id: "1", username: "obra.facil.app" }, 200, { "x-business-use-case-usage": JSON.stringify({ "123": [{ call_count: 85, total_time: 10, total_cputime: 5 }] }) }),
    ]);
    const c = new MetaClient("EAA", "fb_user", "1", fn);
    await c.getProfile();
    expect(c.lastUsage.percent).toBe(85);
  });
});

describe("usagePercent e backoff", () => {
  it("maior percentual entre os cabeçalhos", () => {
    const h = new Headers({ "x-app-usage": JSON.stringify({ call_count: 12, total_time: 40 }) });
    expect(usagePercent(h)).toBe(40);
    expect(usagePercent(new Headers())).toBe(0);
  });
  it("repete erros de limite com backoff exponencial + jitter", async () => {
    const waits: number[] = [];
    let n = 0;
    const r = await withBackoff(
      async () => {
        if (n++ < 2) throw new MetaError("limite", 400, 613);
        return "ok";
      },
      { baseMs: 1000, sleep: async (ms) => void waits.push(ms), random: () => 1 },
    );
    expect(r).toBe("ok");
    expect(waits).toEqual([1000, 2000]);
  });
  it("não repete erro de token", async () => {
    let n = 0;
    await expect(
      withBackoff(async () => {
        n++;
        throw new MetaError("token", 400, 190);
      }, { sleep: noSleep }),
    ).rejects.toThrow();
    expect(n).toBe(1);
  });
});
