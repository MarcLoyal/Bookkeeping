-- ============================================================================
-- 017_lock_down_migrations_tracking_table.sql
--
-- _sql_migrations_applied (db/migrate.ts) tracks which hand-authored SQL
-- files have run — internal bookkeeping for the migration runner itself,
-- never something the app's own runtime queries have any reason to read
-- or write. It's created ad-hoc inside migrate.ts (`create table if not
-- exists`), not via drizzle's schema, so it was never covered by any
-- db/sql/*.sql file's own RLS setup the way every real app table is.
--
-- Checked live: keepbooks_app currently has full INSERT/SELECT/UPDATE/
-- DELETE on it (inherited the same way user_client_views' did, before
-- 016 taught us not to assume that's actually locked down the way it
-- looks) and RLS was never enabled at all. Both closed here:
--
-- 1. ENABLE ROW LEVEL SECURITY with zero policies — the same
--    deliberately-empty-policy pattern password_reset_tokens uses
--    (002_password_reset.sql): with RLS on and no policy granting
--    anything, every role without BYPASSRLS (keepbooks_app, definitely;
--    keepbooks, the schema owner, is BYPASSRLS-equivalent by owning the
--    table, so its own migrate.ts writes are unaffected) sees zero rows
--    and can write none, regardless of table-level GRANTs.
-- 2. REVOKE the table-level grants explicitly too, rather than relying on
--    RLS alone — belt-and-suspenders, same reasoning
--    016_user_client_views_grant.sql's own comment gives for preferring
--    explicit over implicit: it costs nothing and removes a whole class
--    of "but is RLS actually configured correctly" doubt for a table
--    that should simply be unreachable from the app entirely.
-- ============================================================================

ALTER TABLE _sql_migrations_applied ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, SELECT, UPDATE, DELETE ON _sql_migrations_applied FROM keepbooks_app;
