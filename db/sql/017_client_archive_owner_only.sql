-- ============================================================================
-- 017_client_archive_owner_only.sql
--
-- "Delete" a client → archive it instead, keeping every BIR-relevant row
-- (journal_entries, audit_log, etc.) intact forever — client_id FKs are
-- already ON DELETE RESTRICT, and there was never a DELETE code path in
-- the app anyway (009_team_roles_rls.sql's own comment already noted "no
-- UI, no API route, no data-layer function" when clients_delete was added
-- defensively). Closing the loop now that archive is the real feature:
--
-- 1. DROP the clients_delete policy entirely. No role should be able to
--    delete a client through the app's connection, Owner included — the
--    Owner-only DELETE policy existed only to avoid an accidental silent
--    "denied to everyone" default; now that there's a real, intentional
--    Owner-only path (archive), an actual DELETE grant serves no purpose
--    and is one less way to ever lose BIR history.
--
-- 2. A BEFORE UPDATE trigger restricting `status` transitions into or out
--    of 'archived' to firm_admin only. clients_update
--    (009_team_roles_rls.sql) is intentionally broader than that — Owner
--    *and* Bookkeeper can edit a client's ordinary fields, including
--    moving `status` between 'onboarding'/'active'/'inactive' — so this
--    can't be a blanket "status is firm_admin-only" rule. It only fires
--    when the transition actually touches 'archived' on either side,
--    mirroring the exact column/value-diff trigger pattern
--    enforce_bookkeeper_users_active_only_update()
--    (012_team_lifecycle_rls.sql) already established for restricting a
--    broader UPDATE policy to a narrower one.
-- ============================================================================

DROP POLICY clients_delete ON clients;

CREATE OR REPLACE FUNCTION enforce_client_archive_owner_only() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
    AND (NEW.status = 'archived' OR OLD.status = 'archived')
    AND app_current_role() != 'firm_admin'
  THEN
    RAISE EXCEPTION 'Only an Owner can archive or reactivate a client.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER clients_archive_owner_only
BEFORE UPDATE ON clients
FOR EACH ROW EXECUTE FUNCTION enforce_client_archive_owner_only();
