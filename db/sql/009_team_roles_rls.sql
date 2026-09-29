-- ============================================================================
-- Team & Roles (Phase 1, PR A): encoder/viewer roles, per-member access_scope,
-- and the RLS rewrite this requires. See DECISIONS.md "Team & Roles, PR A"
-- for the full role-capability matrix this file implements and the
-- reasoning behind every judgment call below.
--
-- Role capability summary (enforced here, not by hiding UI):
--   Owner (firm_admin)  — everything.
--   Bookkeeper          — add/edit clients & structure, add/edit/post
--                          entries, view reports/exports. (Previously
--                          could NOT create clients — clients_insert was
--                          firm_admin-only. Fixed here.)
--   Reviewer            — view + post/approve only. Previously identical
--                          to bookkeeper (full write) via app_is_staff() —
--                          tightened here to a status-transition-only
--                          UPDATE, no INSERT, no other-field edits.
--   Encoder (new)        — add draft entries; edit/delete only their own,
--                          only while still draft; cannot see other
--                          people's entries; cannot post; no structural
--                          edits (clients/accounts/contacts); reports and
--                          dashboard aggregates are additionally blocked
--                          at the application layer (lib/auth/current-
--                          user.ts's requireReportAccess()) since RLS row-
--                          scoping alone only makes those views nearly
--                          empty for an encoder, not actually refused.
--   Viewer (new)          — read-only everywhere accessible; no writes at
--                          all, no exports (export gating is an
--                          application-layer check — there's no separate
--                          "download" table for RLS to gate).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. access_scope backfill
--
-- The new users.access_scope column (0007_chilly_arachne.sql) defaults to
-- 'all' for brand-new rows. Every row that predates this column must be
-- backfilled to 'assigned' instead: before this column existed, per-client
-- assignment was mandatory for bookkeeper/reviewer (zero assignments ==
-- zero visible clients, see the old app_accessible_client_ids() below) —
-- defaulting them to 'all' here would silently WIDEN a real firm's access
-- the moment this migration runs, which is exactly what this backfill
-- exists to prevent. firm_admin/client_user/platform_admin never consult
-- this column (see the rewritten function below) so it's irrelevant for
-- them, but set to 'assigned' anyway for a consistent, unsurprising value.
-- ----------------------------------------------------------------------------
UPDATE users SET access_scope = 'assigned' WHERE role IN ('bookkeeper', 'reviewer');

-- ----------------------------------------------------------------------------
-- 1. Helper functions
-- ----------------------------------------------------------------------------

-- Unchanged definition, kept for the roles that can still do everything
-- app_is_staff() originally meant: post a draft to posted (bookkeeper
-- directly; reviewer via the status-only path below) and the
-- posting-time side effects that go with it (client_counters).
-- app_is_staff() already existed; no redefinition needed here.

-- Structural edits: clients, accounts, contacts, client_tax_types. Reviewer/
-- encoder/viewer never touch these — only Owner and Bookkeeper can.
CREATE OR REPLACE FUNCTION app_can_manage_structure() RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT app_current_role() IN ('firm_admin', 'bookkeeper')
$$;

-- Draft-entry creation/editing (general journal + the four specialized
-- document types, all of which are just fronts for a journal_entries row).
-- firm_admin/bookkeeper may create/edit any entry; encoder may create/edit
-- only their own, only while draft — enforced per-table below since the
-- exact shape (own-row vs. join-through) differs by table.
CREATE OR REPLACE FUNCTION app_can_encode() RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT app_current_role() IN ('firm_admin', 'bookkeeper', 'encoder')
$$;

-- The set of client ids the current session's user may access.
-- firm_admin: every client in their firm, always (access_scope is
--   meaningless for Owner — "Owners always see everything").
-- bookkeeper/reviewer/encoder/viewer: every client in their firm if
--   access_scope = 'all' (the default for new members); otherwise only
--   clients explicitly assigned via user_client_assignments, even if
--   that's currently zero. This check runs regardless of plan — whether
--   an Owner is ALLOWED to switch a member back to 'all' (or add/edit
--   assignments) is a getPlanLimits() gate at the UI/action layer, not
--   here; RLS enforces whatever access_scope + assignments are already
--   on the row, so a plan downgrade that freezes the Owner out of the
--   assignment UI still can't widen anyone's actual access.
-- client_user: only their own client (unchanged).
CREATE OR REPLACE FUNCTION app_accessible_client_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id
  FROM clients c
  JOIN users u ON u.id = app_current_user_id() AND u.active
  WHERE
    (u.role = 'firm_admin' AND c.firm_id = u.firm_id)
    OR (
      u.role IN ('bookkeeper', 'reviewer', 'encoder', 'viewer')
      AND c.firm_id = u.firm_id
      AND (
        u.access_scope = 'all'
        OR EXISTS (
          SELECT 1 FROM user_client_assignments a
          WHERE a.user_id = u.id AND a.client_id = c.id
        )
      )
    )
    OR (u.role = 'client_user' AND c.id = u.client_id)
$$;

-- ----------------------------------------------------------------------------
-- 2. Reviewer: post/approve only, enforced as a trigger (not RLS alone)
--
-- RLS's WITH CHECK can constrain values on the NEW row but can't cleanly
-- express "only these columns may differ from OLD" — the same problem
-- enforce_journal_entry_immutability() (001) already solved for posted-
-- entry immutability, via an explicit OLD-vs-NEW column diff in a BEFORE
-- UPDATE trigger. This mirrors that pattern for reviewer specifically:
-- a reviewer's UPDATE on journal_entries may only ever change status
-- (draft -> posted) and the posting-attribution columns that go with it.
-- Runs BEFORE the existing balance/period-lock/immutability triggers, so
-- a reviewer attempting to sneak in a description/amount change alongside
-- a status flip is rejected here before those even see the row.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_reviewer_status_only_update() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF app_current_role() = 'reviewer' THEN
    IF NEW.entry_no IS DISTINCT FROM OLD.entry_no
      OR NEW.entry_date IS DISTINCT FROM OLD.entry_date
      OR NEW.book IS DISTINCT FROM OLD.book
      OR NEW.reference_no IS DISTINCT FROM OLD.reference_no
      OR NEW.description IS DISTINCT FROM OLD.description
      OR NEW.client_id IS DISTINCT FROM OLD.client_id
      OR NEW.source_document_id IS DISTINCT FROM OLD.source_document_id
      OR NEW.created_by IS DISTINCT FROM OLD.created_by
      OR NEW.reversal_of_entry_id IS DISTINCT FROM OLD.reversal_of_entry_id
    THEN
      RAISE EXCEPTION 'Reviewers may only post/approve (status) — not edit a journal entry''s other fields.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER journal_entries_reviewer_status_only
BEFORE UPDATE ON journal_entries
FOR EACH ROW EXECUTE FUNCTION enforce_reviewer_status_only_update();

-- ----------------------------------------------------------------------------
-- 3. clients — bookkeeper can now create and edit (edit already scoped
-- through app_accessible_client_ids(), same as reads — an 'assigned'-
-- scope bookkeeper can only edit clients they're actually assigned to,
-- never every client in the firm; an 'all'-scope one edits whatever they
-- can already see, matching read/write parity everywhere else in this
-- file). Delete stays Owner-only — see the new clients_delete policy
-- below, which didn't exist at all before this: no DELETE policy on
-- `clients` meant Postgres denied it to every role, Owner included, not
-- specifically "Owner-only" as intended. Nothing in the app currently
-- calls a client delete (no UI, no API route, no data-layer function),
-- so this closes the gap defensively rather than changing any live
-- behavior.
-- ----------------------------------------------------------------------------
DROP POLICY clients_insert ON clients;
CREATE POLICY clients_insert ON clients FOR INSERT
  WITH CHECK (app_can_manage_structure() AND firm_id = app_current_firm_id());

DROP POLICY clients_update ON clients;
CREATE POLICY clients_update ON clients FOR UPDATE
  USING (app_can_manage_structure() AND id IN (SELECT app_accessible_client_ids()));

CREATE POLICY clients_delete ON clients FOR DELETE
  USING (app_current_role() = 'firm_admin' AND id IN (SELECT app_accessible_client_ids()));

-- ----------------------------------------------------------------------------
-- 4. client_tax_types / accounts / contacts — structural, Owner+Bookkeeper only.
-- ----------------------------------------------------------------------------
DROP POLICY client_tax_types_write ON client_tax_types;
CREATE POLICY client_tax_types_write ON client_tax_types FOR ALL
  USING (app_can_manage_structure() AND client_id IN (SELECT app_accessible_client_ids()))
  WITH CHECK (app_can_manage_structure() AND client_id IN (SELECT app_accessible_client_ids()));

DROP POLICY accounts_write ON accounts;
CREATE POLICY accounts_write ON accounts FOR ALL
  USING (app_can_manage_structure() AND client_id IN (SELECT app_accessible_client_ids()))
  WITH CHECK (app_can_manage_structure() AND client_id IN (SELECT app_accessible_client_ids()));

DROP POLICY contacts_write ON contacts;
CREATE POLICY contacts_write ON contacts FOR ALL
  USING (app_can_manage_structure() AND client_id IN (SELECT app_accessible_client_ids()))
  WITH CHECK (app_can_manage_structure() AND client_id IN (SELECT app_accessible_client_ids()));

-- client_counters is untouched: still gated by app_is_staff() (firm_admin/
-- bookkeeper/reviewer), unchanged from 001 — it's only ever written at
-- posting time, and reviewer can still post.

-- ----------------------------------------------------------------------------
-- 5. journal_entries — the core of the encoder/reviewer split.
-- ----------------------------------------------------------------------------
DROP POLICY journal_entries_select ON journal_entries;
CREATE POLICY journal_entries_select ON journal_entries FOR SELECT
  USING (
    client_id IN (SELECT app_accessible_client_ids())
    AND (app_current_role() != 'encoder' OR created_by = app_current_user_id())
  );

DROP POLICY journal_entries_write ON journal_entries;

CREATE POLICY journal_entries_insert ON journal_entries FOR INSERT
  WITH CHECK (
    client_id IN (SELECT app_accessible_client_ids())
    AND (
      app_current_role() IN ('firm_admin', 'bookkeeper')
      OR (app_current_role() = 'encoder' AND status = 'draft' AND created_by = app_current_user_id())
    )
  );

CREATE POLICY journal_entries_update ON journal_entries FOR UPDATE
  USING (
    client_id IN (SELECT app_accessible_client_ids())
    AND (
      app_current_role() IN ('firm_admin', 'bookkeeper', 'reviewer')
      OR (app_current_role() = 'encoder' AND created_by = app_current_user_id() AND status = 'draft')
    )
  )
  WITH CHECK (
    client_id IN (SELECT app_accessible_client_ids())
    AND (
      app_current_role() IN ('firm_admin', 'bookkeeper', 'reviewer')
      OR (app_current_role() = 'encoder' AND created_by = app_current_user_id() AND status = 'draft')
    )
  );

-- Delete: only ever reachable for a draft (the existing immutability
-- trigger unconditionally rejects deleting a posted/reversed entry
-- regardless of role). Reviewer/viewer get no delete policy at all —
-- reviewer can post but not otherwise touch an entry; viewer is read-only.
CREATE POLICY journal_entries_delete ON journal_entries FOR DELETE
  USING (
    client_id IN (SELECT app_accessible_client_ids())
    AND (
      app_current_role() IN ('firm_admin', 'bookkeeper')
      OR (app_current_role() = 'encoder' AND created_by = app_current_user_id())
    )
  );

-- ----------------------------------------------------------------------------
-- 6. journal_lines — mirrors journal_entries via the parent-entry join,
-- same pattern this table already used pre-restyle (no client_id column
-- of its own).
-- ----------------------------------------------------------------------------
DROP POLICY journal_lines_select ON journal_lines;
CREATE POLICY journal_lines_select ON journal_lines FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM journal_entries je
    WHERE je.id = journal_lines.entry_id
      AND je.client_id IN (SELECT app_accessible_client_ids())
      AND (app_current_role() != 'encoder' OR je.created_by = app_current_user_id())
  ));

