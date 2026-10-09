-- ============================================================================
-- 024_legal_acceptances_rls.sql
--
-- legal_acceptances (table created by drizzle-kit's own migration,
-- db/migrations/0012_graceful_squadron_sinister.sql — that migration
-- only creates the table; every other table in this app gets its RLS
-- from a hand-authored file here, and this one is no different).
--
-- Append-only, self-scoped: a user can insert and read only their own
-- acceptance rows, never anyone else's, and never updates or deletes one
-- — same immutability reasoning as audit_log (no UPDATE/DELETE policy
-- exists for that table either). No explicit GRANT needed here:
-- db/migrate.ts re-runs `GRANT ... ON ALL TABLES IN SCHEMA public TO
-- keepbooks_app` unconditionally on every invocation (see the fix in
-- "Root cause found: DATABASE_URL connecting as postgres" in
-- DECISIONS.md) — this table gets it automatically the next time
-- anyone runs db:migrate, closing exactly the class of bug 016 and 022
-- each had to patch by hand, one table at a time.
-- ============================================================================

ALTER TABLE legal_acceptances ENABLE ROW LEVEL SECURITY;

CREATE POLICY legal_acceptances_select ON legal_acceptances FOR SELECT
  USING (user_id = app_current_user_id());

CREATE POLICY legal_acceptances_insert ON legal_acceptances FOR INSERT
  WITH CHECK (user_id = app_current_user_id());
