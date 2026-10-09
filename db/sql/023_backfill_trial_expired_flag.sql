-- ============================================================================
-- 023_backfill_trial_expired_flag.sql
--
-- Companion to the fix that made the platform admin dashboard's
-- expired-trial queue (listExpiredTrialFirms(), lib/data/platform-
-- billing.ts) check trialEndsAt directly instead of trialExpiredFlaggedAt
-- — that query no longer depends on this flag at all, so this backfill
-- isn't required for the queue to show already-expired trials correctly.
--
-- It exists so trialExpiredFlaggedAt — kept around as a "first noticed"
-- historical marker, see db/schema/firms.ts's own comment on it — stays
-- truthful for every trial that's already past its end date, rather than
-- staying NULL forever on any firm that never happened to log back in
-- after expiring (which is exactly the gap this whole fix closes). One-
-- time, not re-run on future migrations: going forward,
-- flagTrialExpiredIfNeeded() (lib/billing/flag-expired-trials.ts) keeps
-- setting it the same lazy way it always has, for firms that do log back
-- in; this only catches the backlog of firms that won't.
--
-- Uses now() as the flagged-at value, not trial_ends_at: this migration
-- running is genuinely the first time any check is noticing these
-- specific rows, so now() is the accurate timestamp for that, not a
-- fabricated backdate to each firm's actual (different) expiry moment.
-- ============================================================================

UPDATE firms
SET trial_expired_flagged_at = now()
WHERE plan = 'trial' AND trial_ends_at < now() AND trial_expired_flagged_at IS NULL;