DROP POLICY journal_lines_write ON journal_lines;
CREATE POLICY journal_lines_write ON journal_lines FOR ALL
  USING (EXISTS (
    SELECT 1 FROM journal_entries je
    WHERE je.id = journal_lines.entry_id
      AND je.client_id IN (SELECT app_accessible_client_ids())
      AND (
        app_current_role() IN ('firm_admin', 'bookkeeper')
        OR (app_current_role() = 'encoder' AND je.created_by = app_current_user_id() AND je.status = 'draft')
      )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM journal_entries je
    WHERE je.id = journal_lines.entry_id
      AND je.client_id IN (SELECT app_accessible_client_ids())
      AND (
        app_current_role() IN ('firm_admin', 'bookkeeper')
        OR (app_current_role() = 'encoder' AND je.created_by = app_current_user_id() AND je.status = 'draft')
      )
  ));
-- Reviewer never writes lines directly — posting only flips
-- journal_entries.status, never touches journal_lines (see
-- check_journal_entry_balance_on_post() in 001), so reviewer needs no
-- lines-write policy at all.

-- ----------------------------------------------------------------------------
-- 7. sales_invoices / purchases / cash_receipts / cash_disbursements
-- (+ their _lines tables) — the four specialized document fronts for the
-- same draft/posted concept, each linked to a journal_entries row via
-- journal_entry_id. Same shape as journal_entries: firm_admin/bookkeeper
-- full access; encoder scoped to their own linked entry, while it's still
-- draft; reviewer/viewer read-only (reviewer approves via journal_entries
-- directly, never these tables — a sales invoice's own `status` column is
-- its collection status, unrelated to draft/posted).
-- ----------------------------------------------------------------------------
DROP POLICY sales_invoices_select ON sales_invoices;
CREATE POLICY sales_invoices_select ON sales_invoices FOR SELECT
  USING (
    client_id IN (SELECT app_accessible_client_ids())
    AND (
      app_current_role() != 'encoder'
      OR EXISTS (SELECT 1 FROM journal_entries je WHERE je.id = sales_invoices.journal_entry_id AND je.created_by = app_current_user_id())
    )
  );
