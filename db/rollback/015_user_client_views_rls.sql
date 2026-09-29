-- Rollback for 015_user_client_views_rls.sql — drops the RLS policy.
-- Deliberately in db/rollback/, not db/sql/ — see 009_team_roles_rls.sql's
-- rollback for why db:migrate's directory scan makes that unsafe (same
-- reasoning, same repo).
--
-- Does NOT disable RLS on the table or drop the table itself — that's
-- db/migrations/0008_dapper_gideon.sql's concern (the drizzle-kit
-- migration that created it), not this hand-authored file's.
--
-- After running this, also remove '015_user_client_views_rls.sql' from
-- _sql_migrations_applied so a future `pnpm db:migrate` will re-apply it
-- if desired:
--   delete from _sql_migrations_applied where filename = '015_user_client_views_rls.sql';

DROP POLICY IF EXISTS user_client_views_own_rows ON user_client_views;
