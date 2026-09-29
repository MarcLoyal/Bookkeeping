import type { NextConfig } from "next";

// Fail loudly at build/dev-server/start time if DATABASE_URL is missing,
// rather than only discovering it on the first request that happens to
// import db/client.ts (which already throws too — this just moves the
// same check somewhere impossible to miss). Next.js loads .env.local
// before evaluating this file, so process.env.DATABASE_URL is already
// populated here in local dev.
//
// This is deliberately scoped to DATABASE_URL only, not a general env
// validator — it exists because a real deployment was observed serving
// requests with DATABASE_URL unset locally while some other DATABASE_URL
// (of unknown origin — likely a hosting platform's own Postgres/Supabase
// integration auto-injecting one) was silently used instead. A presence
// check can't tell "auto-injected value that happens to be wrong" from
// "correctly configured" — it only catches the case where the variable
// is genuinely absent. See DECISIONS.md for the live investigation this
// came out of, and confirm DATABASE_URL's role is keepbooks_app (not an
// auto-injected default) wherever this app actually runs.
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env.local (locally) or set it in your " +
      "hosting provider's environment variables (deployed) — see README.md for how to obtain " +
      "the keepbooks_app connection string."
  );
}

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
