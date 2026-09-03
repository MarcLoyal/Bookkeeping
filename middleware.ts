import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "kb_session";
const PUBLIC_PATHS = ["/login", "/forgot-password", "/reset-password"];

async function hasValidSession(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return false;
  const secret = process.env.AUTH_SECRET;
  if (!secret) return false;
  try {
    await jwtVerify(token, new TextEncoder().encode(secret));
    return true;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const authed = await hasValidSession(request);

  if (!authed && !isPublic) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Deliberately does NOT redirect an "authed" user away from /login here:
  // this check only verifies the JWT signature/expiry, not tokenVersion
  // (no DB access at the Edge — see hasValidSession). A session invalidated
  // by a password reset still passes this check, and redirecting it back to
  // /dashboard would fight that page's own (DB-backed) redirect to /login,
  // looping forever. app/login/page.tsx already redirects logged-in users
  // to /dashboard itself, using the full check — this would be redundant
  // even where it's safe.

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
