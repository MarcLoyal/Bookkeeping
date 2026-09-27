import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/forgot-password", "/reset-password", "/auth/confirm"];

export async function middleware(request: NextRequest) {
  // Supabase's documented Next.js middleware pattern: the response object
  // has to be recreated whenever cookies are set, so both the request (for
  // this middleware's own use below) and the response (for the browser)
  // stay in sync — see https://supabase.com/docs/guides/auth/server-side/nextjs.
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
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
