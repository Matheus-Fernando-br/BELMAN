import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import request from "supertest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createDeliverer, DeliveryError, formatTelegramMessage } from "../src/delivery.js";

const ORIGIN = "https://bellman.example";

const valid = () => ({
  name: "Maria Silva",
  email: "Maria@Example.com",
  projectType: "web",
  budget: "300-600",
  message: "Preciso de um sistema para controlar pedidos da minha loja.",
  website: "",
  startedAt: Date.now() - 10_000,
});

function setup({ env = {}, deliver } = {}) {
  const config = loadConfig({ ALLOWED_ORIGINS: ORIGIN, RATE_LIMIT_MAX: "3", ...env });
  const sent = [];
  const app = createApp(config, {
    deliver:
      deliver ??
      (async (contact) => {
        sent.push(contact);
      }),
  });
  return { app, sent };
}

describe("GET /api/health", () => {
  it("reports status and delivery mode without secrets", async () => {
    const { app } = setup({ env: { TELEGRAM_TOKEN: "secret-token", TELEGRAM_CHAT_ID: "1" } });
    const res = await request(app).get("/api/health");
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "ok");
    assert.equal(res.body.delivery, "telegram");
    assert.ok(!JSON.stringify(res.body).includes("secret-token"));
  });

  it("reports unconfigured delivery when nothing is set", async () => {
    const { app } = setup();
    const res = await request(app).get("/api/health");
    assert.equal(res.body.delivery, "unconfigured");
  });
});

describe("POST /api/contact", () => {
  it("delivers a valid, normalized message", async () => {
    const { app, sent } = setup();
    const res = await request(app).post("/api/contact").set("Origin", ORIGIN).send(valid());
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].email, "maria@example.com");
    assert.equal(sent[0].website, undefined);
    assert.equal(sent[0].startedAt, undefined);
  });

  it("sets CORS headers only for allowed origins", async () => {
    const { app } = setup();
    const allowed = await request(app).options("/api/contact").set("Origin", ORIGIN);
    assert.equal(allowed.headers["access-control-allow-origin"], ORIGIN);
    const denied = await request(app).options("/api/contact").set("Origin", "https://evil.example");
    assert.equal(denied.headers["access-control-allow-origin"], undefined);
  });

  it("rejects posts from unknown origins", async () => {
    const { app, sent } = setup();
    const res = await request(app).post("/api/contact").set("Origin", "https://evil.example").send(valid());
    assert.equal(res.status, 403);
    assert.equal(sent.length, 0);
  });

  it("returns field errors for invalid data", async () => {
    const { app, sent } = setup();
    const res = await request(app)
      .post("/api/contact")
      .set("Origin", ORIGIN)
      .send({ ...valid(), name: " ", email: "nope", projectType: "x", message: "curta" });
    assert.equal(res.status, 422);
    assert.deepEqual(Object.keys(res.body.fields).sort(), ["email", "message", "name", "projectType"]);
    assert.equal(sent.length, 0);
  });

  it("enforces field length limits", async () => {
    const { app } = setup();
    const res = await request(app)
      .post("/api/contact")
      .set("Origin", ORIGIN)
      .send({ ...valid(), message: "a".repeat(2001) });
    assert.equal(res.status, 422);
    assert.ok(res.body.fields.message);
  });

  it("strips control characters", async () => {
    const { app, sent } = setup();
    await request(app)
      .post("/api/contact")
      .set("Origin", ORIGIN)
      .send({ ...valid(), name: "Ana\u0000​ Lima", message: "Linha um\r\n\n\n\n\nLinha dois com detalhes" });
    assert.equal(sent[0].name, "Ana Lima");
    assert.equal(sent[0].message, "Linha um\n\nLinha dois com detalhes");
  });

  it("silently drops honeypot and too-fast submissions", async () => {
    const { app, sent } = setup();
    const bot = await request(app).post("/api/contact").set("Origin", ORIGIN).send({ ...valid(), website: "http://spam" });
    assert.equal(bot.status, 202);
    const fast = await request(app).post("/api/contact").set("Origin", ORIGIN).send({ ...valid(), startedAt: Date.now() });
    assert.equal(fast.status, 202);
    assert.equal(sent.length, 0);
  });

  it("rate limits repeated submissions", async () => {
    const { app } = setup();
    for (let i = 0; i < 3; i += 1) {
      const ok = await request(app).post("/api/contact").set("Origin", ORIGIN).send(valid());
      assert.equal(ok.status, 200);
    }
    const limited = await request(app).post("/api/contact").set("Origin", ORIGIN).send(valid());
    assert.equal(limited.status, 429);
  });

  it("returns a generic 502 when delivery fails", async () => {
    const { app } = setup({
      deliver: async () => {
        throw new DeliveryError("Upstream timeout");
      },
    });
    const res = await request(app).post("/api/contact").set("Origin", ORIGIN).send(valid());
    assert.equal(res.status, 502);
    assert.equal(res.body.ok, false);
    assert.ok(!res.body.error.includes("timeout"));
  });

  it("rejects oversized and malformed bodies", async () => {
    const { app } = setup();
    const big = await request(app)
      .post("/api/contact")
      .set("Origin", ORIGIN)
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ message: "x".repeat(20_000) }));
    assert.equal(big.status, 413);
    const bad = await request(app)
      .post("/api/contact")
      .set("Origin", ORIGIN)
      .set("Content-Type", "application/json")
      .send("{not json");
    assert.equal(bad.status, 400);
  });
});

describe("delivery", () => {
  const realFetch = globalThis.fetch;
  let calls;

  beforeEach(() => {
    calls = [];
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  const contact = { name: "Ana", email: "ana@example.com", projectType: "finc", budget: undefined, message: "Mensagem de teste com detalhes." };

  it("sends directly to Telegram when credentials are configured", async () => {
    globalThis.fetch = async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };
    const deliver = createDeliverer(loadConfig({ TELEGRAM_TOKEN: "t0k", TELEGRAM_CHAT_ID: "42", CONTACT_RELAY_URL: "https://relay.example/api" }));
    await deliver(contact);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /api\.telegram\.org\/bott0k\/sendMessage$/);
    assert.equal(calls[0].body.chat_id, "42");
    assert.match(calls[0].body.text, /FINC — gestão financeira e fiscal/);
    assert.match(calls[0].body.text, /Orçamento: Não informado/);
  });

  it("falls back to the relay and requires its confirmation", async () => {
    globalThis.fetch = async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    };
    const deliver = createDeliverer(loadConfig({ CONTACT_RELAY_URL: "https://relay.example/api/send-message" }));
    await deliver(contact);
    assert.equal(calls[0].url, "https://relay.example/api/send-message");
    assert.deepEqual(Object.keys(calls[0].body).sort(), ["assunto", "email", "mensagem", "nome"]);
    assert.match(calls[0].body.assunto, /^\[Bellman\]/);

    globalThis.fetch = async () => new Response(JSON.stringify({ success: false }), { status: 500 });
    await assert.rejects(deliver(contact), DeliveryError);
  });

  it("fails clearly when not configured", async () => {
    const deliver = createDeliverer(loadConfig({}));
    await assert.rejects(deliver(contact), /not configured/);
  });

  it("formats a readable notification", () => {
    const text = formatTelegramMessage({ ...contact, budget: "1000+" });
    assert.match(text, /BELLMAN/);
    assert.match(text, /Mais de R\$ 1\.000,00/);
  });
});
