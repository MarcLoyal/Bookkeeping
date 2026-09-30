-- Rollback for 019_fix_per_client_assignment_trigger.sql — restores the
-- original (buggy) enforce_per_client_assignment_allowed() from
-- 018_plan_limits.sql. Deliberately in db/rollback/, not db/sql/ — see
-- 009_team_roles_rls.sql's rollback for why db:migrate's directory scan
-- makes that unsafe (same reasoning, same repo).
--
-- There's no legitimate reason to want the original behavior back — this
-- exists only for completeness. Reverting reintroduces the exact bug
-- 019 fixed: any UPDATE to an already-'assigned' Bookkeeper row (not
-- just one setting access_scope) fails once the firm's plan disallows
-- per-client assignment.
--
-- After running this, also remove
-- '019_fix_per_client_assignment_trigger.sql' from
-- _sql_migrations_applied so a future `pnpm db:migrate` will re-apply
-- it if desired:
--   delete from _sql_migrations_applied where filename = '019_fix_per_client_assignment_trigger.sql';

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
