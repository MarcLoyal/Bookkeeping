import { createBrowserClient } from "@supabase/ssr";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}

/**
 * Browser-side Supabase client. Only needed for signInWithOAuth(), which
 * has to run client-side to redirect the browser itself to Google — every
 * other auth flow in this app (password login, signup, reset) posts to a
 * Server Action instead and never needs this.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"));
}
