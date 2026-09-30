import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/signup", "/forgot-password", "/reset-password", "/auth/confirm", "/auth/callback", "/pricing", "/faq"];

export async function middleware(request: NextRequest) {
  // Supabase's documented Next.js middleware pattern: the response object
  // has to be recreated whenever cookies are set, so both the request (for
  // this middleware's own use below) and the response (for the browser)
  // stay in sync — see https://supabase.com/docs/guides/auth/server-side/nextjs.
  let supabaseResponse = NextResponse.next({ request });

  // Read as static literal expressions, not through a requireEnv(name)
  // helper: middleware runs in the Edge runtime, where — like the browser
  // (see lib/auth/supabase-browser.ts) — NEXT_PUBLIC_* values are injected
  // at build time via static text substitution keyed on the exact
  // `process.env.NEXT_PUBLIC_X` expression appearing directly in source.
  // An earlier version of this file used requireEnv("NEXT_PUBLIC_...")
  // (process.env[name] with a variable key) specifically to make a missing
  // var's error message clearer — that inadvertently broke the static
  // analysis Next.js needs to inline the value here at all, turning a
  // clear error into every request 500ing even with the var correctly set
  // in Vercel. Confirmed live by inspecting a real build's compiled output.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set.");
  if (!supabaseAnonKey) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set.");

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
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
