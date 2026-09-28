-- ============================================================================
-- Adds the one aggregate the restyled platform admin dashboard needs that
-- 007 didn't already expose: "active users as of N days ago", so the
-- Active Users stat card can show a real vs-previous-period delta instead
-- of a fabricated one. Same shape and same reasoning as
-- platform_total_active_users() in 007 — firm-scoped `users` rows aren't
-- row-level visible to platform_admin, so this is a SECURITY DEFINER
-- aggregate, not a widened RLS grant. Total Firms / New Firms deltas need
-- no new function: firms_select_platform_admin (007) already grants
-- unconditional SELECT on firms, so those are plain WHERE-clause queries.
-- ============================================================================

CREATE OR REPLACE FUNCTION platform_active_users_before(cutoff timestamptz) RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*) FROM users WHERE firm_id IS NOT NULL AND active AND created_at < cutoff
$$;
