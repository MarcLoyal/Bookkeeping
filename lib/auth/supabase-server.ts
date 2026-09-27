import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Request-scoped Supabase client for Server Components/Actions/Route
 * Handlers, following Supabase's own documented Next.js App Router
 * pattern. Reads/writes Supabase's own session cookies directly — this
 * replaces the old lib/auth/session.ts, which no longer exists.
 *
 * setAll() can throw when called from a Server Component (which can read
 * cookies but not write them) — safe to swallow, since middleware.ts
 * refreshes the session cookie on every request regardless.
 *
 * process.env.NEXT_PUBLIC_* is read as static literal expressions here,
 * not through a requireEnv(name) helper taking the var name as a
 * parameter — kept consistent with lib/auth/supabase-browser.ts and
 * middleware.ts even though this file's Node.js runtime doesn't strictly
 * need it (see supabase-browser.ts's doc comment for why the other two
 * do): a requireEnv(name) helper that reads process.env[name] is a real
 * footgun that's already caused two live bugs elsewhere in this app when
 * copied into an Edge Runtime / browser context, so it's not kept around
 * here either, static-only runtime or not.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set.");
  if (!anonKey) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set.");

  return createServerClient(url, anonKey, {
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
