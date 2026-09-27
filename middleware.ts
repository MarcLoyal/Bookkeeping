import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/signup", "/forgot-password", "/reset-password", "/auth/confirm", "/auth/callback"];

// Not shared with lib/auth/supabase-server.ts's requireEnv(): that module is
// guarded by "server-only", and middleware runs in a separate Edge runtime
// from the rest of the app, so this stays self-contained rather than
// crossing that boundary for a two-line helper. Reported live: without
// this, a missing env var here surfaced only as Supabase's own generic
// "Your project's URL and Key are required to create a Supabase client."
// (MIDDLEWARE_INVOCATION_FAILED, 500 on every route) — which doesn't name
// which var is actually missing. This doesn't fix a genuinely missing var,
// but makes the runtime log say exactly which one it is.
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}

export async function middleware(request: NextRequest) {
  // Supabase's documented Next.js middleware pattern: the response object
  // has to be recreated whenever cookies are set, so both the request (for
  // this middleware's own use below) and the response (for the browser)
  // stay in sync — see https://supabase.com/docs/guides/auth/server-side/nextjs.
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
      },
    },
  });

  // Refreshes the session token when it's expired — required per Supabase's
  // own guidance; skipping this causes sessions to silently, intermittently
  // drop mid-use rather than failing predictably.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!user && !isPublic) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Deliberately does NOT redirect an "authed" user away from /login here:
  // app/login/page.tsx already redirects logged-in users to /dashboard
  // itself, and doing it here too would risk fighting a mid-flow recovery
  // session on /reset-password (which also resolves to a real `user` here).

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
