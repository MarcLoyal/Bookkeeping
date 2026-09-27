import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client. Only needed for signInWithOAuth(), which
 * has to run client-side to redirect the browser itself to Google — every
 * other auth flow in this app (password login, signup, reset) posts to a
 * Server Action instead and never needs this.
 *
 * process.env.NEXT_PUBLIC_* is read as static literal expressions here,
 * not through a requireEnv(name) helper taking the var name as a
 * parameter: Next.js's NEXT_PUBLIC_* build-time inlining is a static text
 * substitution keyed on the exact `process.env.NEXT_PUBLIC_X` expression
 * appearing directly in source. process.env[name] with a variable key
 * can't be statically resolved, so it silently never gets replaced and
 * evaluates to undefined in the browser at runtime — reproduced live
 * (DECISIONS.md) and confirmed by inspecting a real build's compiled
 * output: the shipped bundle contained the var's *name* as an inert
 * string argument, never its actual configured value.
 */
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set.");
  if (!anonKey) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set.");
  return createBrowserClient(url, anonKey);
}
