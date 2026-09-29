-- Rollback for 016_user_client_views_grant.sql — revokes the explicit
-- grant. Deliberately in db/rollback/, not db/sql/ — see
-- 009_team_roles_rls.sql's rollback for why db:migrate's directory scan
-- makes that unsafe (same reasoning, same repo).
--
-- Reverting this brings back the exact symptom 016 fixed (keepbooks_app
-- silently unable to write to user_client_views) unless whatever implicit
-- grant 015 originally assumed does, in fact, apply on this database —
-- only run this if you've confirmed that separately.
--
-- After running this, also remove '016_user_client_views_grant.sql' from
-- _sql_migrations_applied so a future `pnpm db:migrate` will re-apply it
-- if desired:
--   delete from _sql_migrations_applied where filename = '016_user_client_views_grant.sql';

REVOKE SELECT, INSERT, UPDATE, DELETE ON user_client_views FROM keepbooks_app;
