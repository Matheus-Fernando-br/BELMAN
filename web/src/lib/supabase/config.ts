// Supabase is only ever used on the server: these variables have no NEXT_PUBLIC_
// prefix, so they never reach the browser bundle.

export const SESSION_MAX_AGE = 12 * 60 * 60; // 12 h: after that the user signs in again.

export function supabaseEnv() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return { url, key };
}

export const cookieOptions = {
  maxAge: SESSION_MAX_AGE,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  httpOnly: true,
  path: "/",
};
