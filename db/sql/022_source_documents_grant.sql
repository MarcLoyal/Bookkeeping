-- ============================================================================
-- 022_source_documents_grant.sql
--
-- Explicit GRANT for source_documents — proactive, not reactive this time:
-- 016_user_client_views_grant.sql already found (on the real Supabase
-- project, not this local sandbox) that a genuinely new table cannot be
-- trusted to inherit keepbooks_app's privileges from 001's ALTER DEFAULT
-- PRIVILEGES — that rule only applies to the one Postgres role that ran
-- it, and a real Supabase project can have more than one role in play
-- across the dashboard SQL editor / pooled connection / migration script.
-- Adding this explicitly now closes the same gap 016 had to fix after
-- the fact, before source_documents hits it too.
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON source_documents TO keepbooks_app;
