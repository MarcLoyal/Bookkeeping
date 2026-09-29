-- ============================================================================
-- 013_role_access_scope_check.sql
--
-- Encoder, Reviewer, and Viewer must never have access_scope = 'all' —
-- only Owner (firm_admin) and Bookkeeper may. Closes a real bug: before
-- this, lib/auth/create-team-member.ts's accessScope computation only
-- forced 'assigned' for Viewer and for anyone with clientIds actually
-- picked — an Owner inviting an Encoder or Reviewer with ZERO clients
-- ticked fell through to the 'all' default, silently handing that
-- Encoder/Reviewer every client in the firm. Reported live: an Owner
-- invited an Encoder with no clients ticked and got "Every client"
-- access on the Team page.
--
-- platform_admin and client_user are deliberately NOT covered — access_
-- scope isn't semantically meaningful for either (platform_admin has no
-- firm at all; client_user's access is its own client_id column, never
-- access_scope/user_client_assignments), and neither was named in
-- "Owner and Bookkeeper only."
--
-- Two backfills before the constraint, so ADD CONSTRAINT's default
-- full-table validation doesn't fail outright on a database that
-- already has affected rows:
--
-- 1. Any existing encoder/reviewer/viewer row already sitting at 'all'
--    (from the bug above, on any real project already hit by it) is
--    corrected to 'assigned'.
-- 2. The demo firm's own encoder@keepbooks.demo was seeded with 'all'
--    deliberately, before this rule existed (see db/seed.ts's own
--    comment at the time) — same fix as #1 catches it too, but with
--    zero user_client_assignments rows to back it up, so it would go
--    from "sees every demo client" to "sees nothing," a real regression
--    in a demo account meant to be usable out of the box. This grants
--    it both seeded demo clients explicitly, matching exactly what
--    scripts/seed-viewer-demo-user.ts already did for
--    viewer@keepbooks.demo. No-ops harmlessly on a project that never
--    ran db/seed.ts (no matching email, nothing to grant).
-- ============================================================================

UPDATE users SET access_scope = 'assigned' WHERE role IN ('encoder', 'reviewer', 'viewer') AND access_scope = 'all';

INSERT INTO user_client_assignments (user_id, client_id)
SELECT u.id, c.id
FROM users u
JOIN clients c ON c.firm_id = u.firm_id AND c.registered_name IN ('Demo Trading Corp.', 'Demo Services (Sole Prop)')
WHERE u.email = 'encoder@keepbooks.demo'
ON CONFLICT (user_id, client_id) DO NOTHING;

ALTER TABLE users ADD CONSTRAINT users_access_scope_role_check
  CHECK (NOT (role IN ('encoder', 'reviewer', 'viewer') AND access_scope = 'all'));
