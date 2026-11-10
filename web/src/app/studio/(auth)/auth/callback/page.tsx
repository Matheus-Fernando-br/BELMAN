"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { completeEmailLink } from "../../actions";

// Landing page for links sent by e-mail (invite and password recovery).
// Tokens may arrive in the URL fragment, which only the browser can read;
// they are handed to the server, which stores the session in httpOnly cookies.
export default function AuthCallbackPage() {
  const router = useRouter();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.slice(1));
    // Clear tokens from the address bar and history right away.
    window.history.replaceState(null, "", window.location.pathname);

    const type = hash.get("type") ?? query.get("type");
    const fallbackNext = type === "invite" || type === "recovery" ? "/studio/definir-senha" : "/studio";
    completeEmailLink({
      code: query.get("code") ?? undefined,
      accessToken: hash.get("access_token") ?? undefined,
      refreshToken: hash.get("refresh_token") ?? undefined,
      next: query.get("next") ?? fallbackNext,
    }).then(({ ok, next }) => router.replace(ok ? next : "/studio/login?erro=link"));
  }, [router]);

  return (
    <div role="status">
      <h1>Validando seu acesso…</h1>
      <p>Só um instante.</p>
    </div>
  );
}
