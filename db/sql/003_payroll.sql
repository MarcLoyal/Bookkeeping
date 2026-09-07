-- ============================================================================
-- Keep.Books — Payroll subsystem: RLS + audit triggers.
--
-- Table shapes mirror existing patterns:
--   employees / payroll_runs: client-scoped like sales_invoices/purchases
--     (same RLS shape, same audit trigger, no bespoke immutability trigger —
--     sales_invoices/purchases don't have one either; the linked
--     journal_entries row is what's actually immutable once posted).
--   payslips: no client_id column, joins through the parent payroll_runs —
--     same shape as journal_lines/cash_receipt_lines, and likewise not
--     independently audited (only the parent document is).
--   sss_contribution_brackets / withholding_tax_brackets: global reference
--     data, same "any logged-in user reads, firm_admin writes" shape as
--     tax_rules.
-- ============================================================================

-- employees
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY employees_select ON employees FOR SELECT
  USING (client_id IN (SELECT app_accessible_client_ids()));
CREATE POLICY employees_write ON employees FOR ALL
  USING (app_is_staff() AND client_id IN (SELECT app_accessible_client_ids()))
  WITH CHECK (app_is_staff() AND client_id IN (SELECT app_accessible_client_ids()));

CREATE TRIGGER audit_employees AFTER INSERT OR UPDATE OR DELETE ON employees FOR EACH ROW EXECUTE FUNCTION audit_row_change();

-- payroll_runs
ALTER TABLE payroll_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY payroll_runs_select ON payroll_runs FOR SELECT
  USING (client_id IN (SELECT app_accessible_client_ids()));
CREATE POLICY payroll_runs_write ON payroll_runs FOR ALL
  USING (app_is_staff() AND client_id IN (SELECT app_accessible_client_ids()))
  WITH CHECK (app_is_staff() AND client_id IN (SELECT app_accessible_client_ids()));

CREATE TRIGGER audit_payroll_runs AFTER INSERT OR UPDATE OR DELETE ON payroll_runs FOR EACH ROW EXECUTE FUNCTION audit_row_change();

-- payslips (no client_id column — join through the parent run)
ALTER TABLE payslips ENABLE ROW LEVEL SECURITY;
CREATE POLICY payslips_select ON payslips FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM payroll_runs pr
    WHERE pr.id = payslips.payroll_run_id AND pr.client_id IN (SELECT app_accessible_client_ids())
  ));
CREATE POLICY payslips_write ON payslips FOR ALL
  USING (app_is_staff() AND EXISTS (
    SELECT 1 FROM payroll_runs pr
    WHERE pr.id = payslips.payroll_run_id AND pr.client_id IN (SELECT app_accessible_client_ids())
  ))
  WITH CHECK (app_is_staff() AND EXISTS (
    SELECT 1 FROM payroll_runs pr
    WHERE pr.id = payslips.payroll_run_id AND pr.client_id IN (SELECT app_accessible_client_ids())
  ));

-- sss_contribution_brackets: global reference data (SSS's schedule isn't
-- firm-specific). Any logged-in user may read; only firm_admin maintains it.
ALTER TABLE sss_contribution_brackets ENABLE ROW LEVEL SECURITY;
CREATE POLICY sss_contribution_brackets_select ON sss_contribution_brackets FOR SELECT
  USING (app_current_user_id() IS NOT NULL);
CREATE POLICY sss_contribution_brackets_write ON sss_contribution_brackets FOR ALL
  USING (app_current_role() = 'firm_admin')
  WITH CHECK (app_current_role() = 'firm_admin');

CREATE TRIGGER audit_sss_contribution_brackets AFTER INSERT OR UPDATE OR DELETE ON sss_contribution_brackets FOR EACH ROW EXECUTE FUNCTION audit_row_change();

-- withholding_tax_brackets: same global-reference shape as tax_rules.
ALTER TABLE withholding_tax_brackets ENABLE ROW LEVEL SECURITY;
CREATE POLICY withholding_tax_brackets_select ON withholding_tax_brackets FOR SELECT
  USING (app_current_user_id() IS NOT NULL);
CREATE POLICY withholding_tax_brackets_write ON withholding_tax_brackets FOR ALL
  USING (app_current_role() = 'firm_admin')
  WITH CHECK (app_current_role() = 'firm_admin');

CREATE TRIGGER audit_withholding_tax_brackets AFTER INSERT OR UPDATE OR DELETE ON withholding_tax_brackets FOR EACH ROW EXECUTE FUNCTION audit_row_change();
