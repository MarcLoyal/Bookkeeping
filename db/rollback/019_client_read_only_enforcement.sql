-- Rollback for 019_client_read_only_enforcement.sql. Deliberately in
-- db/rollback/, not db/sql/ — see 009_team_roles_rls.sql's rollback for
-- why db:migrate's directory scan makes that unsafe (same reasoning,
-- same repo).
--
-- After running this, also remove
-- '019_client_read_only_enforcement.sql' from _sql_migrations_applied so
-- a future `pnpm db:migrate` will re-apply it if desired:
--   delete from _sql_migrations_applied where filename = '019_client_read_only_enforcement.sql';

DROP TRIGGER IF EXISTS cash_disbursements_enforce_client_writable ON cash_disbursements;
DROP TRIGGER IF EXISTS cash_receipts_enforce_client_writable ON cash_receipts;
DROP TRIGGER IF EXISTS purchases_enforce_client_writable ON purchases;
DROP TRIGGER IF EXISTS sales_invoices_enforce_client_writable ON sales_invoices;
DROP TRIGGER IF EXISTS journal_entries_enforce_client_writable ON journal_entries;
DROP FUNCTION IF EXISTS enforce_client_writable();
