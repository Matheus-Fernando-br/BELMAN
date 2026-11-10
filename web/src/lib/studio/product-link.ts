import "server-only";
import crypto from "node:crypto";

// Cliente do canal "bellman-studio-v1" (mesmo protocolo de backend/src/services/studioLink.js
// do Obra Fácil). O segredo fica só na variável de ambiente do servidor; dele derivamos
// as chaves de assinatura e de criptografia. Nada disso chega ao navegador.

const PROTOCOL = "bellman-studio-v1";

export type ProductKeys = { sign: Buffer; enc: Buffer };

export function secretEnvName(slug: string) {
  return `STUDIO_SECRET_${slug.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
}

export function productKeys(slug: string): ProductKeys | null {
  const secret = process.env[secretEnvName(slug)];
  if (!secret || secret.length < 64) return null;
  const ikm = Buffer.from(secret, "utf8");
  const derive = (info: string) => Buffer.from(crypto.hkdfSync("sha256", ikm, Buffer.from(PROTOCOL), Buffer.from(info), 32));
  return { sign: derive("signature"), enc: derive("encryption") };
}

export function signRequest(keys: ProductKeys, { ts, nonce, method, pathWithQuery }: { ts: string; nonce: string; method: string; pathWithQuery: string }) {
  return crypto.createHmac("sha256", keys.sign).update(`${ts}\n${nonce}\n${method.toUpperCase()}\n${pathWithQuery}`).digest("hex");
}

type Envelope = { v: number; alg: string; iv: string; tag: string; data: string };

export function openEnvelope<T>(keys: ProductKeys, env: Envelope, { ts, nonce }: { ts: string; nonce: string }): T {
  if (env?.v !== 1 || env.alg !== "A256GCM") throw new Error("Formato de resposta desconhecido.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", keys.enc, Buffer.from(env.iv, "base64"));
  decipher.setAAD(Buffer.from(`${ts}\n${nonce}`));
  decipher.setAuthTag(Buffer.from(env.tag, "base64"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(env.data, "base64")), decipher.final()]).toString("utf8")) as T;
}

/** GET assinado; devolve o conteúdo já decifrado e autenticado. */
export async function fetchSealed<T>(baseUrl: string, keys: ProductKeys, path: string, timeoutMs = 60_000): Promise<T> {
  const url = new URL(baseUrl.replace(/\/$/, "") + path);
  if (url.protocol !== "https:") throw new Error("O endpoint do produto precisa usar HTTPS.");
  const ts = String(Date.now());
  const nonce = crypto.randomBytes(18).toString("base64url");
  const signature = signRequest(keys, { ts, nonce, method: "GET", pathWithQuery: url.pathname + url.search });
  const res = await fetch(url, {
    headers: { "X-Studio-Timestamp": ts, "X-Studio-Nonce": nonce, "X-Studio-Signature": signature, Accept: "application/json" },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(res.status === 401 ? "O produto recusou a assinatura (confira o segredo dos dois lados)." : `O produto respondeu ${res.status}.`);
  return openEnvelope<T>(keys, (await res.json()) as Envelope, { ts, nonce });
}
