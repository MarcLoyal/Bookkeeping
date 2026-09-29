-- Rollback for 017_lock_down_migrations_tracking_table.sql — restores
-- keepbooks_app's prior access to _sql_migrations_applied. Deliberately in
-- db/rollback/, not db/sql/ — see 009_team_roles_rls.sql's rollback for
-- why db:migrate's directory scan makes that unsafe (same reasoning, same
-- repo).
--
-- There's no legitimate reason the app's runtime role should ever need
-- this again — only run this if something you're debugging genuinely
-- requires the app connection to read migration history directly.
--
-- After running this, also remove
-- '017_lock_down_migrations_tracking_table.sql' from
-- _sql_migrations_applied so a future `pnpm db:migrate` will re-apply it
-- if desired:
--   delete from _sql_migrations_applied where filename = '017_lock_down_migrations_tracking_table.sql';

GRANT INSERT, SELECT, UPDATE, DELETE ON _sql_migrations_applied TO keepbooks_app;
ALTER TABLE _sql_migrations_applied DISABLE ROW LEVEL SECURITY;