DROP POLICY sales_invoices_write ON sales_invoices;
CREATE POLICY sales_invoices_write ON sales_invoices FOR ALL
  USING (
    client_id IN (SELECT app_accessible_client_ids())
    AND (
      app_current_role() IN ('firm_admin', 'bookkeeper')
      OR (
        app_current_role() = 'encoder'
        AND EXISTS (SELECT 1 FROM journal_entries je WHERE je.id = sales_invoices.journal_entry_id AND je.created_by = app_current_user_id() AND je.status = 'draft')
      )
    )
  )
  WITH CHECK (
    client_id IN (SELECT app_accessible_client_ids())
    AND (
      app_current_role() IN ('firm_admin', 'bookkeeper')
      OR (
        app_current_role() = 'encoder'
        AND EXISTS (SELECT 1 FROM journal_entries je WHERE je.id = sales_invoices.journal_entry_id AND je.created_by = app_current_user_id() AND je.status = 'draft')
      )
    )
  );

DROP POLICY purchases_select ON purchases;
CREATE POLICY purchases_select ON purchases FOR SELECT
  USING (
    client_id IN (SELECT app_accessible_client_ids())
    AND (
      app_current_role() != 'encoder'
      OR EXISTS (SELECT 1 FROM journal_entries je WHERE je.id = purchases.journal_entry_id AND je.created_by = app_current_user_id())
    )
  );
