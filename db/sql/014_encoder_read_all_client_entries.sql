-- ============================================================================
-- 014_encoder_read_all_client_entries.sql
--
-- Encoder read visibility, widened from "only entries I created" to
-- "every entry on a client I can access" — same read scope
-- firm_admin/bookkeeper/reviewer/viewer already have. Write access is
-- UNCHANGED: an Encoder may still only INSERT/UPDATE/DELETE their own
-- draft, on journal_entries/journal_lines and on the four document
-- tables (sales_invoices, purchases, cash_receipts, cash_disbursements
-- + their _lines tables) — this migration touches SELECT policies only.
--
-- Why: reported live that two Encoders (or an Encoder and the
-- Bookkeeper) assigned to the same client had no visibility into each
-- other's work at all — not just drafts, but even POSTED entries by
-- someone else were invisible to an Encoder, since 009's SELECT policy
-- filtered by `created_by = app_current_user_id()` unconditionally for
-- the role, with no exception once an entry posted. That's not
-- "encoder can't approve/edit others' work" (correct, unchanged) — it
-- was "encoder can't even SEE others' work," which is what actually
-- caused duplicate encoding risk in the first place: nothing showed an
-- Encoder that someone else had already keyed the same transaction.
--
-- Mechanically: every SELECT policy below just drops its
-- `(app_current_role() != 'encoder' OR <own-check>)` clause entirely,
-- leaving only the `client_id IN app_accessible_client_ids()` check
-- every other role's SELECT already had. Nothing else about each
-- policy changes.
-- ============================================================================

DROP POLICY journal_entries_select ON journal_entries;
CREATE POLICY journal_entries_select ON journal_entries FOR SELECT
  USING (client_id IN (SELECT app_accessible_client_ids()));

DROP POLICY journal_lines_select ON journal_lines;
CREATE POLICY journal_lines_select ON journal_lines FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM journal_entries je
    WHERE je.id = journal_lines.entry_id AND je.client_id IN (SELECT app_accessible_client_ids())
  ));

DROP POLICY sales_invoices_select ON sales_invoices;
CREATE POLICY sales_invoices_select ON sales_invoices FOR SELECT
  USING (client_id IN (SELECT app_accessible_client_ids()));

DROP POLICY purchases_select ON purchases;
CREATE POLICY purchases_select ON purchases FOR SELECT
  USING (client_id IN (SELECT app_accessible_client_ids()));

DROP POLICY cash_receipts_select ON cash_receipts;
CREATE POLICY cash_receipts_select ON cash_receipts FOR SELECT
  USING (client_id IN (SELECT app_accessible_client_ids()));

DROP POLICY cash_receipt_lines_select ON cash_receipt_lines;
CREATE POLICY cash_receipt_lines_select ON cash_receipt_lines FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM cash_receipts cr
    WHERE cr.id = cash_receipt_lines.cash_receipt_id AND cr.client_id IN (SELECT app_accessible_client_ids())
  ));

DROP POLICY cash_disbursements_select ON cash_disbursements;
CREATE POLICY cash_disbursements_select ON cash_disbursements FOR SELECT
  USING (client_id IN (SELECT app_accessible_client_ids()));

DROP POLICY cash_disbursement_lines_select ON cash_disbursement_lines;
CREATE POLICY cash_disbursement_lines_select ON cash_disbursement_lines FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM cash_disbursements cd
    WHERE cd.id = cash_disbursement_lines.cash_disbursement_id AND cd.client_id IN (SELECT app_accessible_client_ids())
  ));
