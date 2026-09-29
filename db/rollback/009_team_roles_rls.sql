-- ============================================================================
-- Rollback for 009_team_roles_rls.sql — restores every policy/function/
-- trigger it touched to its exact pre-009 (001_functions_triggers_rls.sql)
-- definition. Does NOT touch the encoder/viewer enum values or the
-- access_scope column (0007_chilly_arachne.sql, a drizzle-kit migration —
-- Postgres cannot drop enum values at all, and dropping the column is a
-- separate, deliberate decision, not part of an RLS rollback). Run by
-- hand against MIGRATION_DATABASE_URL if 009 needs to be backed out.
-- Deliberately lives in db/rollback/, NOT db/sql/ — db/migrate.ts scans
-- db/sql/ for anything ending in .sql and auto-applies it in sorted
-- order; a same-named rollback file placed there would not just be
-- unwanted, it would sort BEFORE "009_team_roles_rls.sql" itself
-- ("...rls.rollback.sql" < "...rls.sql" alphabetically) and run first,
-- against a database where 009 hadn't been applied yet.
--
-- After running this, also remove '009_team_roles_rls.sql' from
-- _sql_migrations_applied so a future `pnpm db:migrate` will re-apply it
-- if desired:
--   delete from _sql_migrations_applied where filename = '009_team_roles_rls.sql';
-- ============================================================================

-- 8. period_locks: no change was made, nothing to roll back.

-- 7. sales_invoices / purchases / cash_receipts / cash_disbursements (+ lines)
DROP POLICY IF EXISTS sales_invoices_select ON sales_invoices;
DROP POLICY IF EXISTS sales_invoices_write ON sales_invoices;
CREATE POLICY sales_invoices_select ON sales_invoices FOR SELECT
  USING (client_id IN (SELECT app_accessible_client_ids()));
CREATE POLICY sales_invoices_write ON sales_invoices FOR ALL
  USING (app_is_staff() AND client_id IN (SELECT app_accessible_client_ids()))
  WITH CHECK (app_is_staff() AND client_id IN (SELECT app_accessible_client_ids()));

DROP POLICY IF EXISTS purchases_select ON purchases;
DROP POLICY IF EXISTS purchases_write ON purchases;
CREATE POLICY purchases_select ON purchases FOR SELECT
  USING (client_id IN (SELECT app_accessible_client_ids()));
CREATE POLICY purchases_write ON purchases FOR ALL
  USING (app_is_staff() AND client_id IN (SELECT app_accessible_client_ids()))
  WITH CHECK (app_is_staff() AND client_id IN (SELECT app_accessible_client_ids()));

DROP POLICY IF EXISTS cash_receipts_select ON cash_receipts;
DROP POLICY IF EXISTS cash_receipts_write ON cash_receipts;
CREATE POLICY cash_receipts_select ON cash_receipts FOR SELECT
  USING (client_id IN (SELECT app_accessible_client_ids()));
CREATE POLICY cash_receipts_write ON cash_receipts FOR ALL
  USING (app_is_staff() AND client_id IN (SELECT app_accessible_client_ids()))
  WITH CHECK (app_is_staff() AND client_id IN (SELECT app_accessible_client_ids()));

DROP POLICY IF EXISTS cash_receipt_lines_select ON cash_receipt_lines;
DROP POLICY IF EXISTS cash_receipt_lines_write ON cash_receipt_lines;
CREATE POLICY cash_receipt_lines_select ON cash_receipt_lines FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM cash_receipts cr
    WHERE cr.id = cash_receipt_lines.cash_receipt_id AND cr.client_id IN (SELECT app_accessible_client_ids())
  ));
CREATE POLICY cash_receipt_lines_write ON cash_receipt_lines FOR ALL
  USING (app_is_staff() AND EXISTS (
    SELECT 1 FROM cash_receipts cr
    WHERE cr.id = cash_receipt_lines.cash_receipt_id AND cr.client_id IN (SELECT app_accessible_client_ids())
  ))
  WITH CHECK (app_is_staff() AND EXISTS (
    SELECT 1 FROM cash_receipts cr
    WHERE cr.id = cash_receipt_lines.cash_receipt_id AND cr.client_id IN (SELECT app_accessible_client_ids())
  ));

DROP POLICY IF EXISTS cash_disbursements_select ON cash_disbursements;
DROP POLICY IF EXISTS cash_disbursements_write ON cash_disbursements;
CREATE POLICY cash_disbursements_select ON cash_disbursements FOR SELECT
  USING (client_id IN (SELECT app_accessible_client_ids()));
CREATE POLICY cash_disbursements_write ON cash_disbursements FOR ALL
  USING (app_is_staff() AND client_id IN (SELECT app_accessible_client_ids()))
  WITH CHECK (app_is_staff() AND client_id IN (SELECT app_accessible_client_ids()));