DROP POLICY purchases_write ON purchases;
CREATE POLICY purchases_write ON purchases FOR ALL
  USING (
    client_id IN (SELECT app_accessible_client_ids())
    AND (
      app_current_role() IN ('firm_admin', 'bookkeeper')
      OR (
        app_current_role() = 'encoder'
        AND EXISTS (SELECT 1 FROM journal_entries je WHERE je.id = purchases.journal_entry_id AND je.created_by = app_current_user_id() AND je.status = 'draft')
      )
    )
  )
  WITH CHECK (
    client_id IN (SELECT app_accessible_client_ids())
    AND (
      app_current_role() IN ('firm_admin', 'bookkeeper')
      OR (
        app_current_role() = 'encoder'
        AND EXISTS (SELECT 1 FROM journal_entries je WHERE je.id = purchases.journal_entry_id AND je.created_by = app_current_user_id() AND je.status = 'draft')
      )
    )
  );

DROP POLICY cash_receipts_select ON cash_receipts;
CREATE POLICY cash_receipts_select ON cash_receipts FOR SELECT
  USING (
    client_id IN (SELECT app_accessible_client_ids())
    AND (
      app_current_role() != 'encoder'
      OR EXISTS (SELECT 1 FROM journal_entries je WHERE je.id = cash_receipts.journal_entry_id AND je.created_by = app_current_user_id())
    )
  );
