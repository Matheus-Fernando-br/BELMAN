import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient as createJsClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { cookieOptions, supabaseEnv } from "./config";

/** Request-scoped client acting as the signed-in user (RLS applies). */
export async function createClient() {
  const env = supabaseEnv();
  if (!env) throw new Error("Studio indisponível: SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY não configuradas.");
  const store = await cookies();
  return createServerClient(env.url, env.key, {
    cookieOptions,
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, { ...options, ...cookieOptions }));
        } catch {
          // Called from a Server Component: the proxy refreshes the cookies instead.
        }
      },
    },
  });
}

/** Privileged client (bypasses RLS). Only for Auth admin tasks such as invitations. */
export function createAdminClient() {
  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) return null;
  return createJsClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}
