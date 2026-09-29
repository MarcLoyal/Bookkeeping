/**
 * recordClientView() / getRecentClientsForUser() (lib/data/clients.ts) and
 * the user_client_views RLS behind them (db/sql/015_user_client_views_rls.sql)
 * — the "recently viewed or worked on" signal behind every role's sidebar
 * Recent Clients section, deliberately NOT limited to entries a user
 * authored (Reviewer/Viewer never author one at all).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../schema";
import { withUserContext } from "../client";
import { getRecentClientsForUser, recordClientView } from "@/lib/data/clients";

const ownerConn = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 2 });
const ownerDb = drizzle(ownerConn, { schema });

const FIRM_ID = "00000000-0000-4000-9700-000000000001";
const CLIENT_ASSIGNED_ID = "00000000-0000-4000-9700-000000000002";
const CLIENT_UNASSIGNED_ID = "00000000-0000-4000-9700-000000000003";
const REVIEWER_ID = "00000000-0000-4000-9700-000000000010";
const OTHER_REVIEWER_ID = "00000000-0000-4000-9700-000000000011";
const OWNER_ID = "00000000-0000-4000-9700-000000000012";

beforeAll(async () => {
  await ownerDb.insert(schema.firms).values({ id: FIRM_ID, name: "User Client Views Test Firm" }).onConflictDoNothing();
  for (const [id, name] of [
    [CLIENT_ASSIGNED_ID, "UCV Test Client (Assigned)"],
    [CLIENT_UNASSIGNED_ID, "UCV Test Client (Unassigned)"],
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

  await ownerDb
    .insert(schema.users)
    .values([
      { id: OWNER_ID, firmId: FIRM_ID, email: `${OWNER_ID}@test.local`, name: "Owner", role: "firm_admin" },
      { id: REVIEWER_ID, firmId: FIRM_ID, email: `${REVIEWER_ID}@test.local`, name: "Reviewer", role: "reviewer", accessScope: "assigned" },
      { id: OTHER_REVIEWER_ID, firmId: FIRM_ID, email: `${OTHER_REVIEWER_ID}@test.local`, name: "Other Reviewer", role: "reviewer", accessScope: "assigned" },
    ])
    .onConflictDoNothing();
  await ownerDb
    .insert(schema.userClientAssignments)
    .values([{ userId: REVIEWER_ID, clientId: CLIENT_ASSIGNED_ID }])
    .onConflictDoNothing();
});

afterAll(async () => {
  await ownerConn.end();
});

describe("recordClientView()", () => {
  it("inserts a new row on first view, updates the same row (no duplicate) on a second", async () => {
    await ownerDb.delete(schema.userClientViews).where(eq(schema.userClientViews.userId, REVIEWER_ID));

    await recordClientView(REVIEWER_ID, CLIENT_ASSIGNED_ID);
    const [firstRow] = await ownerDb.select().from(schema.userClientViews).where(eq(schema.userClientViews.userId, REVIEWER_ID));
    expect(firstRow).toBeDefined();

    await recordClientView(REVIEWER_ID, CLIENT_ASSIGNED_ID);
    const rows = await ownerDb.select().from(schema.userClientViews).where(eq(schema.userClientViews.userId, REVIEWER_ID));
    expect(rows).toHaveLength(1); // updated in place, not a second row
    expect(rows[0].lastViewedAt.getTime()).toBeGreaterThanOrEqual(firstRow.lastViewedAt.getTime());
  });

  it("a user CANNOT record a view for a client they can't access — WITH CHECK rejects it", async () => {
    await expect(recordClientView(REVIEWER_ID, CLIENT_UNASSIGNED_ID)).rejects.toThrow(/row-level security/i);
  });

  it("Owner (firm_admin, unconditional access) CAN record a view for any client in the firm", async () => {
    await recordClientView(OWNER_ID, CLIENT_UNASSIGNED_ID);
    const [row] = await ownerDb
      .select()
      .from(schema.userClientViews)
      .where(eq(schema.userClientViews.userId, OWNER_ID));
    expect(row).toBeDefined();
  });
});

describe("user_client_views RLS: strictly self-scoped", () => {
  it("a user CANNOT see another user's view rows via a direct SELECT", async () => {
    await recordClientView(REVIEWER_ID, CLIENT_ASSIGNED_ID);
    const rows = await withUserContext(OTHER_REVIEWER_ID, (tx) => tx.select().from(schema.userClientViews));
    expect(rows.every((r) => r.userId === OTHER_REVIEWER_ID)).toBe(true);
    expect(rows.some((r) => r.userId === REVIEWER_ID)).toBe(false);
  });

  it("a user CANNOT insert a view row attributed to someone else", async () => {
    await expect(
      withUserContext(REVIEWER_ID, (tx) =>
        tx.insert(schema.userClientViews).values({ userId: OTHER_REVIEWER_ID, clientId: CLIENT_ASSIGNED_ID })
      )
    ).rejects.toThrow(/row-level security/i);
  });
});

describe("getRecentClientsForUser()", () => {
  it("returns clients ordered most-recently-viewed first, not by when the account was created", async () => {
    await ownerDb.delete(schema.userClientViews).where(eq(schema.userClientViews.userId, OWNER_ID));
    await recordClientView(OWNER_ID, CLIENT_ASSIGNED_ID);
    await new Promise((r) => setTimeout(r, 10));
    await recordClientView(OWNER_ID, CLIENT_UNASSIGNED_ID);

    const recent = await getRecentClientsForUser(OWNER_ID);
    expect(recent.map((c) => c.id)).toEqual([CLIENT_UNASSIGNED_ID, CLIENT_ASSIGNED_ID]);
  });

  it("only shows clients the user can currently access — a view row for a now-inaccessible client silently drops out", async () => {
    // Reviewer viewed CLIENT_ASSIGNED_ID while assigned to it (recorded
    // above); remove the assignment, mirroring an Owner later narrowing
    // this Reviewer's access, and confirm the stale view row doesn't leak
    // a client this session can no longer actually reach.
    await ownerDb
      .delete(schema.userClientAssignments)
      .where(eq(schema.userClientAssignments.userId, REVIEWER_ID));

    const recent = await getRecentClientsForUser(REVIEWER_ID);
    expect(recent.map((c) => c.id)).not.toContain(CLIENT_ASSIGNED_ID);

    // Restore for isolation from any other test file sharing this DB.
    await ownerDb.insert(schema.userClientAssignments).values({ userId: REVIEWER_ID, clientId: CLIENT_ASSIGNED_ID }).onConflictDoNothing();
  });

  it("respects the limit parameter", async () => {
    const recent = await getRecentClientsForUser(OWNER_ID, 1);
    expect(recent).toHaveLength(1);
  });
});