DROP POLICY cash_receipts_write ON cash_receipts;
CREATE POLICY cash_receipts_write ON cash_receipts FOR ALL
  USING (
    client_id IN (SELECT app_accessible_client_ids())
    AND (
      app_current_role() IN ('firm_admin', 'bookkeeper')
      OR (
        app_current_role() = 'encoder'
        AND EXISTS (SELECT 1 FROM journal_entries je WHERE je.id = cash_receipts.journal_entry_id AND je.created_by = app_current_user_id() AND je.status = 'draft')
      )
    )
  )
  WITH CHECK (
    client_id IN (SELECT app_accessible_client_ids())
    AND (
      app_current_role() IN ('firm_admin', 'bookkeeper')
      OR (
        app_current_role() = 'encoder'
        AND EXISTS (SELECT 1 FROM journal_entries je WHERE je.id = cash_receipts.journal_entry_id AND je.created_by = app_current_user_id() AND je.status = 'draft')
      )
    )
  );

DROP POLICY cash_receipt_lines_select ON cash_receipt_lines;
CREATE POLICY cash_receipt_lines_select ON cash_receipt_lines FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM cash_receipts cr
    WHERE cr.id = cash_receipt_lines.cash_receipt_id
      AND cr.client_id IN (SELECT app_accessible_client_ids())
      AND (
        app_current_role() != 'encoder'
        OR EXISTS (SELECT 1 FROM journal_entries je WHERE je.id = cr.journal_entry_id AND je.created_by = app_current_user_id())
      )
  ));
DROP POLICY cash_receipt_lines_write ON cash_receipt_lines;
CREATE POLICY cash_receipt_lines_write ON cash_receipt_lines FOR ALL
  USING (EXISTS (
    SELECT 1 FROM cash_receipts cr
    WHERE cr.id = cash_receipt_lines.cash_receipt_id
      AND cr.client_id IN (SELECT app_accessible_client_ids())
      AND (
        app_current_role() IN ('firm_admin', 'bookkeeper')
        OR (
          app_current_role() = 'encoder'
          AND EXISTS (SELECT 1 FROM journal_entries je WHERE je.id = cr.journal_entry_id AND je.created_by = app_current_user_id() AND je.status = 'draft')
        )
      )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM cash_receipts cr
    WHERE cr.id = cash_receipt_lines.cash_receipt_id
      AND cr.client_id IN (SELECT app_accessible_client_ids())
      AND (
        app_current_role() IN ('firm_admin', 'bookkeeper')
        OR (
          app_current_role() = 'encoder'
          AND EXISTS (SELECT 1 FROM journal_entries je WHERE je.id = cr.journal_entry_id AND je.created_by = app_current_user_id() AND je.status = 'draft')
        )
      )
  ));

