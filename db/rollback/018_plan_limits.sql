-- Rollback for 018_plan_limits.sql — removes the three plan-limit
-- enforcement triggers. Deliberately in db/rollback/, not db/sql/ — see
-- 009_team_roles_rls.sql's rollback for why db:migrate's directory scan
-- makes that unsafe (same reasoning, same repo).
--
-- Does NOT revert the trial_ends_at backfill (there's no prior value to
-- restore to) and does NOT touch db/schema/firms.ts's new columns —
-- those need a separate schema rollback if this ever needs fully undoing,
-- not just the enforcement layer.
--
-- After running this, also remove '018_plan_limits.sql' from
-- _sql_migrations_applied so a future `pnpm db:migrate` will re-apply it
-- if desired:
--   delete from _sql_migrations_applied where filename = '018_plan_limits.sql';

DROP TRIGGER IF EXISTS users_enforce_per_client_assignment_allowed ON users;
DROP FUNCTION IF EXISTS enforce_per_client_assignment_allowed();

DROP TRIGGER IF EXISTS users_enforce_plan_limit ON users;
DROP FUNCTION IF EXISTS enforce_user_plan_limit();

DROP TRIGGER IF EXISTS clients_enforce_plan_limit ON clients;
DROP FUNCTION IF EXISTS enforce_client_plan_limit();
