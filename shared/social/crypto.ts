// AES-256-GCM para tokens e app secrets das redes sociais.
// Formato: v1:iv:tag:data (base64url). Chave: SOCIAL_ENC_KEY = 32 bytes em base64.
// Usado pelo web (Vercel) e pelo worker (Render). Sem dependências além do Node.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export class CryptoConfigError extends Error {}

/**
 * Chave de 32 bytes. Usa SOCIAL_ENC_KEY (base64) se existir; senão deriva (SHA-256, com rótulo
 * próprio) da STUDIO_ENCRYPTION_KEY que o Studio já usa — assim não há mais uma variável para configurar.
 */
export function socialKey(raw = process.env.SOCIAL_ENC_KEY, fallback = process.env.STUDIO_ENCRYPTION_KEY): Buffer {
  if (!raw && fallback && fallback.length >= 32) return createHash("sha256").update(`bellman-social-v1:${fallback}`).digest();
  if (!raw) throw new CryptoConfigError("Chave de cifra não configurada no servidor (STUDIO_ENCRYPTION_KEY).");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new CryptoConfigError("SOCIAL_ENC_KEY precisa ter 32 bytes em base64.");
  return key;
}

const b64u = (b: Buffer) => b.toString("base64url");

export function seal(plain: string, key: Buffer = socialKey()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", b64u(iv), b64u(cipher.getAuthTag()), b64u(data)].join(":");
}

export function open(sealed: string, key: Buffer = socialKey()): string {
  const parts = sealed.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") throw new Error("Formato cifrado desconhecido.");
  const [, iv, tag, data] = parts;
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

/** Últimos 4 caracteres, para conferência visual (nunca o token inteiro). */
export const tokenHint = (t: string) => `…${t.slice(-4)}`;