DROP POLICY IF EXISTS cash_disbursement_lines_select ON cash_disbursement_lines;
DROP POLICY IF EXISTS cash_disbursement_lines_write ON cash_disbursement_lines;
CREATE POLICY cash_disbursement_lines_select ON cash_disbursement_lines FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM cash_disbursements cd
    WHERE cd.id = cash_disbursement_lines.cash_disbursement_id AND cd.client_id IN (SELECT app_accessible_client_ids())
  ));
CREATE POLICY cash_disbursement_lines_write ON cash_disbursement_lines FOR ALL
  USING (app_is_staff() AND EXISTS (
    SELECT 1 FROM cash_disbursements cd
    WHERE cd.id = cash_disbursement_lines.cash_disbursement_id AND cd.client_id IN (SELECT app_accessible_client_ids())
  ))
  WITH CHECK (app_is_staff() AND EXISTS (
    SELECT 1 FROM cash_disbursements cd
    WHERE cd.id = cash_disbursement_lines.cash_disbursement_id AND cd.client_id IN (SELECT app_accessible_client_ids())
  ));

-- 6. journal_lines
DROP POLICY IF EXISTS journal_lines_select ON journal_lines;
DROP POLICY IF EXISTS journal_lines_write ON journal_lines;
CREATE POLICY journal_lines_select ON journal_lines FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM journal_entries je
    WHERE je.id = journal_lines.entry_id AND je.client_id IN (SELECT app_accessible_client_ids())
  ));
CREATE POLICY journal_lines_write ON journal_lines FOR ALL
  USING (app_is_staff() AND EXISTS (
    SELECT 1 FROM journal_entries je
    WHERE je.id = journal_lines.entry_id AND je.client_id IN (SELECT app_accessible_client_ids())
  ))
  WITH CHECK (app_is_staff() AND EXISTS (
    SELECT 1 FROM journal_entries je
    WHERE je.id = journal_lines.entry_id AND je.client_id IN (SELECT app_accessible_client_ids())
  ));

-- 5. journal_entries
DROP POLICY IF EXISTS journal_entries_select ON journal_entries;
DROP POLICY IF EXISTS journal_entries_insert ON journal_entries;
DROP POLICY IF EXISTS journal_entries_update ON journal_entries;
DROP POLICY IF EXISTS journal_entries_delete ON journal_entries;
CREATE POLICY journal_entries_select ON journal_entries FOR SELECT
  USING (client_id IN (SELECT app_accessible_client_ids()));
CREATE POLICY journal_entries_write ON journal_entries FOR ALL
  USING (app_is_staff() AND client_id IN (SELECT app_accessible_client_ids()))
  WITH CHECK (app_is_staff() AND client_id IN (SELECT app_accessible_client_ids()));

-- 4. client_tax_types / accounts / contacts
DROP POLICY IF EXISTS client_tax_types_write ON client_tax_types;
CREATE POLICY client_tax_types_write ON client_tax_types FOR ALL
  USING (app_is_staff() AND client_id IN (SELECT app_accessible_client_ids()))
  WITH CHECK (app_is_staff() AND client_id IN (SELECT app_accessible_client_ids()));

DROP POLICY IF EXISTS accounts_write ON accounts;
CREATE POLICY accounts_write ON accounts FOR ALL
  USING (app_is_staff() AND client_id IN (SELECT app_accessible_client_ids()))
  WITH CHECK (app_is_staff() AND client_id IN (SELECT app_accessible_client_ids()));

DROP POLICY IF EXISTS contacts_write ON contacts;
CREATE POLICY contacts_write ON contacts FOR ALL
  USING (app_is_staff() AND client_id IN (SELECT app_accessible_client_ids()))
  WITH CHECK (app_is_staff() AND client_id IN (SELECT app_accessible_client_ids()));

-- 3. clients
DROP POLICY IF EXISTS clients_insert ON clients;
CREATE POLICY clients_insert ON clients FOR INSERT
  WITH CHECK (app_current_role() = 'firm_admin' AND firm_id = app_current_firm_id());

DROP POLICY IF EXISTS clients_update ON clients;
CREATE POLICY clients_update ON clients FOR UPDATE
  USING (app_is_staff() AND id IN (SELECT app_accessible_client_ids()));

-- 2. Reviewer status-only trigger
DROP TRIGGER IF EXISTS journal_entries_reviewer_status_only ON journal_entries;
DROP FUNCTION IF EXISTS enforce_reviewer_status_only_update();

-- 1. Helper functions + app_accessible_client_ids() restored to its
-- original (pre-access_scope) body.
DROP FUNCTION IF EXISTS app_can_manage_structure();
DROP FUNCTION IF EXISTS app_can_encode();

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
      u.role IN ('bookkeeper', 'reviewer')
      AND c.firm_id = u.firm_id
      AND EXISTS (
        SELECT 1 FROM user_client_assignments a
        WHERE a.user_id = u.id AND a.client_id = c.id
      )
    )
    OR (u.role = 'client_user' AND c.id = u.client_id)
$$;

-- 0. access_scope backfill is NOT reverted — there is no prior value to
-- restore to (the column didn't exist before 009 ran), and leaving every
-- row's access_scope as-is is harmless once the RLS function above no
-- longer reads it.
