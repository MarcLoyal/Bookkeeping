-- ============================================================================
-- Keep.Books — password reset support.
--
-- Applied by db/migrate.ts, tracked in _sql_migrations_applied so re-running
-- db:migrate against an already-migrated database only applies this once.
-- ============================================================================

ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
-- Deliberately NO policies: keepbooks_app gets table-level GRANTs from
-- 001's blanket grant, but RLS with zero policies denies every row to every
-- non-owner role regardless. Only the schema-owning connection
-- (db/authClient.ts, used by lib/auth/password-reset.ts) can ever read or
-- write this table — the same pattern login.ts already uses to look up a
-- user by email before a session exists.
