import { NextResponse } from "next/server";
import { handleOAuthCallback } from "@/lib/auth/oauth-callback";

/**
 * PKCE callback for signInWithOAuth() (Google) — distinct from
 * app/auth/confirm/route.ts, which handles the email-link/OTP pattern
 * (password reset) via verifyOtp({token_hash}) instead of a `code`.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  // Only ever a same-origin relative path we generated ourselves
  // (GoogleSignInButton doesn't currently pass one, so this is always
  // "/dashboard" today) — never trust it as an absolute/external URL.
  const rawNext = searchParams.get("next") ?? "/dashboard";
  const next = rawNext.startsWith("/") ? rawNext : "/dashboard";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?oauth_error=1`);
  }

  const result = await handleOAuthCallback(code, next);
  return NextResponse.redirect(`${origin}${result.redirectTo}`);
}
