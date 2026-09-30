/**
 * db/sql/018_plan_limits.sql — the three plan-limit triggers, tested
 * directly against the schema-owning connection (like
 * acceptance.test.ts's immutability tests): these are table triggers,
 * not RLS policies, so they fire regardless of which role is connected —
 * no need to route through withUserContext()/keepbooks_app to prove they
 * work.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../schema";

const ownerConn = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 2 });
const ownerDb = drizzle(ownerConn, { schema });

const FREE_FIRM_ID = "00000000-0000-4000-9900-000000000001"; // maxClients 3, maxUsers 1, no assignment
const BASIC_FIRM_ID = "00000000-0000-4000-9900-000000000002"; // maxClients 10, maxUsers 2, no assignment
const PREMIUM_FIRM_ID = "00000000-0000-4000-9900-000000000003"; // maxClients 30, maxUsers 10, assignment allowed
const ENTERPRISE_FIRM_ID = "00000000-0000-4000-9900-000000000004"; // custom: maxClients 1, maxUsers 1

const FREE_OWNER_ID = "00000000-0000-4000-9900-000000000010";
const BASIC_OWNER_ID = "00000000-0000-4000-9900-000000000011";
const PREMIUM_OWNER_ID = "00000000-0000-4000-9900-000000000012";

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

async function upsertFirm(id: string, name: string, values: { plan: "free" | "basic" | "premium" | "enterprise"; maxClients: number; maxUsers: number; perClientAssignmentAllowed: boolean }) {
  await ownerDb
    .insert(schema.firms)
    .values({ id, name, ...values })
    .onConflictDoUpdate({ target: schema.firms.id, set: values });
}

beforeAll(async () => {
  await upsertFirm(FREE_FIRM_ID, "Plan Limits Test Firm (Free)", { plan: "free", maxClients: 3, maxUsers: 1, perClientAssignmentAllowed: false });
  await upsertFirm(BASIC_FIRM_ID, "Plan Limits Test Firm (Basic)", { plan: "basic", maxClients: 10, maxUsers: 2, perClientAssignmentAllowed: false });
  await upsertFirm(PREMIUM_FIRM_ID, "Plan Limits Test Firm (Premium)", { plan: "premium", maxClients: 30, maxUsers: 10, perClientAssignmentAllowed: true });
  await upsertFirm(ENTERPRISE_FIRM_ID, "Plan Limits Test Firm (Enterprise)", { plan: "enterprise", maxClients: 1, maxUsers: 1, perClientAssignmentAllowed: true });

  // Full reset so every test below starts from a known-empty baseline —
  // limit testing is inherently stateful (need N existing rows before
  // proving the N+1th is rejected), so a stray row from a previous run
  // would otherwise change which insert in a given test is the one that
  // actually crosses the limit.
  for (const firmId of [FREE_FIRM_ID, BASIC_FIRM_ID, PREMIUM_FIRM_ID, ENTERPRISE_FIRM_ID]) {
    await ownerDb.delete(schema.clients).where(eq(schema.clients.firmId, firmId));
    await ownerDb.delete(schema.users).where(eq(schema.users.firmId, firmId));
  }

  await ownerDb
    .insert(schema.users)
    .values([
      { id: FREE_OWNER_ID, firmId: FREE_FIRM_ID, email: "plan-free-owner@test.local", name: "Free Owner", role: "firm_admin", active: true },
      { id: BASIC_OWNER_ID, firmId: BASIC_FIRM_ID, email: "plan-basic-owner@test.local", name: "Basic Owner", role: "firm_admin", active: true },
      { id: PREMIUM_OWNER_ID, firmId: PREMIUM_FIRM_ID, email: "plan-premium-owner@test.local", name: "Premium Owner", role: "firm_admin", active: true },
    ])
    .onConflictDoUpdate({ target: schema.users.id, set: { role: "firm_admin", active: true } });
});

afterAll(async () => {
  await ownerConn.end();
});

describe("enforce_client_plan_limit(): INSERT", () => {
  it("Free plan (max 3): the 3rd active client succeeds, the 4th is rejected", async () => {
    await ownerDb.delete(schema.clients).where(eq(schema.clients.firmId, FREE_FIRM_ID));
    for (const n of [1, 2, 3]) {
      await ownerDb.insert(schema.clients).values(newClient(`00000000-0000-4000-9900-00000000010${n}`, FREE_FIRM_ID, `Free Client ${n}`));
    }
    await expect(
      ownerDb.insert(schema.clients).values(newClient("00000000-0000-4000-9900-000000000104", FREE_FIRM_ID, "Free Client 4"))
    ).rejects.toThrow(/at most 3 active client/);
  });

  it("archived/inactive clients don't count toward the limit — a Free-plan firm can add a new client after archiving one", async () => {
    await ownerDb
      .update(schema.clients)
      .set({ status: "archived" })
      .where(eq(schema.clients.id, "00000000-0000-4000-9900-000000000101"));
    // Only 2 counted now (102, 103) — a new one fits.
    await ownerDb.insert(schema.clients).values(newClient("00000000-0000-4000-9900-000000000105", FREE_FIRM_ID, "Free Client 5"));
    const rows = await ownerDb.select().from(schema.clients).where(eq(schema.clients.firmId, FREE_FIRM_ID));
    expect(rows.filter((c) => c.status === "active")).toHaveLength(3);
  });
});

describe("enforce_client_plan_limit(): UPDATE (moving a client back into the counted set)", () => {
  it("reactivating an inactive client is rejected once the firm is already at its limit", async () => {
    // FREE_FIRM_ID is now at 3 active (101 archived, 102/103/105 active) —
    // insert a 4th client directly as 'inactive' (unblocked, since
    // 'inactive' is outside the counted set), then try to reactivate it.
    await ownerDb.insert(schema.clients).values(newClient("00000000-0000-4000-9900-000000000106", FREE_FIRM_ID, "Free Client 6", "inactive"));
    await expect(
      ownerDb.update(schema.clients).set({ status: "active" }).where(eq(schema.clients.id, "00000000-0000-4000-9900-000000000106"))
    ).rejects.toThrow(/at most 3 active client/);
  });

  it("an ordinary edit to an already-active client is never blocked by this trigger", async () => {
    await ownerDb
      .update(schema.clients)
      .set({ tradeName: "Renamed Co." })
      .where(eq(schema.clients.id, "00000000-0000-4000-9900-000000000102"));
    const [row] = await ownerDb.select().from(schema.clients).where(eq(schema.clients.id, "00000000-0000-4000-9900-000000000102"));
    expect(row.tradeName).toBe("Renamed Co.");
  });
});

describe("enforce_user_plan_limit(): INSERT", () => {
  it("Free plan (max 1, Owner only): a 2nd active staff member is rejected", async () => {
    await expect(
      ownerDb.insert(schema.users).values({
        id: "00000000-0000-4000-9900-000000000110",
        firmId: FREE_FIRM_ID,
        email: "plan-free-second@test.local",
        name: "Free Second Staffer",
        role: "bookkeeper",
        active: true,
      })
    ).rejects.toThrow(/at most 1 team member/);
  });

  it("Basic plan (max 2): Owner + 1 more succeeds, a 3rd is rejected", async () => {
    await ownerDb.insert(schema.users).values({
      id: "00000000-0000-4000-9900-000000000111",
      firmId: BASIC_FIRM_ID,
      email: "plan-basic-second@test.local",
      name: "Basic Second Staffer",
      role: "bookkeeper",
      active: true,
      accessScope: "all",
    });
    await expect(
      ownerDb.insert(schema.users).values({
        id: "00000000-0000-4000-9900-000000000112",
        firmId: BASIC_FIRM_ID,
        email: "plan-basic-third@test.local",
        name: "Basic Third Staffer",
        role: "reviewer",
        active: true,
        accessScope: "assigned",
      })
    ).rejects.toThrow(/at most 2 team member/);
  });
});

describe("enforce_user_plan_limit(): UPDATE (reactivation re-checks the limit)", () => {
  it("reactivating a deactivated member is rejected once the firm is already at its limit", async () => {
    // Deactivated insert bypasses the check (NEW.active = false); the
    // reactivation attempt is what should be checked and rejected.
    await ownerDb.insert(schema.users).values({
      id: "00000000-0000-4000-9900-000000000113",
      firmId: FREE_FIRM_ID,
      email: "plan-free-deactivated@test.local",
      name: "Free Deactivated Staffer",
      role: "bookkeeper",
      active: false,
    });
    await expect(
      ownerDb.update(schema.users).set({ active: true }).where(eq(schema.users.id, "00000000-0000-4000-9900-000000000113"))
    ).rejects.toThrow(/at most 1 team member/);
  });

  it("platform_admin (firm_id NULL) and client_user never count against the seat limit", async () => {
    // FREE_FIRM_ID is at its 1-seat limit — a client_user row for it
    // must still succeed, since it's not a staff seat.
    await ownerDb.insert(schema.users).values({
      id: "00000000-0000-4000-9900-000000000114",
      firmId: FREE_FIRM_ID,
      email: "plan-free-client-portal@test.local",
      name: "Free Client Portal Login",
      role: "client_user",
      active: true,
    });
    const [row] = await ownerDb.select().from(schema.users).where(eq(schema.users.id, "00000000-0000-4000-9900-000000000114"));
    expect(row.role).toBe("client_user");
  });
});

describe("enforce_per_client_assignment_allowed(): Bookkeeper access_scope, gated by plan", () => {
  it("Basic plan (assignment not allowed): a Bookkeeper set to access_scope 'assigned' is rejected", async () => {
    await expect(
      ownerDb.update(schema.users).set({ accessScope: "assigned" }).where(eq(schema.users.id, "00000000-0000-4000-9900-000000000111"))
    ).rejects.toThrow(/does not allow per-client assignment/);
  });

  it("Basic plan: the same Bookkeeper at access_scope 'all' is unaffected", async () => {
    await ownerDb.update(schema.users).set({ name: "Basic Second Staffer (renamed)" }).where(eq(schema.users.id, "00000000-0000-4000-9900-000000000111"));
    const [row] = await ownerDb.select().from(schema.users).where(eq(schema.users.id, "00000000-0000-4000-9900-000000000111"));
    expect(row.accessScope).toBe("all");
  });

  it("Premium plan (assignment allowed): a Bookkeeper CAN be set to access_scope 'assigned'", async () => {
    const [bk] = await ownerDb
      .insert(schema.users)
      .values({
        id: "00000000-0000-4000-9900-000000000120",
        firmId: PREMIUM_FIRM_ID,
        email: "plan-premium-bookkeeper@test.local",
        name: "Premium Bookkeeper",
        role: "bookkeeper",
        active: true,
        accessScope: "all",
      })
      .returning();
    await ownerDb.update(schema.users).set({ accessScope: "assigned" }).where(eq(schema.users.id, bk.id));
    const [row] = await ownerDb.select().from(schema.users).where(eq(schema.users.id, bk.id));
    expect(row.accessScope).toBe("assigned");
  });

  it("bug fix (019): an already-'assigned' Bookkeeper's OTHER fields stay editable after their firm's plan stops allowing assignment", async () => {
    // Reproduces a real bug found manually testing downgrade-firm-to-
    // free.ts against a live database: the original trigger checked
    // NEW.access_scope on every UPDATE, not just ones actually setting
    // it to 'assigned' — so deactivating an already-'assigned'
    // Bookkeeper failed once their firm's plan no longer allowed
    // assignment, even though access_scope itself wasn't part of that
    // update. Uses the Bookkeeper from the previous test, already
    // access_scope 'assigned' on PREMIUM_FIRM_ID.
    const bookkeeperId = "00000000-0000-4000-9900-000000000120";
    await ownerDb.update(schema.firms).set({ perClientAssignmentAllowed: false }).where(eq(schema.firms.id, PREMIUM_FIRM_ID));
    try {
      await ownerDb.update(schema.users).set({ active: false }).where(eq(schema.users.id, bookkeeperId));
      const [row] = await ownerDb.select().from(schema.users).where(eq(schema.users.id, bookkeeperId));
      expect(row.active).toBe(false);
      expect(row.accessScope).toBe("assigned"); // untouched, not silently reset to 'all'
    } finally {
      await ownerDb.update(schema.users).set({ active: true }).where(eq(schema.users.id, bookkeeperId));
      await ownerDb.update(schema.firms).set({ perClientAssignmentAllowed: true }).where(eq(schema.firms.id, PREMIUM_FIRM_ID));
    }
  });

  it("but actually setting access_scope to 'assigned' is still rejected once the firm doesn't allow it", async () => {
    const bookkeeperId = "00000000-0000-4000-9900-000000000120";
    await ownerDb.update(schema.users).set({ accessScope: "all" }).where(eq(schema.users.id, bookkeeperId));
    await ownerDb.update(schema.firms).set({ perClientAssignmentAllowed: false }).where(eq(schema.firms.id, PREMIUM_FIRM_ID));
    try {
      await expect(
        ownerDb.update(schema.users).set({ accessScope: "assigned" }).where(eq(schema.users.id, bookkeeperId))
      ).rejects.toThrow(/does not allow per-client assignment/);
    } finally {
      await ownerDb.update(schema.firms).set({ perClientAssignmentAllowed: true }).where(eq(schema.firms.id, PREMIUM_FIRM_ID));
    }
  });

  it("Encoder/Reviewer/Viewer are unaffected by this check regardless of plan (already permanently 'assigned' by 013's CHECK constraint)", async () => {
    // Basic plan, perClientAssignmentAllowed = false — an Encoder here
    // must still succeed, since 013's CHECK already forces 'assigned'
    // for this role independent of any plan.
    await ownerDb.insert(schema.users).values({
      id: "00000000-0000-4000-9900-000000000121",
      firmId: BASIC_FIRM_ID,
      email: "plan-basic-encoder@test.local",
      name: "Basic Encoder",
      role: "encoder",
      active: false, // inserted inactive so it doesn't also trip the Basic 2-seat limit above
      accessScope: "assigned",
    });
    const [row] = await ownerDb.select().from(schema.users).where(eq(schema.users.id, "00000000-0000-4000-9900-000000000121"));
    expect(row.accessScope).toBe("assigned");
  });
});

describe("enterprise plan: custom limits, not a fixed tier", () => {
  it("respects whatever maxClients was set by hand, not any of the fixed tiers' numbers", async () => {
    await ownerDb.insert(schema.clients).values(newClient("00000000-0000-4000-9900-000000000130", ENTERPRISE_FIRM_ID, "Enterprise Client 1"));
    await expect(
      ownerDb.insert(schema.clients).values(newClient("00000000-0000-4000-9900-000000000131", ENTERPRISE_FIRM_ID, "Enterprise Client 2"))
    ).rejects.toThrow(/at most 1 active client/);
  });
});
