import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { cookieOptions, supabaseEnv } from "@/lib/supabase/config";

// Studio pages that work without a session.
const PUBLIC_STUDIO = ["/studio/login", "/studio/esqueci-senha", "/studio/auth/callback"];

/**
 * Runs before every /studio request: refreshes the Supabase session cookies and
 * sends anyone without a valid session to the login page. Authorization (role,
 * active profile, MFA) is enforced again in the Studio layout and in the database.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isPublic = PUBLIC_STUDIO.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  let response = NextResponse.next({ request });

  const env = supabaseEnv();
  if (env) {
    const supabase = createServerClient(env.url, env.key, {
      cookieOptions,
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list, headers) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, { ...options, ...cookieOptions }));
          Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
        },
      },
    });
    const { data } = await supabase.auth.getClaims();
    if (!data?.claims && !isPublic) {
      const url = request.nextUrl.clone();
      url.pathname = "/studio/login";
      url.search = pathname !== "/studio" ? `?next=${encodeURIComponent(pathname + search)}` : "";
      response = NextResponse.redirect(url);
    }
  } else if (!isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/studio/login";
    url.search = "";
    response = NextResponse.redirect(url);
  }

  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/studio", "/studio/:path*"],
};
