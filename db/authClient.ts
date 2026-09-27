import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * A privileged, RLS-bypassing connection reserved for auth flows that must
 * act before any session/tenant RLS context exists — currently:
 * lib/auth/login.ts (looking a user up by email to attribute a failed
 * attempt), lib/auth/password-reset.ts (the PASSWORD_RESET audit row),
 * and lib/auth/signup.ts (creating a brand-new firm + its first
 * firm_admin — circular to gate behind RLS's `users_insert` policy, which
 * requires an *existing* firm_admin to already be acting, for a firm that
 * by definition has no users yet).
 *
 * Do NOT import this for anything else. Every other query must go through
 * db/client.ts's withUserContext() so RLS is enforced.
 */
const connectionString = process.env.MIGRATION_DATABASE_URL;
if (!connectionString) {
  throw new Error("MIGRATION_DATABASE_URL is not set.");
}

// prepare: false — see db/client.ts; Supabase's pooler can serve stale
// results from a server-side prepared statement, which would be a bad way
// to find that out on the login path.
const authQueryClient = postgres(connectionString, { max: 2, prepare: false });
export const authDb = drizzle(authQueryClient, { schema });
