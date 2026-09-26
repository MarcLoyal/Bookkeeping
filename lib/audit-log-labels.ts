/**
 * Turns a raw audit_log row (action + table + before/after JSON) into a
 * plain-English description for the firm-facing Audit Log page. Pure and
 * DB-free so it's unit-testable; callers pass in only the fields needed —
 * never the full before/after row (which can include sensitive columns
 * like users.password_hash) so this function is also the boundary that
 * keeps that data from ever reaching a client component.
 */

const TABLE_LABELS: Record<string, string> = {
  clients: "client",
  accounts: "account",
  contacts: "contact",
  journal_entries: "journal entry",
  sales_invoices: "sales invoice",
  purchases: "purchase",
  cash_receipts: "cash receipt",
  cash_disbursements: "cash disbursement",
  period_locks: "period lock",
  users: "user",
  tax_rules: "tax rule",
  employees: "employee",
  payroll_runs: "payroll run",
  sss_contribution_brackets: "SSS bracket",
  withholding_tax_brackets: "withholding tax bracket",
};

export type AuditEntryInput = {
  action: string;
  tableName: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
};

export function describeAuditEntry(entry: AuditEntryInput): string {
  if (entry.action === "LOGIN") return "Signed in";
  if (entry.action === "LOGOUT") return "Signed out";
  if (entry.action === "LOGIN_FAILED") return `Failed sign-in attempt${entry.reason ? ` (${entry.reason})` : ""}`;

  const label = TABLE_LABELS[entry.tableName] ?? entry.tableName;

  if (entry.tableName === "users" && entry.action === "UPDATE" && entry.before && entry.after) {
    const beforeRole = entry.before.role;
    const afterRole = entry.after.role;
    if (typeof beforeRole === "string" && typeof afterRole === "string" && beforeRole !== afterRole) {
      return `Role changed: ${beforeRole} → ${afterRole}`;
    }
    const beforeActive = entry.before.active;
    const afterActive = entry.after.active;
    if (typeof beforeActive === "boolean" && typeof afterActive === "boolean" && beforeActive !== afterActive) {
      return afterActive ? "Account reactivated" : "Account deactivated";
    }
  }

  switch (entry.action) {
    case "INSERT":
      return `Created ${label}`;
    case "UPDATE":
      return `Updated ${label}`;
    case "DELETE":
      return `Deleted ${label}`;
    default:
      return `${entry.action} ${label}`;
  }
}
