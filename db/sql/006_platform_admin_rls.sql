-- ============================================================================
-- Platform admin RLS: lets an authenticated platform_admin see and create
-- other platform_admin rows through the normal withUserContext() path,
-- for the in-app "invite another admin" page.
--
-- Deliberately narrow: a platform_admin still cannot see or touch any
-- firm-scoped user (firm_id must be NULL on both sides of every check
-- below) — this does not turn into general cross-firm visibility.
-- Postgres combines multiple permissive policies for the same command
-- with OR, so these add to users_select/users_insert (001) rather than
-- replacing them.
-- ============================================================================

CREATE POLICY users_select_platform_admin ON users FOR SELECT
  USING (app_current_role() = 'platform_admin' AND firm_id IS NULL);

CREATE POLICY users_insert_platform_admin ON users FOR INSERT
  WITH CHECK (app_current_role() = 'platform_admin' AND firm_id IS NULL AND role = 'platform_admin');
