import { describe, expect, it } from "vitest";
import { describeAuditEntry } from "../audit-log-labels";

describe("describeAuditEntry", () => {
  it("describes a successful login", () => {
    expect(describeAuditEntry({ action: "LOGIN", tableName: "users", before: null, after: null, reason: null })).toBe(
      "Signed in"
    );
  });

  it("describes a logout", () => {
    expect(describeAuditEntry({ action: "LOGOUT", tableName: "users", before: null, after: null, reason: null })).toBe(
      "Signed out"
    );
  });

  it("describes a failed login with its reason", () => {
    expect(
      describeAuditEntry({ action: "LOGIN_FAILED", tableName: "users", before: null, after: null, reason: "Incorrect password" })
    ).toBe("Failed sign-in attempt (Incorrect password)");
  });

  it("describes a failed login with no reason", () => {
    expect(describeAuditEntry({ action: "LOGIN_FAILED", tableName: "users", before: null, after: null, reason: null })).toBe(
      "Failed sign-in attempt"
    );
  });

  it("describes a role change on a users row", () => {
    expect(
      describeAuditEntry({
        action: "UPDATE",
        tableName: "users",
        before: { role: "bookkeeper", active: true },
        after: { role: "reviewer", active: true },
        reason: null,
      })
    ).toBe("Role changed: bookkeeper → reviewer");
  });

  it("describes an account deactivation", () => {
    expect(
      describeAuditEntry({
        action: "UPDATE",
        tableName: "users",
        before: { role: "bookkeeper", active: true },
        after: { role: "bookkeeper", active: false },
        reason: null,
      })
    ).toBe("Account deactivated");
  });

  it("describes an account reactivation", () => {
    expect(
      describeAuditEntry({
        action: "UPDATE",
        tableName: "users",
        before: { role: "bookkeeper", active: false },
        after: { role: "bookkeeper", active: true },
        reason: null,
      })
    ).toBe("Account reactivated");
  });

  it("falls back to a generic update label when a users row changes but not role/active", () => {
    expect(
      describeAuditEntry({
        action: "UPDATE",
        tableName: "users",
        before: { role: "bookkeeper", active: true, name: "Old Name" },
        after: { role: "bookkeeper", active: true, name: "New Name" },
        reason: null,
      })
    ).toBe("Updated user");
  });

  it("describes a plain insert on a known table with a friendly label", () => {
    expect(
      describeAuditEntry({ action: "INSERT", tableName: "sales_invoices", before: null, after: null, reason: null })
    ).toBe("Created sales invoice");
  });

  it("describes a delete on a known table", () => {
    expect(describeAuditEntry({ action: "DELETE", tableName: "contacts", before: null, after: null, reason: null })).toBe(
      "Deleted contact"
    );
  });

  it("falls back to the raw table name for an unrecognized table", () => {
    expect(
      describeAuditEntry({ action: "UPDATE", tableName: "some_new_table", before: null, after: null, reason: null })
    ).toBe("Updated some_new_table");
  });
});
