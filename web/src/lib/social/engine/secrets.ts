import "server-only";
import { open, seal, tokenHint } from "@shared/social/crypto";
import { sb } from "./db";

// Chaves de integração coladas no Studio (ex.: chave da IA), cifradas no schema privado.

export async function getSecret(name: string): Promise<string | null> {
  const { data } = await sb().rpc("social_secret_get", { p_name: name });
  return data ? open(data as string) : null;
}

export async function putSecret(name: string, value: string | null, actor: string) {
  const { error } = await sb().rpc("social_secret_put", { p_name: name, p_cipher: value ? seal(value) : null, p_hint: value ? tokenHint(value) : null, p_actor: actor });
  if (error) throw new Error("Não foi possível salvar a chave.");
}

export async function anthropicKey() {
  return (await getSecret("anthropic_api_key").catch(() => null)) || process.env.ANTHROPIC_API_KEY || null;
}
