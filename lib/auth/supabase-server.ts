import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}

/**
 * Request-scoped Supabase client for Server Components/Actions/Route
 * Handlers, following Supabase's own documented Next.js App Router
 * pattern. Reads/writes Supabase's own session cookies directly — this
 * replaces the old lib/auth/session.ts, which no longer exists.
 *
 * setAll() can throw when called from a Server Component (which can read
 * cookies but not write them) — safe to swallow, since middleware.ts
 * refreshes the session cookie on every request regardless.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component — no-op, see doc comment above.
        }
      },
    },
  });
}
