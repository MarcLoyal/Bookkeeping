-- Rollback for 010_bookkeeper_add_encoder_rls.sql — restores users_insert
-- and uca_write to firm_admin-only, exactly as 001_functions_triggers_rls.sql
-- defined them. Deliberately in db/rollback/, not db/sql/ — see
-- 009_team_roles_rls.sql's rollback for why db:migrate's directory scan
-- makes that unsafe (same reasoning, same repo).
--
-- After running this, also remove '010_bookkeeper_add_encoder_rls.sql' from
-- _sql_migrations_applied so a future `pnpm db:migrate` will re-apply it if
-- desired:
--   delete from _sql_migrations_applied where filename = '010_bookkeeper_add_encoder_rls.sql';

DROP POLICY IF EXISTS users_insert ON users;
CREATE POLICY users_insert ON users FOR INSERT
  WITH CHECK (app_current_role() = 'firm_admin' AND firm_id = app_current_firm_id());

DROP POLICY IF EXISTS uca_write ON user_client_assignments;
CREATE POLICY uca_write ON user_client_assignments FOR ALL
  USING (app_current_role() = 'firm_admin')
  WITH CHECK (app_current_role() = 'firm_admin');
