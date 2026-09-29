-- Rollback for 017_client_archive_owner_only.sql — removes the
-- archive-transition trigger and restores the Owner-only clients_delete
-- policy. Deliberately in db/rollback/, not db/sql/ — see
-- 009_team_roles_rls.sql's rollback for why db:migrate's directory scan
-- makes that unsafe (same reasoning, same repo).
--
-- Restoring clients_delete does not restore any client DELETE UI/API/
-- data-layer code — none existed before 017 either. It only re-widens
-- what the RLS layer itself would allow if that code were ever added
-- back.
--
-- After running this, also remove '017_client_archive_owner_only.sql'
-- from _sql_migrations_applied so a future `pnpm db:migrate` will
-- re-apply it if desired:
--   delete from _sql_migrations_applied where filename = '017_client_archive_owner_only.sql';

DROP TRIGGER IF EXISTS clients_archive_owner_only ON clients;
DROP FUNCTION IF EXISTS enforce_client_archive_owner_only();

CREATE POLICY clients_delete ON clients FOR DELETE
  USING (app_current_role() = 'firm_admin' AND id IN (SELECT app_accessible_client_ids()));
