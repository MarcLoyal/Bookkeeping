-- ============================================================================
-- 019_fix_per_client_assignment_trigger.sql
--
-- Bug fix for enforce_per_client_assignment_allowed()
-- (018_plan_limits.sql, already merged/applied). Found by manually
-- exercising the (not-yet-merged) downgrade-to-Free action against a
-- real database: deactivating bookkeeper@keepbooks.demo — an existing
-- Bookkeeper whose access_scope was already 'assigned' from before this
-- firm's plan disallowed it — failed with "This firm's plan does not
-- allow per-client assignment," even though the UPDATE in question
-- (`active = false`) never touched access_scope at all.
--
-- Root cause: the original trigger checked NEW.access_scope on every
-- UPDATE to a Bookkeeper row, regardless of whether access_scope was
-- the thing actually changing. Once a firm's per_client_assignment_
-- allowed goes false, that froze every OTHER field on an already-
-- 'assigned' Bookkeeper's row too — renaming them, deactivating them,
-- anything — not just blocking a NEW attempt to set 'assigned'.
--
-- Fix: only check when access_scope is actually transitioning TO
-- 'assigned' (INSERT with 'assigned', or UPDATE where OLD.access_scope
-- was NOT already 'assigned') — the same "did the relevant thing
-- change" guard 018's other two triggers already use for clients/users
-- plan-limit counts, just missed here originally. An existing
-- 'assigned' Bookkeeper under a plan that no longer allows it is now
-- correctly left alone (not retroactively reset to 'all', not frozen
-- from any other edit) until something explicitly tries to set
-- access_scope to 'assigned' again.
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_per_client_assignment_allowed() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_allowed boolean;
BEGIN
  IF NEW.role != 'bookkeeper' OR NEW.access_scope != 'assigned' OR NEW.firm_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.access_scope = 'assigned' THEN
    -- Already 'assigned' before this update — this row isn't newly
    -- entering the restricted state, so whatever else is changing
    -- (name, active, ...) is none of this trigger's business.
    RETURN NEW;
  END IF;

  SELECT per_client_assignment_allowed INTO v_allowed FROM firms WHERE id = NEW.firm_id;
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'This firm''s plan does not allow per-client assignment — a Bookkeeper must have access to every client.';
  END IF;
  RETURN NEW;
END;
$$;
