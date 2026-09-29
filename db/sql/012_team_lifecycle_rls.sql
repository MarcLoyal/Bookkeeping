-- ============================================================================
-- 012_team_lifecycle_rls.sql
--
-- Team page: per-client assignment editing + deactivate/reactivate, all
-- enforced here — not just by the app's form/buttons.
--
-- 1. users_update (001_functions_triggers_rls.sql) was firm_admin-only.
--    A Bookkeeper may now UPDATE a users row too, but ONLY an Encoder's,
--    and ONLY one the Bookkeeper can already reach (the same
--    app_accessible_client_ids()-via-assignment check uca_write already
--    uses for "their own clients"). A BEFORE UPDATE trigger further
--    restricts a Bookkeeper's update to the `active` column alone —
--    deactivate/reactivate, nothing else (no sneaking in a role or
--    access_scope change) — mirroring 009's
--    enforce_reviewer_status_only_update() column-diff pattern exactly.
--    Owner keeps its original, unconditional UPDATE.
--
-- 2. Two more BEFORE UPDATE triggers on `users`, unconditional on actor
--    role (these are firm-state invariants, not role permissions):
--      - enforce_no_self_deactivation(): nobody can flip their own
--        `active` to false. ("Owner can deactivate anyone except
--        themselves" — the Bookkeeper branch above can never reach an
--        Owner's own row anyway, since it requires role = 'encoder' on
--        the target, so this only ever actually fires for an Owner.)
--      - enforce_last_owner_stays_active(): a firm_admin row being
--        deactivated (or having its role changed away from firm_admin)
--        while active must not be the firm's last active one.
--
-- 3. user_client_assignments gets an audit_row_change() trigger, matching
--    every other RLS-protected table (users already had one) — closes
--    the one gap in "log every add, edit, deactivate and reactivate":
--    add/deactivate/reactivate are all `users` INSERT/UPDATE, already
--    covered by audit_users (001) with no change needed; "edit" (client
--    assignment changes) had nothing logging it at all until this.
-- ============================================================================

DROP POLICY users_update ON users;
CREATE POLICY users_update ON users FOR UPDATE
  USING (
    (app_current_role() = 'firm_admin' AND firm_id = app_current_firm_id())
    OR (
      app_current_role() = 'bookkeeper'
      AND firm_id = app_current_firm_id()
      AND role = 'encoder'
      AND EXISTS (
        SELECT 1 FROM user_client_assignments a
        WHERE a.user_id = users.id AND a.client_id IN (SELECT app_accessible_client_ids())
      )
    )
  );

CREATE OR REPLACE FUNCTION enforce_bookkeeper_users_active_only_update() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF app_current_role() = 'bookkeeper' THEN
    IF NEW.email IS DISTINCT FROM OLD.email
      OR NEW.name IS DISTINCT FROM OLD.name
      OR NEW.role IS DISTINCT FROM OLD.role
      OR NEW.access_scope IS DISTINCT FROM OLD.access_scope
      OR NEW.firm_id IS DISTINCT FROM OLD.firm_id
      OR NEW.client_id IS DISTINCT FROM OLD.client_id
      OR NEW.signup_method IS DISTINCT FROM OLD.signup_method
    THEN
      RAISE EXCEPTION 'Bookkeepers may only deactivate/reactivate (active) — not edit other fields.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_bookkeeper_active_only
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION enforce_bookkeeper_users_active_only_update();

CREATE OR REPLACE FUNCTION enforce_no_self_deactivation() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id = app_current_user_id() AND OLD.active = true AND NEW.active = false THEN
    RAISE EXCEPTION 'You cannot deactivate your own account.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_no_self_deactivation
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION enforce_no_self_deactivation();

CREATE OR REPLACE FUNCTION enforce_last_owner_stays_active() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  other_active_owners integer;
BEGIN
  IF OLD.role = 'firm_admin' AND OLD.active = true AND (NEW.active = false OR NEW.role IS DISTINCT FROM OLD.role) THEN
    SELECT count(*) INTO other_active_owners
    FROM users
    WHERE firm_id = OLD.firm_id AND role = 'firm_admin' AND active = true AND id != OLD.id;
    IF other_active_owners = 0 THEN
      RAISE EXCEPTION 'A firm must always have at least one active Owner.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_last_owner_stays_active
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION enforce_last_owner_stays_active();

CREATE TRIGGER audit_user_client_assignments AFTER INSERT OR UPDATE OR DELETE ON user_client_assignments FOR EACH ROW EXECUTE FUNCTION audit_row_change();
