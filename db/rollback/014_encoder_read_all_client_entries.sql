-- Rollback for 014_encoder_read_all_client_entries.sql — restores every
-- SELECT policy it touched to its exact 009_team_roles_rls.sql
-- definition (Encoder scoped back down to only entries they created).
-- Deliberately in db/rollback/, not db/sql/ — see 009's own rollback for
-- why db:migrate's directory scan makes that unsafe (same reasoning,
-- same repo).
--
-- After running this, also remove '014_encoder_read_all_client_entries.sql'
-- from _sql_migrations_applied so a future `pnpm db:migrate` will
-- re-apply it if desired:
--   delete from _sql_migrations_applied where filename = '014_encoder_read_all_client_entries.sql';

DROP POLICY IF EXISTS journal_entries_select ON journal_entries;
CREATE POLICY journal_entries_select ON journal_entries FOR SELECT
  USING (
    client_id IN (SELECT app_accessible_client_ids())
    AND (app_current_role() != 'encoder' OR created_by = app_current_user_id())
  );

DROP POLICY IF EXISTS journal_lines_select ON journal_lines;
CREATE POLICY journal_lines_select ON journal_lines FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM journal_entries je
    WHERE je.id = journal_lines.entry_id
      AND je.client_id IN (SELECT app_accessible_client_ids())
      AND (app_current_role() != 'encoder' OR je.created_by = app_current_user_id())
  ));

DROP POLICY IF EXISTS sales_invoices_select ON sales_invoices;
CREATE POLICY sales_invoices_select ON sales_invoices FOR SELECT
  USING (
    client_id IN (SELECT app_accessible_client_ids())
    AND (
      app_current_role() != 'encoder'
      OR EXISTS (SELECT 1 FROM journal_entries je WHERE je.id = sales_invoices.journal_entry_id AND je.created_by = app_current_user_id())
    )
  );

DROP POLICY IF EXISTS purchases_select ON purchases;
CREATE POLICY purchases_select ON purchases FOR SELECT
  USING (
    client_id IN (SELECT app_accessible_client_ids())
    AND (
      app_current_role() != 'encoder'
      OR EXISTS (SELECT 1 FROM journal_entries je WHERE je.id = purchases.journal_entry_id AND je.created_by = app_current_user_id())
    )
  );

DROP POLICY IF EXISTS cash_receipts_select ON cash_receipts;
CREATE POLICY cash_receipts_select ON cash_receipts FOR SELECT
  USING (
    client_id IN (SELECT app_accessible_client_ids())
    AND (
      app_current_role() != 'encoder'
      OR EXISTS (SELECT 1 FROM journal_entries je WHERE je.id = cash_receipts.journal_entry_id AND je.created_by = app_current_user_id())
    )
  );

DROP POLICY IF EXISTS cash_receipt_lines_select ON cash_receipt_lines;
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

DROP POLICY IF EXISTS cash_disbursements_select ON cash_disbursements;
CREATE POLICY cash_disbursements_select ON cash_disbursements FOR SELECT
  USING (
    client_id IN (SELECT app_accessible_client_ids())
    AND (
      app_current_role() != 'encoder'
      OR EXISTS (SELECT 1 FROM journal_entries je WHERE je.id = cash_disbursements.journal_entry_id AND je.created_by = app_current_user_id())
    )
  );

DROP POLICY IF EXISTS cash_disbursement_lines_select ON cash_disbursement_lines;
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
