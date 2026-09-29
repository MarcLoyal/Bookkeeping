-- ============================================================================
-- 010_bookkeeper_add_encoder_rls.sql
--
-- Lets a Bookkeeper add Encoder accounts to their own firm directly from
-- the app, without needing an Owner to do it for them — see
-- lib/auth/create-team-member.ts. Two policies from
-- 001_functions_triggers_rls.sql change, both previously firm_admin-only:
--
--   1. users_insert — a Bookkeeper may now INSERT a users row, but ONLY
--      with role = 'encoder'. Enforced by WITH CHECK at the database
--      level (not just the app's form/server action), so a Bookkeeper can
--      never mint a Bookkeeper/Reviewer/Viewer/Owner account by calling
--      the insert directly, whatever the UI does or doesn't show.
--
--   2. uca_write (user_client_assignments) — a Bookkeeper may now write
--      assignment rows, but only when BOTH:
--        - the client is one the Bookkeeper can already access (the same
--          app_accessible_client_ids() function edit/create already use —
--          a Bookkeeper can never assign a client they can't themselves
--          see, satisfying "only clients the Bookkeeper is assigned to"),
--        - the target user is an Encoder in the Bookkeeper's own firm (so
--          this can't be used to touch some OTHER staff member's client
--          assignments, only ones the Bookkeeper is onboarding).
--
-- Owner (firm_admin) is unaffected — already unconditional on both
-- policies, and stays that way ("Owner can add any role").
-- ============================================================================

DROP POLICY users_insert ON users;
CREATE POLICY users_insert ON users FOR INSERT
  WITH CHECK (
    firm_id = app_current_firm_id()
    AND (
      app_current_role() = 'firm_admin'
      OR (app_current_role() = 'bookkeeper' AND role = 'encoder')
    )
  );

DROP POLICY uca_write ON user_client_assignments;
CREATE POLICY uca_write ON user_client_assignments FOR ALL
  USING (
    app_current_role() = 'firm_admin'
    OR (
      app_current_role() = 'bookkeeper'
      AND client_id IN (SELECT app_accessible_client_ids())
      AND EXISTS (
        SELECT 1 FROM users u
        WHERE u.id = user_client_assignments.user_id
          AND u.role = 'encoder'
          AND u.firm_id = app_current_firm_id()
      )
    )
  )
  WITH CHECK (
    app_current_role() = 'firm_admin'
    OR (
      app_current_role() = 'bookkeeper'
      AND client_id IN (SELECT app_accessible_client_ids())
      AND EXISTS (
        SELECT 1 FROM users u
        WHERE u.id = user_client_assignments.user_id
          AND u.role = 'encoder'
          AND u.firm_id = app_current_firm_id()
      )
    )
  );
