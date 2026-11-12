import "server-only";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";

// Cofre do Studio: tokens e chaves são cifrados aqui (AES-256-GCM) antes de ir ao banco.
// A chave de cifra existe só na variável STUDIO_ENCRYPTION_KEY do servidor; o banco
// guarda apenas "v1:iv:tag:dados" e nenhum valor volta ao navegador.

function key() {
  const raw = process.env.STUDIO_ENCRYPTION_KEY;
  if (!raw || raw.length < 32) throw new Error("STUDIO_ENCRYPTION_KEY não configurada no servidor.");
  return crypto.createHash("sha256").update(raw).digest();
}

export function encrypt(plain: string, aad: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(aad));
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

export function decrypt(payload: string, aad: string) {
  const [v, iv, tag, data] = payload.split(":");
  if (v !== "v1") throw new Error("Formato cifrado desconhecido.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

export const hint = (value: string) => `…${value.slice(-4)}`;

export const vaultReady = () => Boolean(process.env.STUDIO_ENCRYPTION_KEY && process.env.SUPABASE_SECRET_KEY);

/** Segredo de integração (ex.: chave da Anthropic). O AAD amarra o texto cifrado ao nome. */
export async function readSecret(name: string): Promise<string | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin.from("studio_secrets").select("ciphertext").eq("name", name).maybeSingle();
  if (!data) return null;
  return decrypt(data.ciphertext, `secret:${name}`);
}

export async function writeSecret(name: string, value: string, userId: string) {
  const admin = createAdminClient();
  if (!admin) throw new Error("SUPABASE_SECRET_KEY não configurada.");
  const { error } = await admin
    .from("studio_secrets")
    .upsert({ name, ciphertext: encrypt(value, `secret:${name}`), hint: hint(value), updated_at: new Date().toISOString(), updated_by: userId });
  if (error) throw new Error("Não foi possível salvar o segredo.");
}

export async function deleteSecret(name: string) {
  const admin = createAdminClient();
  await admin?.from("studio_secrets").delete().eq("name", name);
}
