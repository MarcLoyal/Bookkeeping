-- ============================================================================
-- Platform admin dashboard: read access for the firms/bookkeepers overview
-- at /dashboard. Two shapes, deliberately different:
--
-- 1. Real row-level RLS policies (firms, and users restricted to just the
--    firm_admin/"owner" role) — the dashboard genuinely needs per-row data
--    here (firm name, owner name/email), and firm metadata + who a firm's
--    admin is isn't sensitive in the way client records are.
--
-- 2. SECURITY DEFINER aggregate functions for everything client- or
--    audit-log-derived (client counts per firm, last-active-per-firm from
--    login events) — confirmed with the product owner that platform admins
--    should see summaries only here, never raw client rows or audit
--    before/after diffs. Rather than widen clients_select or
--    audit_log_select at the row level and rely on the app's queries being
--    disciplined about which columns they ask for, these functions expose
--    only the specific aggregate needed and nothing else — no RLS grant on
--    clients or audit_log for platform_admin exists at all. Same pattern
--    this file already uses elsewhere (app_accessible_client_ids()).
-- ============================================================================

CREATE POLICY firms_select_platform_admin ON firms FOR SELECT
  USING (app_current_role() = 'platform_admin');

CREATE POLICY users_select_platform_admin_owners ON users FOR SELECT
  USING (app_current_role() = 'platform_admin' AND role = 'firm_admin');

CREATE OR REPLACE FUNCTION platform_total_active_users() RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*) FROM users WHERE firm_id IS NOT NULL AND active
$$;

CREATE OR REPLACE FUNCTION platform_client_counts() RETURNS TABLE(firm_id uuid, client_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.firm_id, count(*) FROM clients c GROUP BY c.firm_id
$$;

-- Only ever reads action = 'LOGIN' rows, which never carry a before/after
-- payload (see lib/auth/login.ts / lib/auth/oauth-callback.ts — neither
-- passes one when logging a LOGIN) — this couldn't expose firm data even
-- if it returned raw rows, which it doesn't.
CREATE OR REPLACE FUNCTION platform_firms_last_active() RETURNS TABLE(firm_id uuid, last_active_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.firm_id, max(al.created_at)
  FROM audit_log al
  JOIN users u ON u.id = al.actor_user_id
  WHERE al.action = 'LOGIN' AND u.firm_id IS NOT NULL
  GROUP BY u.firm_id
$$;
