-- Rollback for 012_team_lifecycle_rls.sql — restores users_update to
-- firm_admin-only (010_bookkeeper_add_encoder_rls.sql's own rollback
-- already covers users_insert/uca_write, untouched by 012), drops the
-- three new users triggers and the user_client_assignments audit
-- trigger. Deliberately in db/rollback/, not db/sql/ — see
-- 009_team_roles_rls.sql's rollback for why db:migrate's directory scan
-- makes that unsafe (same reasoning, same repo).
--
-- After running this, also remove '012_team_lifecycle_rls.sql' from
-- _sql_migrations_applied so a future `pnpm db:migrate` will re-apply it
-- if desired:
--   delete from _sql_migrations_applied where filename = '012_team_lifecycle_rls.sql';

DROP TRIGGER IF EXISTS audit_user_client_assignments ON user_client_assignments;

DROP TRIGGER IF EXISTS users_last_owner_stays_active ON users;
DROP FUNCTION IF EXISTS enforce_last_owner_stays_active();

DROP TRIGGER IF EXISTS users_no_self_deactivation ON users;
DROP FUNCTION IF EXISTS enforce_no_self_deactivation();

DROP TRIGGER IF EXISTS users_bookkeeper_active_only ON users;
DROP FUNCTION IF EXISTS enforce_bookkeeper_users_active_only_update();

DROP POLICY IF EXISTS users_update ON users;
CREATE POLICY users_update ON users FOR UPDATE
  USING (app_current_role() = 'firm_admin' AND firm_id = app_current_firm_id());
