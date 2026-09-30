-- ============================================================================
-- 019_client_read_only_enforcement.sql
--
-- Trial & Plan Limits: the second half of "the rest become read-only with
-- export still available, not deleted." 017's `inactive` status already
-- excludes a client from the plan-limit count (018); this closes the loop
-- by actually blocking new transaction entry against an `inactive` client
-- — export/read access is untouched, since nothing here touches SELECT.
--
-- Deliberately a BEFORE INSERT OR UPDATE trigger layered on top of RLS,
-- not a rewrite of the five tables' existing write policies — same
-- reasoning 018's three triggers already used: it's a firm-state
-- invariant independent of *who* is writing (Owner included), not a role
-- permission, and it never needs to duplicate any policy's USING/WITH
-- CHECK logic.
--
-- Scoped to the five transaction-creating tables (journal_entries,
-- sales_invoices, purchases, cash_receipts, cash_disbursements) — "new
-- transaction entry" is what was asked for. Structural tables (accounts,
-- contacts, client_tax_types) are NOT blocked: editing a client's chart
-- of accounts while it's read-only isn't "entering a new transaction,"
-- and blocking it too would be a bigger read-only surface than asked for.
--
-- Known simplification: this also blocks UPDATE on an already-posted
-- entry's status (e.g. recording a reversal against an old entry from a
-- now-inactive client) — correcting historical books for a client you can
-- no longer add new work for is a genuinely debatable case, not
-- something this pass resolves either way. Flagged here rather than
-- silently decided; revisit if it turns out to matter in practice.
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_client_writable() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_status client_status;
BEGIN
  SELECT status INTO v_status FROM clients WHERE id = NEW.client_id;
  IF v_status = 'inactive' THEN
    RAISE EXCEPTION 'This client is read-only on your current plan. Upgrade, or make room under your plan''s client limit, to resume adding transactions.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER journal_entries_enforce_client_writable
BEFORE INSERT OR UPDATE ON journal_entries
FOR EACH ROW EXECUTE FUNCTION enforce_client_writable();

CREATE TRIGGER sales_invoices_enforce_client_writable
BEFORE INSERT OR UPDATE ON sales_invoices
FOR EACH ROW EXECUTE FUNCTION enforce_client_writable();

CREATE TRIGGER purchases_enforce_client_writable
BEFORE INSERT OR UPDATE ON purchases
FOR EACH ROW EXECUTE FUNCTION enforce_client_writable();

CREATE TRIGGER cash_receipts_enforce_client_writable
BEFORE INSERT OR UPDATE ON cash_receipts
FOR EACH ROW EXECUTE FUNCTION enforce_client_writable();

CREATE TRIGGER cash_disbursements_enforce_client_writable
BEFORE INSERT OR UPDATE ON cash_disbursements
FOR EACH ROW EXECUTE FUNCTION enforce_client_writable();
