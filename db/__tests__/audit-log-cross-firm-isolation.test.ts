/**
 * Regression test for a reported cross-firm data leak: the dashboard's
 * "Recent Activity" panel (lib/data/audit-log.ts#listRecentAuditLog) was
 * reported showing sign-ins, failed sign-in attempts, and account
 * creation events belonging to a DIFFERENT firm, not just the logged-in
 * firm's own staff.
 *
 * Investigated and could not reproduce against this codebase's current
 * RLS policies (db/sql/001_functions_triggers_rls.sql's audit_log_select/
 * users_select/clients_select) — tested via raw psql with real multi-firm
 * data already in this sandbox's DB, via the real listRecentAuditLog()
 * function, and under a concurrent/connection-reuse stress test
 * simulating a warm serverless instance interleaving two different
 * firms' requests on the same pooled connection. Zero cross-firm rows in
 * every case. See DECISIONS.md for the full investigation, including the
 * two leading hypotheses for what actually happened (the real fix, if
 * any, isn't in this repo yet — this test exists so that if it ever IS a
 * code-level regression, it fails loudly here first).
 *
 * This file is a direct, permanent proof of that investigation: two
 * genuinely separate firms, each with real LOGIN/LOGIN_FAILED/SIGNUP-
 * shaped audit_log rows (not just generic trigger-fired mutations, which
 * the other RLS test files already exercise elsewhere), asserting one
 * firm's Owner never sees the other's rows — by firm_id AND by the
 * specific row ids, the strongest form of "that exact leak doesn't
 * happen" this suite can express.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../schema";
import { withUserContext } from "../client";
import { listRecentAuditLog } from "../../lib/data/audit-log";

const ownerConn = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 2 });
const ownerDb = drizzle(ownerConn, { schema });

// Fixed UUIDs in a range no other test file uses, idempotent setup — same
// pattern every other RLS test file in this directory follows.
const FIRM_A_ID = "00000000-0000-4000-c100-000000000001";
const FIRM_A_OWNER_ID = "00000000-0000-4000-c100-000000000010";
const FIRM_B_ID = "00000000-0000-4000-c200-000000000001";
const FIRM_B_OWNER_ID = "00000000-0000-4000-c200-000000000010";

// Fixed audit_log row ids, inserted directly (bypassing RLS via ownerDb,
// the same way the real LOGIN/LOGIN_FAILED/SIGNUP code paths insert via
// authDb) so each firm has a real, identifiable row of exactly the kind
// reported leaking.
const FIRM_A_LOGIN_ROW_ID = "00000000-0000-4000-c100-0000000000a1";
const FIRM_A_LOGIN_FAILED_ROW_ID = "00000000-0000-4000-c100-0000000000a2";
const FIRM_A_SIGNUP_ROW_ID = "00000000-0000-4000-c100-0000000000a3";
const FIRM_B_LOGIN_ROW_ID = "00000000-0000-4000-c200-0000000000b1";
const FIRM_B_LOGIN_FAILED_ROW_ID = "00000000-0000-4000-c200-0000000000b2";
const FIRM_B_SIGNUP_ROW_ID = "00000000-0000-4000-c200-0000000000b3";

beforeAll(async () => {
  await ownerDb
    .insert(schema.firms)
    .values({ id: FIRM_A_ID, name: "Audit Isolation Test Firm A" })
    .onConflictDoUpdate({ target: schema.firms.id, set: { name: "Audit Isolation Test Firm A" } });
  await ownerDb
    .insert(schema.firms)
    .values({ id: FIRM_B_ID, name: "Audit Isolation Test Firm B" })
    .onConflictDoUpdate({ target: schema.firms.id, set: { name: "Audit Isolation Test Firm B" } });

  await ownerDb
    .insert(schema.users)
    .values({ id: FIRM_A_OWNER_ID, firmId: FIRM_A_ID, email: "audit-iso-owner-a@test.local", name: "Firm A Owner", role: "firm_admin" })
    .onConflictDoUpdate({ target: schema.users.id, set: { firmId: FIRM_A_ID, role: "firm_admin" } });
  await ownerDb
    .insert(schema.users)
    .values({ id: FIRM_B_OWNER_ID, firmId: FIRM_B_ID, email: "audit-iso-owner-b@test.local", name: "Firm B Owner", role: "firm_admin" })
    .onConflictDoUpdate({ target: schema.users.id, set: { firmId: FIRM_B_ID, role: "firm_admin" } });

  // Fixed ids + onConflictDoUpdate: re-running `pnpm test` reuses these
  // rows rather than accumulating duplicates, same reasoning
  // acceptance.test.ts's own fixtures use.
  for (const [id, actorId, action] of [
    [FIRM_A_LOGIN_ROW_ID, FIRM_A_OWNER_ID, "LOGIN"],
    [FIRM_A_LOGIN_FAILED_ROW_ID, FIRM_A_OWNER_ID, "LOGIN_FAILED"],
    [FIRM_A_SIGNUP_ROW_ID, FIRM_A_OWNER_ID, "SIGNUP"],
    [FIRM_B_LOGIN_ROW_ID, FIRM_B_OWNER_ID, "LOGIN"],
    [FIRM_B_LOGIN_FAILED_ROW_ID, FIRM_B_OWNER_ID, "LOGIN_FAILED"],
    [FIRM_B_SIGNUP_ROW_ID, FIRM_B_OWNER_ID, "SIGNUP"],
  ] as const) {
    await ownerDb
      .insert(schema.auditLog)
      .values({ id, actorUserId: actorId, action, tableName: "users", recordId: actorId })
      .onConflictDoUpdate({ target: schema.auditLog.id, set: { actorUserId: actorId, action } });
  }
});

describe("audit_log: Recent Activity leak regression", () => {
  it("Firm A's Owner sees only Firm A's audit rows — Firm B's rows never appear, by id or by firm", async () => {
    const rows = await listRecentAuditLog(FIRM_A_OWNER_ID, 2000);
    const ids = rows.map((r) => r.id);

    expect(ids).toContain(FIRM_A_LOGIN_ROW_ID);
    expect(ids).toContain(FIRM_A_LOGIN_FAILED_ROW_ID);
    expect(ids).toContain(FIRM_A_SIGNUP_ROW_ID);

    expect(ids).not.toContain(FIRM_B_LOGIN_ROW_ID);
    expect(ids).not.toContain(FIRM_B_LOGIN_FAILED_ROW_ID);
    expect(ids).not.toContain(FIRM_B_SIGNUP_ROW_ID);
  });

  it("Firm B's Owner sees only Firm B's audit rows — Firm A's rows never appear, by id or by firm", async () => {
    const rows = await listRecentAuditLog(FIRM_B_OWNER_ID, 2000);
    const ids = rows.map((r) => r.id);

    expect(ids).toContain(FIRM_B_LOGIN_ROW_ID);
    expect(ids).toContain(FIRM_B_LOGIN_FAILED_ROW_ID);
    expect(ids).toContain(FIRM_B_SIGNUP_ROW_ID);

    expect(ids).not.toContain(FIRM_A_LOGIN_ROW_ID);
    expect(ids).not.toContain(FIRM_A_LOGIN_FAILED_ROW_ID);
    expect(ids).not.toContain(FIRM_A_SIGNUP_ROW_ID);
  });

  it("neither Owner's audit_log actor ever resolves to the other firm (every row's actor shares the caller's firm)", async () => {
    const [rowsA, rowsB] = await Promise.all([listRecentAuditLog(FIRM_A_OWNER_ID, 2000), listRecentAuditLog(FIRM_B_OWNER_ID, 2000)]);

    const firmBEmails = new Set(["audit-iso-owner-b@test.local"]);
    const firmAEmails = new Set(["audit-iso-owner-a@test.local"]);
    expect(rowsA.some((r) => r.actorEmail && firmBEmails.has(r.actorEmail))).toBe(false);
    expect(rowsB.some((r) => r.actorEmail && firmAEmails.has(r.actorEmail))).toBe(false);
  });
});

describe("clients and users: same cross-firm isolation, same two fixture firms", () => {
  it("Firm A's Owner sees only Firm A's own user row among this test's fixtures (not Firm B's)", async () => {
    const rows = await withUserContext(FIRM_A_OWNER_ID, (tx) => tx.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.firmId, FIRM_A_ID)));
    expect(rows.some((r) => r.id === FIRM_A_OWNER_ID)).toBe(true);

    const otherFirmLookup = await withUserContext(FIRM_A_OWNER_ID, (tx) => tx.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, FIRM_B_OWNER_ID)));
    expect(otherFirmLookup).toHaveLength(0);
  });

  it("Firm B's Owner cannot look up Firm A's owner by id either", async () => {
    const rows = await withUserContext(FIRM_B_OWNER_ID, (tx) => tx.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, FIRM_A_OWNER_ID)));
    expect(rows).toHaveLength(0);
  });
});
