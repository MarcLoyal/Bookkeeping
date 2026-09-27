"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/auth/supabase-browser";

/**
 * Shared by both /login and /signup — signInWithOAuth() doesn't distinguish
 * the two: Supabase creates the Google identity if it's new or signs in an
 * existing one either way. app/auth/callback/route.ts is what decides
 * afterward whether this is a returning user or needs the "name your firm"
 * onboarding step.
 */
export function GoogleSignInButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setError(null);
    // Wrapped in try/catch: createSupabaseBrowserClient() can throw
    // synchronously (e.g. a missing NEXT_PUBLIC_SUPABASE_URL — reported
    // live as the button hanging on "Redirecting to Google..." forever,
    // with only a console-only unhandled promise rejection and no visible
    // error, since nothing here caught it to reset `pending`). Any failure
    // now surfaces on the page and un-sticks the button.
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) {
        setError(error.message);
        setPending(false);
      }
      // On success the browser is redirected to Google — nothing more to do here.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setPending(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4">
          <path
            fill="#4285F4"
            d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.46a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.58-5.17 3.58-8.81Z"
          />
          <path
            fill="#34A853"
            d="M12 24c3.24 0 5.96-1.07 7.94-2.92l-3.88-3c-1.08.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.94H1.28v3.1A11.998 11.998 0 0 0 12 24Z"
          />
          <path
            fill="#FBBC05"
            d="M5.29 14.29a7.2 7.2 0 0 1 0-4.58v-3.1H1.28a12 12 0 0 0 0 10.78l4.01-3.1Z"
          />
          <path
            fill="#EA4335"
            d="M12 4.75c1.76 0 3.34.61 4.59 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.69 1.28 6.61l4.01 3.1C6.23 6.86 8.88 4.75 12 4.75Z"
          />
        </svg>
        {pending ? "Redirecting to Google..." : "Continue with Google"}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
