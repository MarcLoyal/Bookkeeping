-- ============================================================================
-- 018_plan_limits.sql
--
-- Trial & Plan Limits, foundation: DB-level enforcement of client/user
-- counts and per-client assignment, matching db/schema/firms.ts's new
-- plan/maxClients/maxUsers/perClientAssignmentAllowed columns and
-- lib/billing/plan-limits.ts's getPlanLimits(). "Enforced at the database
-- level, not just hidden in the UI" was explicit — the same numbers a
-- data-layer function would check for a friendly error message are
-- re-checked here as the real backstop, exactly like every other rule in
-- this app (last-active-Owner, journal balance, immutability, ...).
--
-- 1. Backfill: every firm that predates this migration gets a fresh
--    7-day trial starting today (not backdated to its own createdAt —
--    nobody should lose access the moment this ships) plus trial-tier
--    limits. Column-level DEFAULTs already cover plan/maxClients/
--    maxUsers/perClientAssignmentAllowed for existing rows; only
--    trial_ends_at needs an explicit UPDATE since it has no default.
--
-- 2. enforce_client_plan_limit(): blocks a clients INSERT, or an UPDATE
--    that moves a client INTO the counted set ('onboarding'/'active')
--    from outside it ('inactive'/'archived'), once the firm already has
--    max_clients rows counted. An ordinary edit to an already-active
--    client is untouched — the OLD.status check only re-fires the count
--    query when the row is newly entering the counted set. The UPDATE
--    half has no real caller yet (nothing in the app transitions a
--    client OUT of 'inactive' today — see db/sql/017_client_archive_
--    owner_only.sql), but exists now so the trial-expiry downgrade work
--    (Owner swapping which clients stay active) has a proven backstop
--    to build against, not a promise to add later.
--
-- 3. enforce_user_plan_limit(): same shape, for users. platform_admin
--    (firm_id NULL) and client_user (a client portal login, not a firm
--    staff seat — no client portal exists yet anyway) never count
--    against a firm's seat limit. Reactivating a deactivated member
--    re-checks the limit (OLD.active = false skips the "already
--    counted" exemption), which is exactly the gate a firm upgrading
--    out of a downgrade needs: raise the limit first, then reactivate.
--
-- 4. enforce_per_client_assignment_allowed(): deliberately scoped to
--    role = 'bookkeeper' only, NOT every role. Encoder/Reviewer/Viewer
--    are already permanently access_scope = 'assigned' — enforced by
--    013_role_access_scope_check.sql's CHECK constraint, which predates
--    this feature and has nothing to do with plan tier. Bookkeeper is
--    the only role where 'all' vs 'assigned' is a genuine, currently-
--    optional choice (at invite time and via the team page's edit-
--    assignments picker) — that choice is what "no per-client
--    assignment" actually gates. Applying this check to every role
--    instead would make Encoder/Reviewer/Viewer entirely uninvitable
--    on Free/Basic (both perClientAssignmentAllowed = false), silently
--    removing three roles from two plans — a much bigger product
--    decision than "no per-client assignment" was asked to make, so
--    deliberately not assumed.
-- ============================================================================

UPDATE firms SET trial_ends_at = now() + interval '7 days' WHERE trial_ends_at IS NULL;

CREATE OR REPLACE FUNCTION enforce_client_plan_limit() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_max_clients integer;
  v_current_count integer;
BEGIN
  IF NEW.status NOT IN ('onboarding', 'active') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IN ('onboarding', 'active') THEN
    RETURN NEW;
  END IF;

  SELECT max_clients INTO v_max_clients FROM firms WHERE id = NEW.firm_id;
  SELECT count(*) INTO v_current_count FROM clients WHERE firm_id = NEW.firm_id AND status IN ('onboarding', 'active');
  IF v_current_count >= v_max_clients THEN
    RAISE EXCEPTION 'This firm''s plan allows at most % active client(s).', v_max_clients;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER clients_enforce_plan_limit
BEFORE INSERT OR UPDATE ON clients
FOR EACH ROW EXECUTE FUNCTION enforce_client_plan_limit();

CREATE OR REPLACE FUNCTION enforce_user_plan_limit() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_max_users integer;
  v_current_count integer;
BEGIN
  IF NEW.firm_id IS NULL OR NEW.role = 'client_user' THEN
    RETURN NEW;
  END IF;
  IF NOT NEW.active THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.active AND OLD.firm_id = NEW.firm_id AND OLD.role != 'client_user' THEN
    RETURN NEW;
  END IF;

  SELECT max_users INTO v_max_users FROM firms WHERE id = NEW.firm_id;
  SELECT count(*) INTO v_current_count FROM users WHERE firm_id = NEW.firm_id AND active = true AND role != 'client_user';
  IF v_current_count >= v_max_users THEN
    RAISE EXCEPTION 'This firm''s plan allows at most % team member(s).', v_max_users;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_enforce_plan_limit
BEFORE INSERT OR UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION enforce_user_plan_limit();

CREATE OR REPLACE FUNCTION enforce_per_client_assignment_allowed() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_allowed boolean;
BEGIN
  IF NEW.role != 'bookkeeper' OR NEW.access_scope != 'assigned' OR NEW.firm_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT per_client_assignment_allowed INTO v_allowed FROM firms WHERE id = NEW.firm_id;
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'This firm''s plan does not allow per-client assignment — a Bookkeeper must have access to every client.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_enforce_per_client_assignment_allowed
BEFORE INSERT OR UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION enforce_per_client_assignment_allowed();
