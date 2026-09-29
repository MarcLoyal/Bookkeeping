-- ============================================================================
-- 015_user_client_views_rls.sql
--
-- RLS for user_client_views (table created by drizzle-kit's own migration,
-- db/migrations/0008_dapper_gideon.sql — that migration only creates the
-- table; every other table in this app gets its RLS from a hand-authored
-- file here, and this one is no different).
--
-- One row per (user, client) ever visited, upserted by
-- lib/data/clients.ts's recordClientView() on every page load under
-- /clients/[id] (app/(app)/clients/[id]/layout.tsx) — the "recently viewed
-- or worked on" signal behind the sidebar's Recent Clients section, for
-- every role, including ones (Reviewer, Viewer) that never author a
-- journal entry and so would otherwise have no "recent" signal at all.
--
-- Purely self-scoped — a user reads and writes only their own view
-- records, never anyone else's, and the app never has any legitimate
-- reason to show one user whose clients another user recently opened. One
-- FOR ALL policy covers SELECT/UPDATE/DELETE identically via USING; WITH
-- CHECK additionally requires the target row's client to be one this
-- session can currently access (app_accessible_client_ids(), the same
-- function every other table's RLS already uses) — belt-and-suspenders,
-- since recordClientView() only ever runs after getClient() has already
-- confirmed access, but it costs nothing to also enforce it here rather
-- than trusting the caller.
--
-- No explicit GRANT here — 001_functions_triggers_rls.sql's
-- ALTER DEFAULT PRIVILEGES already covers every table created afterward
-- (same reason 002_password_reset.sql needed none for its own new table).
-- ============================================================================

ALTER TABLE user_client_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_client_views_own_rows ON user_client_views FOR ALL
  USING (user_id = app_current_user_id())
  WITH CHECK (
    user_id = app_current_user_id()
    AND client_id IN (SELECT app_accessible_client_ids())
  );
