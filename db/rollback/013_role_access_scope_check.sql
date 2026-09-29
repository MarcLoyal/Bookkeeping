-- Rollback for 013_role_access_scope_check.sql — drops the CHECK
-- constraint. Deliberately in db/rollback/, not db/sql/ — see
-- 009_team_roles_rls.sql's rollback for why db:migrate's directory scan
-- makes that unsafe (same reasoning, same repo).
--
-- The two backfills (existing encoder/reviewer/viewer rows corrected to
-- 'assigned'; encoder@keepbooks.demo granted its two demo clients) are
-- NOT reverted — there's no prior correct value to restore a bugged
-- 'all' row to, and the demo client grants are harmless to leave in
-- place even without the constraint requiring them.
--
-- After running this, also remove '013_role_access_scope_check.sql'
-- from _sql_migrations_applied so a future `pnpm db:migrate` will
-- re-apply it if desired:
--   delete from _sql_migrations_applied where filename = '013_role_access_scope_check.sql';

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_access_scope_role_check;
