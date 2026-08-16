-- ============================================================================
-- Keep.Books — functions, triggers, and Row-Level Security policies.
--
-- This file encodes the non-negotiable engineering rules (SPEC.md §2) at the
-- DATABASE level, not just in application code:
--   #2 double-entry enforced by the DB
--   #3 posted entries are immutable (correction = reversing entry)
--   #4 every mutation is audit-logged
--   #5 locked periods reject new postings
--   #7 multi-tenant isolation via Postgres RLS
--
-- Must be run by the schema-owning role (MIGRATION_DATABASE_URL), AFTER the
-- drizzle-kit generated table migrations. The app connects as a separate,
-- non-owner role (keepbooks_app / DATABASE_URL) so RLS actually applies —
-- table owners bypass RLS by default in Postgres.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Runtime role grants
-- ----------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO keepbooks_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO keepbooks_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO keepbooks_app;

-- ----------------------------------------------------------------------------
-- 1. Session context + tenancy helper functions
--
-- The app sets app.current_user_id per-transaction via set_config() (see
-- db/client.ts withUserContext). These helpers are SECURITY DEFINER so they
-- can read `users` / `clients` / `user_client_assignments` internally without
-- themselves being blocked by the very RLS policies they compute — mirrors
-- how Supabase's auth.uid()/auth.jwt() work.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_current_user_id() RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app_current_role() RETURNS user_role
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM users WHERE id = app_current_user_id() AND active
$$;

CREATE OR REPLACE FUNCTION app_current_firm_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT firm_id FROM users WHERE id = app_current_user_id() AND active
$$;

CREATE OR REPLACE FUNCTION app_current_client_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT client_id FROM users WHERE id = app_current_user_id() AND active
$$;

CREATE OR REPLACE FUNCTION app_is_staff() RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT app_current_role() IN ('firm_admin', 'bookkeeper', 'reviewer')
$$;

-- The set of client ids the current session's user may access.
-- firm_admin: every client in their firm.
-- bookkeeper/reviewer: clients explicitly assigned to them.
-- client_user: only their own client.
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

