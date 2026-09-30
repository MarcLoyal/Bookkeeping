/**
 * db/sql/012_team_lifecycle_rls.sql — per-client assignment editing +
 * deactivate/reactivate for the Team page. A dedicated fixture set/file
 * (not appended to team-roles-rls.test.ts) since this touches `users`
 * UPDATE semantics broadly enough that sharing that file's heavily-reused
 * OWNER_ID/BOOKKEEPER_ID/etc. fixtures across ~40 other tests would risk
 * one test's deactivation leaking into another's assumptions.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../schema";
import { withUserContext } from "../client";
import { editTeamMemberAssignments } from "../../lib/auth/edit-team-member-assignments";
import { setTeamMemberActive } from "../../lib/auth/set-team-member-active";
import type { CurrentUser } from "../../lib/auth/current-user";

const ownerConn = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 2 });
const ownerDb = drizzle(ownerConn, { schema });

const FIRM_ID = "00000000-0000-4000-9400-000000000001";
const CLIENT_A_ID = "00000000-0000-4000-9400-000000000002";
const CLIENT_B_ID = "00000000-0000-4000-9400-000000000003";

const SOLE_OWNER_ID = "00000000-0000-4000-9400-000000000010"; // the only firm_admin in FIRM_ID
const BOOKKEEPER_ID = "00000000-0000-4000-9400-000000000011"; // access_scope 'assigned', granted CLIENT_A_ID only
const ENCODER_ON_A_ID = "00000000-0000-4000-9400-000000000012"; // access_scope 'assigned', granted CLIENT_A_ID — bookkeeper CAN reach
const ENCODER_ON_B_ID = "00000000-0000-4000-9400-000000000013"; // access_scope 'assigned', granted CLIENT_B_ID — bookkeeper CANNOT reach
const ENCODER_UNASSIGNED_ID = "00000000-0000-4000-9400-000000000014"; // access_scope 'assigned', zero grants
const REVIEWER_ID = "00000000-0000-4000-9400-000000000015"; // not an Encoder

// A second, independent firm with two Owners — the only way to test
// "Owner can deactivate another Owner" without ever touching the sole
// owner other tests in this file depend on staying active.
const TWO_OWNER_FIRM_ID = "00000000-0000-4000-9400-000000000020";
const OWNER_A_ID = "00000000-0000-4000-9400-000000000021";
const OWNER_B_ID = "00000000-0000-4000-9400-000000000022";

let assetAccountId: string;
let liabilityAccountId: string;

async function upsertUser(id: string, email: string, role: string, firmId: string, accessScope: "all" | "assigned" = "all") {
  await ownerDb
    .insert(schema.users)
    .values({ id, firmId, email, name: email, role: role as any, accessScope, active: true })
    .onConflictDoUpdate({ target: schema.users.id, set: { role: role as any, firmId, accessScope, active: true } });
}

beforeAll(async () => {
  // maxClients/maxUsers high enough that FIRM_ID's 6 role fixtures never
  // trip 018_plan_limits.sql's triggers — plan limits aren't what this
  // file tests. onConflictDoUpdate, not onConflictDoNothing: a firm row
  // left over from before 018 existed would otherwise keep its
  // backfilled trial-tier defaults (max_users 5) forever.
  await ownerDb
    .insert(schema.firms)
    .values([
      { id: FIRM_ID, name: "Lifecycle RLS Test Firm", plan: "enterprise", maxClients: 1000, maxUsers: 1000 },
      { id: TWO_OWNER_FIRM_ID, name: "Lifecycle RLS Test Firm (Two Owners)", plan: "enterprise", maxClients: 1000, maxUsers: 1000 },
    ])
    .onConflictDoUpdate({ target: schema.firms.id, set: { maxClients: 1000, maxUsers: 1000 } });

  for (const [id, name] of [
    [CLIENT_A_ID, "Lifecycle Test Client A"],
    [CLIENT_B_ID, "Lifecycle Test Client B"],
  ] as const) {
    await ownerDb
      .insert(schema.clients)
      .values({
        id,
        firmId: FIRM_ID,
        registeredName: name,
        tin: "000-000-000-00000",
        rdoCode: "000",
        taxpayerType: "corporation",
        vatStatus: "vat",
        incomeTaxRegime: "rcit",
        address: "Test address",
        status: "active",
      })
      .onConflictDoNothing();
  }

  await upsertUser(SOLE_OWNER_ID, "lifecycle-sole-owner@test.local", "firm_admin", FIRM_ID);
  await upsertUser(BOOKKEEPER_ID, "lifecycle-bookkeeper@test.local", "bookkeeper", FIRM_ID, "assigned");
  await upsertUser(ENCODER_ON_A_ID, "lifecycle-encoder-a@test.local", "encoder", FIRM_ID, "assigned");
  await upsertUser(ENCODER_ON_B_ID, "lifecycle-encoder-b@test.local", "encoder", FIRM_ID, "assigned");
  await upsertUser(ENCODER_UNASSIGNED_ID, "lifecycle-encoder-unassigned@test.local", "encoder", FIRM_ID, "assigned");
  // "assigned", not the upsertUser default ("all") — Reviewer may never be
  // access_scope 'all' (013_role_access_scope_check.sql's CHECK constraint).
  await upsertUser(REVIEWER_ID, "lifecycle-reviewer@test.local", "reviewer", FIRM_ID, "assigned");

  await upsertUser(OWNER_A_ID, "lifecycle-owner-a@test.local", "firm_admin", TWO_OWNER_FIRM_ID);
  await upsertUser(OWNER_B_ID, "lifecycle-owner-b@test.local", "firm_admin", TWO_OWNER_FIRM_ID);

  await ownerDb
    .insert(schema.userClientAssignments)
    .values([
      { userId: BOOKKEEPER_ID, clientId: CLIENT_A_ID },
      { userId: ENCODER_ON_A_ID, clientId: CLIENT_A_ID },
      { userId: ENCODER_ON_B_ID, clientId: CLIENT_B_ID },
    ])
    .onConflictDoNothing();

  const existingAccounts = await ownerDb.select().from(schema.accounts).where(eq(schema.accounts.clientId, CLIENT_A_ID));
  const asset = existingAccounts.find((a) => a.code === "LC-CASH");
  const liability = existingAccounts.find((a) => a.code === "LC-AP");
  if (asset) {
    assetAccountId = asset.id;
  } else {
    [{ id: assetAccountId }] = await ownerDb
      .insert(schema.accounts)
      .values({ clientId: CLIENT_A_ID, code: "LC-CASH", name: "Lifecycle Test Cash", type: "asset", normalBalance: "debit", fsLineMapping: "current_assets" })
      .returning({ id: schema.accounts.id });
  }
  if (liability) {
    liabilityAccountId = liability.id;
  } else {
    [{ id: liabilityAccountId }] = await ownerDb
      .insert(schema.accounts)
      .values({ clientId: CLIENT_A_ID, code: "LC-AP", name: "Lifecycle Test AP", type: "liability", normalBalance: "credit", fsLineMapping: "current_liabilities" })
      .returning({ id: schema.accounts.id });
  }
});

afterAll(async () => {
  await ownerConn.end();
});

async function resetActive(id: string, active: boolean) {
  await ownerDb.update(schema.users).set({ active }).where(eq(schema.users.id, id));
}

describe("users UPDATE (active): Bookkeeper deactivate/reactivate scoped to their own Encoders", () => {
  it("Bookkeeper CAN deactivate an Encoder assigned to their own client", async () => {
    await withUserContext(BOOKKEEPER_ID, (tx) => tx.update(schema.users).set({ active: false }).where(eq(schema.users.id, ENCODER_ON_A_ID)));
    const [row] = await ownerDb.select().from(schema.users).where(eq(schema.users.id, ENCODER_ON_A_ID));
    expect(row.active).toBe(false);
    await resetActive(ENCODER_ON_A_ID, true);
  });

  it("Bookkeeper CAN reactivate that same Encoder", async () => {
    await resetActive(ENCODER_ON_A_ID, false);
    await withUserContext(BOOKKEEPER_ID, (tx) => tx.update(schema.users).set({ active: true }).where(eq(schema.users.id, ENCODER_ON_A_ID)));
    const [row] = await ownerDb.select().from(schema.users).where(eq(schema.users.id, ENCODER_ON_A_ID));
    expect(row.active).toBe(true);
  });

  it("Bookkeeper CANNOT deactivate an Encoder assigned only to a client outside their access", async () => {
    await withUserContext(BOOKKEEPER_ID, (tx) => tx.update(schema.users).set({ active: false }).where(eq(schema.users.id, ENCODER_ON_B_ID)));
    const [row] = await ownerDb.select().from(schema.users).where(eq(schema.users.id, ENCODER_ON_B_ID));
    expect(row.active).toBe(true); // unchanged
  });

  it("Bookkeeper CANNOT deactivate an Encoder with zero client assignments", async () => {
    await withUserContext(BOOKKEEPER_ID, (tx) => tx.update(schema.users).set({ active: false }).where(eq(schema.users.id, ENCODER_UNASSIGNED_ID)));
    const [row] = await ownerDb.select().from(schema.users).where(eq(schema.users.id, ENCODER_UNASSIGNED_ID));
    expect(row.active).toBe(true); // unchanged
  });

  it("Bookkeeper CANNOT deactivate a non-Encoder (Reviewer)", async () => {
    await withUserContext(BOOKKEEPER_ID, (tx) => tx.update(schema.users).set({ active: false }).where(eq(schema.users.id, REVIEWER_ID)));
    const [row] = await ownerDb.select().from(schema.users).where(eq(schema.users.id, REVIEWER_ID));
    expect(row.active).toBe(true); // unchanged
  });

  it("Bookkeeper CANNOT sneak a role change in alongside deactivating an eligible Encoder", async () => {
    await expect(
      withUserContext(BOOKKEEPER_ID, (tx) => tx.update(schema.users).set({ active: false, role: "viewer" }).where(eq(schema.users.id, ENCODER_ON_A_ID)))
    ).rejects.toThrow();
    const [row] = await ownerDb.select().from(schema.users).where(eq(schema.users.id, ENCODER_ON_A_ID));
    expect(row.active).toBe(true);
    expect(row.role).toBe("encoder");
  });
});

describe("users UPDATE (active): Owner self-protection and last-active-Owner rule", () => {
  it("Owner CANNOT deactivate themselves", async () => {
    await expect(
      withUserContext(SOLE_OWNER_ID, (tx) => tx.update(schema.users).set({ active: false }).where(eq(schema.users.id, SOLE_OWNER_ID)))
    ).rejects.toThrow();
    const [row] = await ownerDb.select().from(schema.users).where(eq(schema.users.id, SOLE_OWNER_ID));
    expect(row.active).toBe(true);
  });

  it("A lone active Owner CANNOT change their own role away from firm_admin (would leave zero active Owners)", async () => {
    await expect(
      withUserContext(SOLE_OWNER_ID, (tx) => tx.update(schema.users).set({ role: "bookkeeper" }).where(eq(schema.users.id, SOLE_OWNER_ID)))
    ).rejects.toThrow();
    const [row] = await ownerDb.select().from(schema.users).where(eq(schema.users.id, SOLE_OWNER_ID));
    expect(row.role).toBe("firm_admin");
  });

  it("Owner CAN deactivate a different Owner, as long as at least one active Owner remains", async () => {
    await withUserContext(OWNER_A_ID, (tx) => tx.update(schema.users).set({ active: false }).where(eq(schema.users.id, OWNER_B_ID)));
    const [row] = await ownerDb.select().from(schema.users).where(eq(schema.users.id, OWNER_B_ID));
    expect(row.active).toBe(false);
    await resetActive(OWNER_B_ID, true); // restore for idempotent re-runs
  });
});

describe("user_client_assignments: now audited", () => {
  it("an assignment INSERT produces an audit_log row", async () => {
    await ownerDb.delete(schema.userClientAssignments).where(and(eq(schema.userClientAssignments.userId, ENCODER_UNASSIGNED_ID), eq(schema.userClientAssignments.clientId, CLIENT_A_ID)));
    await withUserContext(SOLE_OWNER_ID, (tx) => tx.insert(schema.userClientAssignments).values({ userId: ENCODER_UNASSIGNED_ID, clientId: CLIENT_A_ID }));
    const [row] = await ownerDb.select().from(schema.userClientAssignments).where(and(eq(schema.userClientAssignments.userId, ENCODER_UNASSIGNED_ID), eq(schema.userClientAssignments.clientId, CLIENT_A_ID)));
    const auditRows = await ownerDb.select().from(schema.auditLog).where(and(eq(schema.auditLog.tableName, "user_client_assignments"), eq(schema.auditLog.recordId, row.id)));
    expect(auditRows.some((r) => r.action === "INSERT")).toBe(true);
  });

  it("an assignment DELETE produces an audit_log row", async () => {
    const [row] = await ownerDb.select().from(schema.userClientAssignments).where(and(eq(schema.userClientAssignments.userId, ENCODER_UNASSIGNED_ID), eq(schema.userClientAssignments.clientId, CLIENT_A_ID)));
    await withUserContext(SOLE_OWNER_ID, (tx) => tx.delete(schema.userClientAssignments).where(and(eq(schema.userClientAssignments.userId, ENCODER_UNASSIGNED_ID), eq(schema.userClientAssignments.clientId, CLIENT_A_ID))));
    const auditRows = await ownerDb.select().from(schema.auditLog).where(and(eq(schema.auditLog.tableName, "user_client_assignments"), eq(schema.auditLog.recordId, row.id)));
    expect(auditRows.some((r) => r.action === "DELETE")).toBe(true);
  });
});

describe("editTeamMemberAssignments()", () => {
  const bookkeeper: CurrentUser = { id: BOOKKEEPER_ID, firmId: FIRM_ID, clientId: null, email: "lifecycle-bookkeeper@test.local", name: "Bookkeeper", role: "bookkeeper" };
  const owner: CurrentUser = { id: SOLE_OWNER_ID, firmId: FIRM_ID, clientId: null, email: "lifecycle-sole-owner@test.local", name: "Owner", role: "firm_admin" };

  it("Bookkeeper cannot edit a non-Encoder's assignments", async () => {
    const result = await editTeamMemberAssignments(bookkeeper, { targetUserId: REVIEWER_ID, clientIds: [CLIENT_A_ID] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/only edit an encoder/i);
  });

  it("Owner can add and remove assignments in one call (diffed, not clear-and-replace)", async () => {
    await ownerDb.insert(schema.userClientAssignments).values({ userId: ENCODER_UNASSIGNED_ID, clientId: CLIENT_A_ID }).onConflictDoNothing();
    const result = await editTeamMemberAssignments(owner, { targetUserId: ENCODER_UNASSIGNED_ID, clientIds: [CLIENT_B_ID] });
    expect(result.ok).toBe(true);
    const rows = await ownerDb.select().from(schema.userClientAssignments).where(eq(schema.userClientAssignments.userId, ENCODER_UNASSIGNED_ID));
    expect(rows.map((r) => r.clientId)).toEqual([CLIENT_B_ID]);
    await ownerDb.delete(schema.userClientAssignments).where(eq(schema.userClientAssignments.userId, ENCODER_UNASSIGNED_ID));
  });
});

describe("setTeamMemberActive()", () => {
  const owner: CurrentUser = { id: SOLE_OWNER_ID, firmId: FIRM_ID, clientId: null, email: "lifecycle-sole-owner@test.local", name: "Owner", role: "firm_admin" };

  it("refuses self-deactivation with a friendly message, before ever touching the DB", async () => {
    const result = await setTeamMemberActive(owner, { targetUserId: SOLE_OWNER_ID, active: false });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/cannot deactivate your own account/i);
  });

  it("warns about unposted drafts when deactivating someone who has them", async () => {
    const [entry] = await ownerDb
      .insert(schema.journalEntries)
      .values({ clientId: CLIENT_A_ID, entryDate: "2026-01-15", book: "GJ", description: "Lifecycle fixture draft", status: "draft", createdBy: ENCODER_ON_A_ID })
      .returning();
    await ownerDb.insert(schema.journalLines).values([
      { entryId: entry.id, lineNo: 1, accountId: assetAccountId, debitCentavos: 5000n, creditCentavos: 0n },
      { entryId: entry.id, lineNo: 2, accountId: liabilityAccountId, debitCentavos: 0n, creditCentavos: 5000n },
    ]);

    const result = await setTeamMemberActive(owner, { targetUserId: ENCODER_ON_A_ID, active: false });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.warning ?? "").toMatch(/1 unposted draft/i);

    await ownerDb.delete(schema.journalLines).where(eq(schema.journalLines.entryId, entry.id));
    await ownerDb.delete(schema.journalEntries).where(eq(schema.journalEntries.id, entry.id));
    await resetActive(ENCODER_ON_A_ID, true);
  });
});