DROP POLICY cash_disbursements_select ON cash_disbursements;
CREATE POLICY cash_disbursements_select ON cash_disbursements FOR SELECT
  USING (
    client_id IN (SELECT app_accessible_client_ids())
    AND (
      app_current_role() != 'encoder'
      OR EXISTS (SELECT 1 FROM journal_entries je WHERE je.id = cash_disbursements.journal_entry_id AND je.created_by = app_current_user_id())
    )
  );
DROP POLICY cash_disbursements_write ON cash_disbursements;
CREATE POLICY cash_disbursements_write ON cash_disbursements FOR ALL
  USING (
    client_id IN (SELECT app_accessible_client_ids())
    AND (
      app_current_role() IN ('firm_admin', 'bookkeeper')
      OR (
        app_current_role() = 'encoder'
        AND EXISTS (SELECT 1 FROM journal_entries je WHERE je.id = cash_disbursements.journal_entry_id AND je.created_by = app_current_user_id() AND je.status = 'draft')
      )
    )
  )
  WITH CHECK (
    client_id IN (SELECT app_accessible_client_ids())
    AND (
      app_current_role() IN ('firm_admin', 'bookkeeper')
      OR (
        app_current_role() = 'encoder'
        AND EXISTS (SELECT 1 FROM journal_entries je WHERE je.id = cash_disbursements.journal_entry_id AND je.created_by = app_current_user_id() AND je.status = 'draft')
      )
    )
  );

DROP POLICY cash_disbursement_lines_select ON cash_disbursement_lines;
CREATE POLICY cash_disbursement_lines_select ON cash_disbursement_lines FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM cash_disbursements cd
    WHERE cd.id = cash_disbursement_lines.cash_disbursement_id
      AND cd.client_id IN (SELECT app_accessible_client_ids())
      AND (
        app_current_role() != 'encoder'
        OR EXISTS (SELECT 1 FROM journal_entries je WHERE je.id = cd.journal_entry_id AND je.created_by = app_current_user_id())
      )
  ));
DROP POLICY cash_disbursement_lines_write ON cash_disbursement_lines;
CREATE POLICY cash_disbursement_lines_write ON cash_disbursement_lines FOR ALL
  USING (EXISTS (
    SELECT 1 FROM cash_disbursements cd
    WHERE cd.id = cash_disbursement_lines.cash_disbursement_id
      AND cd.client_id IN (SELECT app_accessible_client_ids())
      AND (
        app_current_role() IN ('firm_admin', 'bookkeeper')
        OR (
          app_current_role() = 'encoder'
          AND EXISTS (SELECT 1 FROM journal_entries je WHERE je.id = cd.journal_entry_id AND je.created_by = app_current_user_id() AND je.status = 'draft')
        )
      )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM cash_disbursements cd
    WHERE cd.id = cash_disbursement_lines.cash_disbursement_id
      AND cd.client_id IN (SELECT app_accessible_client_ids())
      AND (
        app_current_role() IN ('firm_admin', 'bookkeeper')
        OR (
          app_current_role() = 'encoder'
          AND EXISTS (SELECT 1 FROM journal_entries je WHERE je.id = cd.journal_entry_id AND je.created_by = app_current_user_id() AND je.status = 'draft')
        )
      )
  ));

-- ----------------------------------------------------------------------------
-- 8. period_locks — unchanged (firm_admin only, already exactly matches
-- "structural, Owner-tier" even though it doesn't go through
-- app_can_manage_structure() — left as-is since it was already firm_admin-
-- only, stricter than the new bookkeeper-inclusive structure check, and
-- nothing in the new spec asks to loosen it).
-- ----------------------------------------------------------------------------
-- (no change)