-- ----------------------------------------------------------------------------
-- 2. Audit log (rule #4): generic trigger, attached per-table below.
-- SECURITY DEFINER so logging can never be skipped by an RLS policy on
-- audit_log itself blocking the INSERT.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION audit_row_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log(actor_user_id, action, table_name, record_id, before, after)
    VALUES (app_current_user_id(), TG_OP, TG_TABLE_NAME, OLD.id::text, to_jsonb(OLD), NULL);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_log(actor_user_id, action, table_name, record_id, before, after)
    VALUES (app_current_user_id(), TG_OP, TG_TABLE_NAME, NEW.id::text, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSE
    INSERT INTO audit_log(actor_user_id, action, table_name, record_id, before, after)
    VALUES (app_current_user_id(), TG_OP, TG_TABLE_NAME, NEW.id::text, NULL, to_jsonb(NEW));
    RETURN NEW;
  END IF;
END;
$$;

CREATE TRIGGER audit_clients AFTER INSERT OR UPDATE OR DELETE ON clients FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_accounts AFTER INSERT OR UPDATE OR DELETE ON accounts FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_contacts AFTER INSERT OR UPDATE OR DELETE ON contacts FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_journal_entries AFTER INSERT OR UPDATE OR DELETE ON journal_entries FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_sales_invoices AFTER INSERT OR UPDATE OR DELETE ON sales_invoices FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_purchases AFTER INSERT OR UPDATE OR DELETE ON purchases FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_cash_receipts AFTER INSERT OR UPDATE OR DELETE ON cash_receipts FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_cash_disbursements AFTER INSERT OR UPDATE OR DELETE ON cash_disbursements FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_period_locks AFTER INSERT OR UPDATE OR DELETE ON period_locks FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_users AFTER INSERT OR UPDATE OR DELETE ON users FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_tax_rules AFTER INSERT OR UPDATE OR DELETE ON tax_rules FOR EACH ROW EXECUTE FUNCTION audit_row_change();

-- ----------------------------------------------------------------------------
-- 3. Double-entry balance enforcement (rule #2)
--
-- Two triggers cover both ways an entry can become posted within a
-- transaction: (a) lines change while already posted (shouldn't happen given
-- immutability, but re-verified as defense in depth via a DEFERRED constraint
-- trigger so multi-row line inserts within one transaction only get checked
-- once, at commit); (b) status flips to 'posted'.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_journal_lines_balance() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_entry_id uuid;
  v_status entry_status;
  v_debit bigint;
  v_credit bigint;
BEGIN
  v_entry_id := COALESCE(NEW.entry_id, OLD.entry_id);
  SELECT status INTO v_status FROM journal_entries WHERE id = v_entry_id;
  IF v_status IN ('posted', 'reversed') THEN
    SELECT COALESCE(SUM(debit_centavos), 0), COALESCE(SUM(credit_centavos), 0)
      INTO v_debit, v_credit
      FROM journal_lines WHERE entry_id = v_entry_id;
    IF v_debit <> v_credit THEN
      RAISE EXCEPTION 'Journal entry % is out of balance: debit=% credit=%', v_entry_id, v_debit, v_credit;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER journal_lines_balance_trigger
AFTER INSERT OR UPDATE OR DELETE ON journal_lines
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION check_journal_lines_balance();

CREATE OR REPLACE FUNCTION check_journal_entry_balance_on_post() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_debit bigint;
  v_credit bigint;
  v_count int;
BEGIN
  IF NEW.status = 'posted' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'posted') THEN
    SELECT COALESCE(SUM(debit_centavos), 0), COALESCE(SUM(credit_centavos), 0), COUNT(*)
      INTO v_debit, v_credit, v_count
      FROM journal_lines WHERE entry_id = NEW.id;
    IF v_count < 2 THEN
      RAISE EXCEPTION 'Journal entry % must have at least two lines to post', NEW.id;
    END IF;
    IF v_debit <> v_credit THEN
      RAISE EXCEPTION 'Journal entry % is out of balance: debit=% credit=%', NEW.id, v_debit, v_credit;
    END IF;
    IF v_debit = 0 THEN
      RAISE EXCEPTION 'Journal entry % has a zero total and cannot be posted', NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER journal_entries_balance_on_post
BEFORE INSERT OR UPDATE ON journal_entries
FOR EACH ROW EXECUTE FUNCTION check_journal_entry_balance_on_post();

-- ----------------------------------------------------------------------------
-- 4. Immutability of posted entries (rule #3)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_journal_entry_immutability() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('posted', 'reversed') THEN
      RAISE EXCEPTION 'Cannot delete a % journal entry (%). Use a reversing entry instead.', OLD.status, OLD.id;
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'posted' THEN
    -- The ONLY mutation ever allowed on a posted entry: flipping status to
    -- 'reversed' when a reversal is recorded against it. Every other column,
    -- including the lines, is frozen.
    IF NEW.status = 'reversed'
      AND NEW.entry_no IS NOT DISTINCT FROM OLD.entry_no
      AND NEW.entry_date IS NOT DISTINCT FROM OLD.entry_date
      AND NEW.book IS NOT DISTINCT FROM OLD.book
      AND NEW.reference_no IS NOT DISTINCT FROM OLD.reference_no
      AND NEW.description IS NOT DISTINCT FROM OLD.description
      AND NEW.client_id IS NOT DISTINCT FROM OLD.client_id
      AND NEW.source_document_id IS NOT DISTINCT FROM OLD.source_document_id
      AND NEW.posted_by IS NOT DISTINCT FROM OLD.posted_by
      AND NEW.posted_at IS NOT DISTINCT FROM OLD.posted_at
      AND NEW.reversal_of_entry_id IS NOT DISTINCT FROM OLD.reversal_of_entry_id
    THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Posted journal entry % is immutable. Use a reversing entry instead.', OLD.id;
  ELSIF OLD.status = 'reversed' THEN
    RAISE EXCEPTION 'Journal entry % has already been reversed and is immutable.', OLD.id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER journal_entries_immutability
BEFORE UPDATE OR DELETE ON journal_entries
FOR EACH ROW EXECUTE FUNCTION enforce_journal_entry_immutability();

CREATE OR REPLACE FUNCTION enforce_journal_line_immutability() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_status entry_status;
BEGIN
  SELECT status INTO v_status FROM journal_entries WHERE id = COALESCE(NEW.entry_id, OLD.entry_id);
  IF v_status IN ('posted', 'reversed') THEN
    RAISE EXCEPTION 'Lines of a % journal entry are immutable.', v_status;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER journal_lines_immutability
BEFORE UPDATE OR DELETE ON journal_lines
FOR EACH ROW EXECUTE FUNCTION enforce_journal_line_immutability();

-- ----------------------------------------------------------------------------
-- 5. Period locks (rule #5)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_period_lock() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'posted' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'posted') THEN
    IF EXISTS (
      SELECT 1 FROM period_locks pl
      WHERE pl.client_id = NEW.client_id
        AND pl.unlocked_at IS NULL
        AND NEW.entry_date BETWEEN pl.period_start AND pl.period_end
    ) THEN
      RAISE EXCEPTION 'Cannot post journal entry dated % — the period is locked for this client', NEW.entry_date;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER journal_entries_period_lock
BEFORE INSERT OR UPDATE ON journal_entries
FOR EACH ROW EXECUTE FUNCTION enforce_period_lock();

-- ----------------------------------------------------------------------------
-- 6. Gapless per-client entry numbering
--
-- Called by the posting function inside the same transaction that flips
-- status to 'posted'. Atomic via the INSERT ... ON CONFLICT row lock — safe
-- under concurrent posting for the same client.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION assign_client_entry_no(p_client_id uuid) RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_assigned integer;
BEGIN
  INSERT INTO client_counters (client_id, counter_name, next_value)
  VALUES (p_client_id, 'journal_entry_no', 2)
  ON CONFLICT (client_id, counter_name)
  DO UPDATE SET next_value = client_counters.next_value + 1
  RETURNING (next_value - 1) INTO v_assigned;
  RETURN v_assigned;
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. Row-Level Security (rule #7)
-- ----------------------------------------------------------------------------

-- firms: a user sees only their own firm row.
ALTER TABLE firms ENABLE ROW LEVEL SECURITY;
CREATE POLICY firms_select ON firms FOR SELECT USING (id = app_current_firm_id());

-- users: visible within your own firm (or yourself); mutable by firm_admin only.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_select ON users FOR SELECT
  USING (id = app_current_user_id() OR firm_id = app_current_firm_id());
CREATE POLICY users_insert ON users FOR INSERT
  WITH CHECK (app_current_role() = 'firm_admin' AND firm_id = app_current_firm_id());
CREATE POLICY users_update ON users FOR UPDATE
  USING (app_current_role() = 'firm_admin' AND firm_id = app_current_firm_id());

-- user_client_assignments: same-firm staff can see; firm_admin manages.
ALTER TABLE user_client_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY uca_select ON user_client_assignments FOR SELECT
  USING (client_id IN (SELECT app_accessible_client_ids()));
CREATE POLICY uca_write ON user_client_assignments FOR ALL
  USING (app_current_role() = 'firm_admin')
  WITH CHECK (app_current_role() = 'firm_admin');

-- clients
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY clients_select ON clients FOR SELECT
  USING (id IN (SELECT app_accessible_client_ids()));
CREATE POLICY clients_insert ON clients FOR INSERT
  WITH CHECK (app_current_role() = 'firm_admin' AND firm_id = app_current_firm_id());
CREATE POLICY clients_update ON clients FOR UPDATE
  USING (app_is_staff() AND id IN (SELECT app_accessible_client_ids()));

-- client_tax_types
ALTER TABLE client_tax_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY client_tax_types_select ON client_tax_types FOR SELECT
  USING (client_id IN (SELECT app_accessible_client_ids()));
CREATE POLICY client_tax_types_write ON client_tax_types FOR ALL
  USING (app_is_staff() AND client_id IN (SELECT app_accessible_client_ids()))
  WITH CHECK (app_is_staff() AND client_id IN (SELECT app_accessible_client_ids()));

-- tax_rules: global reference data (BIR rates aren't firm-specific). Any
-- logged-in user may read; only firm_admin may maintain it.
ALTER TABLE tax_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY tax_rules_select ON tax_rules FOR SELECT USING (app_current_user_id() IS NOT NULL);
CREATE POLICY tax_rules_write ON tax_rules FOR ALL
  USING (app_current_role() = 'firm_admin')
  WITH CHECK (app_current_role() = 'firm_admin');

-- audit_log: firm_admin/reviewer only, scoped to actors within their firm.
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_log_select ON audit_log FOR SELECT
  USING (
    app_current_role() IN ('firm_admin', 'reviewer')
    AND EXISTS (
      SELECT 1 FROM users au WHERE au.id = audit_log.actor_user_id AND au.firm_id = app_current_firm_id()
    )
  );
-- No INSERT/UPDATE/DELETE policy for the app role: rows are written only by
-- the SECURITY DEFINER audit_row_change() trigger, which bypasses RLS.

-- accounts
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY accounts_select ON accounts FOR SELECT
  USING (client_id IN (SELECT app_accessible_client_ids()));
CREATE POLICY accounts_write ON accounts FOR ALL
  USING (app_is_staff() AND client_id IN (SELECT app_accessible_client_ids()))
  WITH CHECK (app_is_staff() AND client_id IN (SELECT app_accessible_client_ids()));

-- contacts
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY contacts_select ON contacts FOR SELECT
  USING (client_id IN (SELECT app_accessible_client_ids()));
CREATE POLICY contacts_write ON contacts FOR ALL
  USING (app_is_staff() AND client_id IN (SELECT app_accessible_client_ids()))
  WITH CHECK (app_is_staff() AND client_id IN (SELECT app_accessible_client_ids()));

-- client_counters (internal sequence table)
ALTER TABLE client_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY client_counters_select ON client_counters FOR SELECT
  USING (client_id IN (SELECT app_accessible_client_ids()));
CREATE POLICY client_counters_write ON client_counters FOR ALL
  USING (app_is_staff() AND client_id IN (SELECT app_accessible_client_ids()))
  WITH CHECK (app_is_staff() AND client_id IN (SELECT app_accessible_client_ids()));

-- journal_entries
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY journal_entries_select ON journal_entries FOR SELECT
  USING (client_id IN (SELECT app_accessible_client_ids()));
CREATE POLICY journal_entries_write ON journal_entries FOR ALL
  USING (app_is_staff() AND client_id IN (SELECT app_accessible_client_ids()))
  WITH CHECK (app_is_staff() AND client_id IN (SELECT app_accessible_client_ids()));

-- journal_lines (no client_id column — join through the parent entry)
ALTER TABLE journal_lines ENABLE ROW LEVEL SECURITY;
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

-- sales_invoices
ALTER TABLE sales_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY sales_invoices_select ON sales_invoices FOR SELECT
  USING (client_id IN (SELECT app_accessible_client_ids()));
CREATE POLICY sales_invoices_write ON sales_invoices FOR ALL
  USING (app_is_staff() AND client_id IN (SELECT app_accessible_client_ids()))
  WITH CHECK (app_is_staff() AND client_id IN (SELECT app_accessible_client_ids()));

-- purchases
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY purchases_select ON purchases FOR SELECT
  USING (client_id IN (SELECT app_accessible_client_ids()));
CREATE POLICY purchases_write ON purchases FOR ALL
  USING (app_is_staff() AND client_id IN (SELECT app_accessible_client_ids()))
  WITH CHECK (app_is_staff() AND client_id IN (SELECT app_accessible_client_ids()));

-- cash_receipts / cash_receipt_lines
ALTER TABLE cash_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY cash_receipts_select ON cash_receipts FOR SELECT
  USING (client_id IN (SELECT app_accessible_client_ids()));
CREATE POLICY cash_receipts_write ON cash_receipts FOR ALL
  USING (app_is_staff() AND client_id IN (SELECT app_accessible_client_ids()))
  WITH CHECK (app_is_staff() AND client_id IN (SELECT app_accessible_client_ids()));

ALTER TABLE cash_receipt_lines ENABLE ROW LEVEL SECURITY;
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

-- cash_disbursements / cash_disbursement_lines
ALTER TABLE cash_disbursements ENABLE ROW LEVEL SECURITY;
CREATE POLICY cash_disbursements_select ON cash_disbursements FOR SELECT
  USING (client_id IN (SELECT app_accessible_client_ids()));
CREATE POLICY cash_disbursements_write ON cash_disbursements FOR ALL
  USING (app_is_staff() AND client_id IN (SELECT app_accessible_client_ids()))
  WITH CHECK (app_is_staff() AND client_id IN (SELECT app_accessible_client_ids()));

ALTER TABLE cash_disbursement_lines ENABLE ROW LEVEL SECURITY;
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

-- period_locks
ALTER TABLE period_locks ENABLE ROW LEVEL SECURITY;
CREATE POLICY period_locks_select ON period_locks FOR SELECT
  USING (client_id IN (SELECT app_accessible_client_ids()));
CREATE POLICY period_locks_write ON period_locks FOR ALL
  USING (app_current_role() = 'firm_admin' AND client_id IN (SELECT app_accessible_client_ids()))
  WITH CHECK (app_current_role() = 'firm_admin' AND client_id IN (SELECT app_accessible_client_ids()));
