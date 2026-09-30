import "server-only";
import { sql } from "drizzle-orm";
import { withUserContext } from "@/db/client";

export type DbConnectionDiagnostic = {
  currentUser: string;
  isSuperuser: boolean;
  bypassesRls: boolean;
  clientsRlsEnabled: boolean;
  usersRlsEnabled: boolean;
};

const EXPECTED_ROLE = "keepbooks_app";

/**
 * TEMPORARY — see app/(app)/settings/platform-admins/db-check/page.tsx.
 * Answers, against the app's own normal DATABASE_URL connection (not
 * MIGRATION_DATABASE_URL): which role is this app actually running
 * queries as, and does that role bypass RLS. Remove both this file and
 * that page once confirmed.
 *
 * clients_rls_enabled/users_rls_enabled MUST resolve via
 * to_regclass('public.<table>') — pg_class.relname alone isn't
 * schema-qualified, and a real Supabase project has auth.users
 * alongside our public.users; matching bare `relname = 'users'`
 * returns 2 rows there and the whole query throws "more than one row
 * returned by a subquery used as an expression" (reproduced locally
 * by adding a throwaway auth.users table). Never seen locally
 * otherwise, since this sandbox's Postgres has no auth schema at all.
 */
export async function getDbConnectionDiagnostic(currentAdminId: string): Promise<DbConnectionDiagnostic> {
  return withUserContext(currentAdminId, async (tx) => {
    const [row] = (await tx.execute(sql`
      select
        current_user as current_user,
        (select rolsuper from pg_roles where rolname = current_user) as is_superuser,
        (select rolbypassrls from pg_roles where rolname = current_user) as bypasses_rls,
        (select relrowsecurity from pg_class where oid = to_regclass('public.clients')) as clients_rls_enabled,
        (select relrowsecurity from pg_class where oid = to_regclass('public.users')) as users_rls_enabled
    `)) as unknown as {
      current_user: string;
      is_superuser: boolean;
      bypasses_rls: boolean;
      clients_rls_enabled: boolean;
      users_rls_enabled: boolean;
    }[];

    return {
      currentUser: row.current_user,
      isSuperuser: row.is_superuser,
      bypassesRls: row.bypasses_rls,
      clientsRlsEnabled: row.clients_rls_enabled,
      usersRlsEnabled: row.users_rls_enabled,
    };
  });
}

export function isDiagnosticHealthy(d: DbConnectionDiagnostic): boolean {
  return d.currentUser === EXPECTED_ROLE && !d.isSuperuser && !d.bypassesRls && d.clientsRlsEnabled && d.usersRlsEnabled;
}

export { EXPECTED_ROLE };
