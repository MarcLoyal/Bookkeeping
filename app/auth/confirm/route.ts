import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/auth/supabase-server";

/**
 * Where Supabase Auth's password-reset (and, later, any other) email links
 * land — see lib/auth/password-reset.ts's resetPasswordForEmail() call.
 * Exchanges the emailed token for a real Supabase session (establishing it
 * via cookies, same as a normal sign-in), then redirects on to wherever the
 * flow actually continues. Supabase's own documented Next.js App Router
 * pattern — see https://supabase.com/docs/guides/auth/server-side/nextjs.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";

  if (tokenHash && type) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      redirect(next);
    }
  }

  redirect("/login?reset_error=1");
}
