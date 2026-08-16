import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and configure it.");
}

// One pooled connection for app queries. RLS is enforced per-request via
// withUserContext() below, which sets the session-local app.current_user_id
// that our RLS policies read (see db/sql/001_functions_triggers_rls.sql).
const queryClient = postgres(connectionString, { max: 10 });

export const db = drizzle(queryClient, { schema });

export type Db = typeof db;

/**
 * Runs `fn` inside a transaction with the app-level session variables RLS
 * policies depend on. Every request-scoped query MUST go through this (or
 * a nested call within one) — a bare `db.select()` outside of it runs
 * against whatever role Postgres defaults to and either sees nothing (if
 * RLS is on with no policy match) or — if ever run as a superuser — sees
 * everything, so never reach for it as a shortcut.
 */
export async function withUserContext<T>(
  userId: string | null,
  fn: (tx: Db) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    // set_config(..., true) = transaction-local, cleared automatically at commit/rollback
    await tx.execute(sql`select set_config('app.current_user_id', ${userId ?? ""}, true)`);
    return fn(tx as unknown as Db);
  });
}
