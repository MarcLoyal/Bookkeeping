import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * A privileged, RLS-bypassing connection reserved EXCLUSIVELY for the login
 * credential lookup (see lib/auth/login.ts). Real Supabase Auth lives in a
 * separate `auth` schema outside application RLS for the same reason: you
 * cannot look up a user by email to check their password under a policy
 * that requires you to already be that user. This sandbox dev auth shim
 * reuses the schema-owning connection to play that role.
 *
 * Do NOT import this anywhere else. Every other query must go through
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
