/**
 * The day-8 flag, the manual downgrade action, the Owner-facing swap, and
 * platform admin's manual plan/trial controls — everything added on top
 * of db/__tests__/plan-limits-rls.test.ts's foundation triggers.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../schema";
import { flagTrialExpiredIfNeeded } from "../../lib/billing/flag-expired-trials";
import { downgradeFirmToFree } from "../../lib/billing/downgrade-firm-to-free";
import { swapActiveClient } from "../../lib/billing/swap-active-client";
import { setFirmPlan } from "../../lib/billing/set-firm-plan";
import { extendFirmTrial } from "../../lib/billing/extend-firm-trial";
import type { CurrentUser } from "../../lib/auth/current-user";

const ownerConn = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 2 });
const ownerDb = drizzle(ownerConn, { schema });

const PLATFORM_ADMIN_ID = "00000000-0000-4000-aa00-000000000001";

function newClient(id: string, firmId: string, name: string, status: "onboarding" | "active" | "inactive" | "archived" = "active") {
  return {
    id,
    firmId,
    registeredName: name,
    tin: "000-000-000-00000",
    rdoCode: "000",
    taxpayerType: "corporation" as const,
    vatStatus: "vat" as const,
    incomeTaxRegime: "rcit" as const,
    address: "Test address",
    status,
  };
}

async function upsertFirm(id: string, name: string, values: Partial<typeof schema.firms.$inferInsert>) {
  await ownerDb
    .insert(schema.firms)
    .values({ id, name, ...values })
    .onConflictDoUpdate({ target: schema.firms.id, set: values });
}

beforeAll(async () => {
  await ownerDb
    .insert(schema.users)
    .values({ id: PLATFORM_ADMIN_ID, firmId: null, email: "plan-platform-admin@test.local", name: "Platform Admin", role: "platform_admin", active: true })
    .onConflictDoUpdate({ target: schema.users.id, set: { role: "platform_admin", active: true } });
});

afterAll(async () => {
  await ownerConn.end();
});

describe("flagTrialExpiredIfNeeded()", () => {
  const FIRM_ID = "00000000-0000-4000-aa00-000000000010";

  it("flags a trial-plan firm whose trialEndsAt has passed", async () => {
    await upsertFirm(FIRM_ID, "Flag Test Firm (Expired)", { plan: "trial", trialEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000), trialExpiredFlaggedAt: null });
    await flagTrialExpiredIfNeeded(FIRM_ID);
    const [row] = await ownerDb.select().from(schema.firms).where(eq(schema.firms.id, FIRM_ID));
    expect(row.trialExpiredFlaggedAt).not.toBeNull();
  });

  it("is idempotent — a second call doesn't move the already-set flag", async () => {
    const [before] = await ownerDb.select().from(schema.firms).where(eq(schema.firms.id, FIRM_ID));
    await flagTrialExpiredIfNeeded(FIRM_ID);
    const [after] = await ownerDb.select().from(schema.firms).where(eq(schema.firms.id, FIRM_ID));
    expect(after.trialExpiredFlaggedAt?.getTime()).toBe(before.trialExpiredFlaggedAt?.getTime());
  });

  it("does NOT flag a trial firm whose trialEndsAt hasn't passed yet", async () => {
    const NOT_EXPIRED_ID = "00000000-0000-4000-aa00-000000000011";
    await upsertFirm(NOT_EXPIRED_ID, "Flag Test Firm (Not Expired)", { plan: "trial", trialEndsAt: new Date(Date.now() + 24 * 60 * 60 * 1000), trialExpiredFlaggedAt: null });
    await flagTrialExpiredIfNeeded(NOT_EXPIRED_ID);
    const [row] = await ownerDb.select().from(schema.firms).where(eq(schema.firms.id, NOT_EXPIRED_ID));
    expect(row.trialExpiredFlaggedAt).toBeNull();
  });

  it("does NOT flag a firm that isn't on the trial plan, even with a past trialEndsAt", async () => {
    const FREE_WITH_OLD_DATE_ID = "00000000-0000-4000-aa00-000000000012";
    await upsertFirm(FREE_WITH_OLD_DATE_ID, "Flag Test Firm (Free, Stale Date)", { plan: "free", trialEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000), trialExpiredFlaggedAt: null });
    await flagTrialExpiredIfNeeded(FREE_WITH_OLD_DATE_ID);
    const [row] = await ownerDb.select().from(schema.firms).where(eq(schema.firms.id, FREE_WITH_OLD_DATE_ID));
    expect(row.trialExpiredFlaggedAt).toBeNull();
  });
});

describe("enforce_client_writable(): journal_entries, representative sample of the 5 blocked tables", () => {
  const FIRM_ID = "00000000-0000-4000-aa00-000000000020";
  const OWNER_ID = "00000000-0000-4000-aa00-000000000021";
  const ACTIVE_CLIENT_ID = "00000000-0000-4000-aa00-000000000022";
  const INACTIVE_CLIENT_ID = "00000000-0000-4000-aa00-000000000023";

  beforeAll(async () => {
    await upsertFirm(FIRM_ID, "Writable Test Firm", { plan: "enterprise", maxClients: 1000, maxUsers: 1000 });
    await ownerDb
      .insert(schema.users)
      .values({ id: OWNER_ID, firmId: FIRM_ID, email: "plan-writable-owner@test.local", name: "Owner", role: "firm_admin", active: true })
      .onConflictDoUpdate({ target: schema.users.id, set: { role: "firm_admin", active: true } });
    // journal_entries.client_id is ON DELETE RESTRICT — clear out any
    // entry this test inserted on a previous run before deleting clients.
    await ownerDb.delete(schema.journalEntries).where(eq(schema.journalEntries.clientId, ACTIVE_CLIENT_ID));
    await ownerDb.delete(schema.clients).where(eq(schema.clients.firmId, FIRM_ID));
    await ownerDb.insert(schema.clients).values(newClient(ACTIVE_CLIENT_ID, FIRM_ID, "Writable Active Client", "active"));
    await ownerDb.insert(schema.clients).values(newClient(INACTIVE_CLIENT_ID, FIRM_ID, "Writable Inactive Client", "inactive"));
  });

  it("a new journal entry for an active client succeeds", async () => {
    await ownerDb.insert(schema.journalEntries).values({
      clientId: ACTIVE_CLIENT_ID,
      entryDate: "2026-01-15",
      book: "GJ",
      description: "Writable fixture entry",
      status: "draft",
      createdBy: OWNER_ID,
    });
  });

  it("a new journal entry for a read-only (inactive) client is rejected", async () => {
    await expect(
      ownerDb.insert(schema.journalEntries).values({
        clientId: INACTIVE_CLIENT_ID,
        entryDate: "2026-01-15",
        book: "GJ",
        description: "Should be rejected",
        status: "draft",
        createdBy: OWNER_ID,
      })
    ).rejects.toThrow(/read-only/);
  });

  it("the same trigger function is attached to all five transaction tables", async () => {
    const attached = (await ownerDb.execute(sql`
      select c.relname as table_name
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_proc p on p.oid = t.tgfoid
      where p.proname = 'enforce_client_writable'
      order by c.relname
    `)) as unknown as { table_name: string }[];
    expect(attached.map((r) => r.table_name).sort()).toEqual(
      ["cash_disbursements", "cash_receipts", "journal_entries", "purchases", "sales_invoices"].sort()
    );
  });
});

describe("downgradeFirmToFree()", () => {
  const FIRM_ID = "00000000-0000-4000-aa00-000000000030";
  const OWNER_ID = "00000000-0000-4000-aa00-000000000031";
  const BOOKKEEPER_ID = "00000000-0000-4000-aa00-000000000032";
  const REVIEWER_ID = "00000000-0000-4000-aa00-000000000033";
  const CLIENT_IDS = [
    "00000000-0000-4000-aa00-000000000040",
    "00000000-0000-4000-aa00-000000000041",
    "00000000-0000-4000-aa00-000000000042",
    "00000000-0000-4000-aa00-000000000043",
    "00000000-0000-4000-aa00-000000000044",
  ];

  beforeAll(async () => {
    await upsertFirm(FIRM_ID, "Downgrade Test Firm", { plan: "trial", maxClients: 10, maxUsers: 5, perClientAssignmentAllowed: true, trialEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000), trialExpiredFlaggedAt: new Date() });

    // Users before clients/views — userClientViews.userId FKs into users.
    await ownerDb.delete(schema.users).where(eq(schema.users.firmId, FIRM_ID));
    await ownerDb.insert(schema.users).values([
      { id: OWNER_ID, firmId: FIRM_ID, email: "plan-downgrade-owner@test.local", name: "Owner", role: "firm_admin", active: true },
      { id: BOOKKEEPER_ID, firmId: FIRM_ID, email: "plan-downgrade-bookkeeper@test.local", name: "Bookkeeper", role: "bookkeeper", active: true },
      { id: REVIEWER_ID, firmId: FIRM_ID, email: "plan-downgrade-reviewer@test.local", name: "Reviewer", role: "reviewer", active: true, accessScope: "assigned" },
    ]);

    // Deleting these clients cascades to their user_client_views rows
    // (onDelete: cascade) — no separate cleanup needed, and definitely
    // not a table-wide delete, which would wipe every other test file's
    // fixtures too.
    await ownerDb.delete(schema.clients).where(eq(schema.clients.firmId, FIRM_ID));
    for (const [i, id] of CLIENT_IDS.entries()) {
      await ownerDb.insert(schema.clients).values(newClient(id, FIRM_ID, `Downgrade Client ${i}`, "active"));
    }
    // View history: client 44 viewed most recently, 43 next, ... 40 never viewed.
    // Expect the top 3 by recency (42, 43, 44) to stay active.
    await ownerDb.insert(schema.userClientViews).values([
      { userId: OWNER_ID, clientId: CLIENT_IDS[4], lastViewedAt: new Date(Date.now() - 1000) },
      { userId: OWNER_ID, clientId: CLIENT_IDS[3], lastViewedAt: new Date(Date.now() - 2000) },
      { userId: OWNER_ID, clientId: CLIENT_IDS[2], lastViewedAt: new Date(Date.now() - 3000) },
      { userId: OWNER_ID, clientId: CLIENT_IDS[1], lastViewedAt: new Date(Date.now() - 4000) },
    ]);
  });

  it("keeps the 3 most-recently-viewed clients active and makes the rest read-only", async () => {
    const result = await downgradeFirmToFree(PLATFORM_ADMIN_ID, FIRM_ID);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.clientsKeptActive.map((c) => c.id).sort()).toEqual([CLIENT_IDS[2], CLIENT_IDS[3], CLIENT_IDS[4]].sort());
    expect(result.clientsMadeReadOnly).toBe(2);

    const rows = await ownerDb.select().from(schema.clients).where(eq(schema.clients.firmId, FIRM_ID));
    const active = rows.filter((c) => c.status === "active").map((c) => c.id);
    const inactive = rows.filter((c) => c.status === "inactive").map((c) => c.id);
    expect(active.sort()).toEqual([CLIENT_IDS[2], CLIENT_IDS[3], CLIENT_IDS[4]].sort());
    expect(inactive.sort()).toEqual([CLIENT_IDS[0], CLIENT_IDS[1]].sort());
  });

  it("deactivates every non-Owner staff member, keeps the Owner active", async () => {
    const result = await downgradeFirmToFree(PLATFORM_ADMIN_ID, FIRM_ID);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.staffDeactivated).toBe(0); // already deactivated by the previous test

    const rows = await ownerDb.select().from(schema.users).where(eq(schema.users.firmId, FIRM_ID));
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(OWNER_ID)?.active).toBe(true);
    expect(byId.get(BOOKKEEPER_ID)?.active).toBe(false);
    expect(byId.get(REVIEWER_ID)?.active).toBe(false);
  });

  it("moves the firm to the Free plan's limits and clears the trial fields", async () => {
    const [firm] = await ownerDb.select().from(schema.firms).where(eq(schema.firms.id, FIRM_ID));
    expect(firm.plan).toBe("free");
    expect(firm.maxClients).toBe(3);
    expect(firm.maxUsers).toBe(1);
    expect(firm.perClientAssignmentAllowed).toBe(false);
    expect(firm.trialEndsAt).toBeNull();
    expect(firm.trialExpiredFlaggedAt).toBeNull();
  });

  it("writes an attributable audit_log row", async () => {
    const rows = await ownerDb.select().from(schema.auditLog).where(eq(schema.auditLog.recordId, FIRM_ID));
    const entry = rows.find((r) => r.action === "PLAN_DOWNGRADE");
    expect(entry?.actorUserId).toBe(PLATFORM_ADMIN_ID);
  });
});

describe("swapActiveClient()", () => {
  const FIRM_ID = "00000000-0000-4000-aa00-000000000050";
  const OWNER_ID = "00000000-0000-4000-aa00-000000000051";
  const BOOKKEEPER_ID = "00000000-0000-4000-aa00-000000000052";
  const ACTIVE_A_ID = "00000000-0000-4000-aa00-000000000060";
  const INACTIVE_A_ID = "00000000-0000-4000-aa00-000000000061";

  const owner: CurrentUser = { id: OWNER_ID, firmId: FIRM_ID, clientId: null, email: "plan-swap-owner@test.local", name: "Owner", role: "firm_admin" };
  const bookkeeper: CurrentUser = { id: BOOKKEEPER_ID, firmId: FIRM_ID, clientId: null, email: "plan-swap-bookkeeper@test.local", name: "Bookkeeper", role: "bookkeeper" };

  beforeAll(async () => {
    await upsertFirm(FIRM_ID, "Swap Test Firm", { plan: "free", maxClients: 3, maxUsers: 1, perClientAssignmentAllowed: false });
    // Delete-then-insert, not onConflictDoUpdate: these two rows need
    // DIFFERENT final states (Owner active, Bookkeeper not — Free's
    // maxUsers is 1), which a single shared `set` clause can't express.
    await ownerDb.delete(schema.users).where(eq(schema.users.firmId, FIRM_ID));
    await ownerDb.insert(schema.users).values([
      { id: OWNER_ID, firmId: FIRM_ID, email: "plan-swap-owner@test.local", name: "Owner", role: "firm_admin", active: true },
      { id: BOOKKEEPER_ID, firmId: FIRM_ID, email: "plan-swap-bookkeeper@test.local", name: "Bookkeeper", role: "bookkeeper", active: false },
    ]);

    await ownerDb.delete(schema.clients).where(eq(schema.clients.firmId, FIRM_ID));
    await ownerDb.insert(schema.clients).values(newClient(ACTIVE_A_ID, FIRM_ID, "Swap Active A", "active"));
    await ownerDb.insert(schema.clients).values(newClient(INACTIVE_A_ID, FIRM_ID, "Swap Inactive A", "inactive"));
  });

  it("a non-Owner cannot swap", async () => {
    const result = await swapActiveClient(bookkeeper, { activateClientId: INACTIVE_A_ID });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/only an owner/i);
  });

  it("Owner activates the inactive client, demoting the only current active one", async () => {
    const result = await swapActiveClient(owner, { activateClientId: INACTIVE_A_ID });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.deactivatedClientName).toBe("Swap Active A");

    const rows = await ownerDb.select().from(schema.clients).where(eq(schema.clients.firmId, FIRM_ID));
    const byId = new Map(rows.map((r) => [r.id, r.status]));
    expect(byId.get(INACTIVE_A_ID)).toBe("active");
    expect(byId.get(ACTIVE_A_ID)).toBe("inactive");
  });

  it("activating an already-active client is refused", async () => {
    const result = await swapActiveClient(owner, { activateClientId: INACTIVE_A_ID });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/already active/i);
  });
});

describe("setFirmPlan()", () => {
  const FIRM_ID = "00000000-0000-4000-aa00-000000000070";

  beforeAll(async () => {
    await upsertFirm(FIRM_ID, "Set Plan Test Firm", { plan: "free", maxClients: 3, maxUsers: 1, perClientAssignmentAllowed: false });
  });

  it("moves a firm onto a fixed tier (Premium) using PLAN_DEFAULTS", async () => {
    const result = await setFirmPlan(PLATFORM_ADMIN_ID, { firmId: FIRM_ID, plan: "premium" });
    expect(result.ok).toBe(true);
    const [firm] = await ownerDb.select().from(schema.firms).where(eq(schema.firms.id, FIRM_ID));
    expect(firm.maxClients).toBe(30);
    expect(firm.maxUsers).toBe(10);
    expect(firm.perClientAssignmentAllowed).toBe(true);
  });

  it("moving to trial starts a fresh 7-day clock, not whatever trialEndsAt happened to already be on the row", async () => {
    const before = Date.now();
    const result = await setFirmPlan(PLATFORM_ADMIN_ID, { firmId: FIRM_ID, plan: "trial" });
    expect(result.ok).toBe(true);
    const [firm] = await ownerDb.select().from(schema.firms).where(eq(schema.firms.id, FIRM_ID));
    expect(firm.trialEndsAt).not.toBeNull();
    const daysAhead = (firm.trialEndsAt!.getTime() - before) / (24 * 60 * 60 * 1000);
    expect(daysAhead).toBeGreaterThan(6.9);
    expect(daysAhead).toBeLessThan(7.1);
  });

  it("enterprise requires explicit custom limits", async () => {
    const result = await setFirmPlan(PLATFORM_ADMIN_ID, { firmId: FIRM_ID, plan: "enterprise" });
    expect(result.ok).toBe(false);
  });

  it("enterprise with explicit limits sets exactly those, not any fixed tier's numbers", async () => {
    const result = await setFirmPlan(PLATFORM_ADMIN_ID, { firmId: FIRM_ID, plan: "enterprise", maxClients: 250, maxUsers: 60, perClientAssignmentAllowed: true });
    expect(result.ok).toBe(true);
    const [firm] = await ownerDb.select().from(schema.firms).where(eq(schema.firms.id, FIRM_ID));
    expect(firm.maxClients).toBe(250);
    expect(firm.maxUsers).toBe(60);
  });
});

describe("extendFirmTrial()", () => {
  const FIRM_ID = "00000000-0000-4000-aa00-000000000080";
  const NON_TRIAL_FIRM_ID = "00000000-0000-4000-aa00-000000000081";

  beforeAll(async () => {
    await upsertFirm(FIRM_ID, "Extend Trial Test Firm", { plan: "trial", trialEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000), trialExpiredFlaggedAt: new Date() });
    await upsertFirm(NON_TRIAL_FIRM_ID, "Extend Trial Test Firm (Non-Trial)", { plan: "free" });
  });

  it("extends from today, not from an already-past trialEndsAt", async () => {
    const before = Date.now();
    const result = await extendFirmTrial(PLATFORM_ADMIN_ID, { firmId: FIRM_ID, days: 7 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const daysAhead = (result.newTrialEndsAt.getTime() - before) / (24 * 60 * 60 * 1000);
    expect(daysAhead).toBeGreaterThan(6.9);
    expect(daysAhead).toBeLessThan(7.1);

    const [firm] = await ownerDb.select().from(schema.firms).where(eq(schema.firms.id, FIRM_ID));
    expect(firm.trialExpiredFlaggedAt).toBeNull();
  });

  it("a second extension is additive from the new date, not from today again", async () => {
    const [before] = await ownerDb.select().from(schema.firms).where(eq(schema.firms.id, FIRM_ID));
    const result = await extendFirmTrial(PLATFORM_ADMIN_ID, { firmId: FIRM_ID, days: 3 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const deltaDays = (result.newTrialEndsAt.getTime() - before.trialEndsAt!.getTime()) / (24 * 60 * 60 * 1000);
    expect(deltaDays).toBeCloseTo(3, 1);
  });

  it("refuses a firm that isn't on the trial plan", async () => {
    const result = await extendFirmTrial(PLATFORM_ADMIN_ID, { firmId: NON_TRIAL_FIRM_ID, days: 7 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/isn't on the trial plan/i);
  });
});
