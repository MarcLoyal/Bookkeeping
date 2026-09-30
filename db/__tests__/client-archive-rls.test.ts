/**
 * db/sql/017_client_archive_owner_only.sql — client delete → archive.
 * Proves, at the real RLS-enforcing `keepbooks_app` DB role (not just the
 * app layer): only an Owner can move a client's status into or out of
 * 'archived'; every other staff role is rejected by the trigger even
 * though clients_update otherwise lets them edit a client; DELETE on
 * `clients` is refused for everyone now that clients_delete no longer
 * exists; and an archived client's historical journal_entries/audit_log
 * rows stay fully intact and readable.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../schema";
import { withUserContext } from "../client";
import { setClientArchived } from "../../lib/auth/set-client-archived";
import type { CurrentUser } from "../../lib/auth/current-user";

const ownerConn = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 2 });
const ownerDb = drizzle(ownerConn, { schema });

const FIRM_ID = "00000000-0000-4000-9800-000000000001";
const CLIENT_ID = "00000000-0000-4000-9800-000000000002";

const OWNER_ID = "00000000-0000-4000-9800-000000000010";
const BOOKKEEPER_ID = "00000000-0000-4000-9800-000000000011"; // access_scope 'all' — can otherwise edit this client via clients_update
const REVIEWER_ID = "00000000-0000-4000-9800-000000000012"; // access_scope 'assigned', granted this client
const ENCODER_ID = "00000000-0000-4000-9800-000000000013"; // access_scope 'assigned', granted this client
const VIEWER_ID = "00000000-0000-4000-9800-000000000014"; // access_scope 'assigned', granted this client

let assetAccountId: string;
let liabilityAccountId: string;

async function upsertUser(id: string, email: string, role: string, accessScope: "all" | "assigned") {
  await ownerDb
    .insert(schema.users)
    .values({ id, firmId: FIRM_ID, email, name: email, role: role as any, accessScope, active: true })
    .onConflictDoUpdate({ target: schema.users.id, set: { role: role as any, accessScope, active: true } });
}

async function resetStatus(status: "active" | "archived") {
  await ownerDb.update(schema.clients).set({ status }).where(eq(schema.clients.id, CLIENT_ID));
}

beforeAll(async () => {
  // maxClients/maxUsers high enough that this file's 5 role fixtures
  // never trip 018_plan_limits.sql's triggers — plan limits aren't what
  // this file tests, and 5 users sits exactly at the trial-tier default
  // (fragile). onConflictDoUpdate, not onConflictDoNothing: a firm row
  // left over from before 018 existed would otherwise keep its
  // backfilled trial-tier defaults forever.
  await ownerDb
    .insert(schema.firms)
    .values({ id: FIRM_ID, name: "Archive RLS Test Firm", plan: "enterprise", maxClients: 1000, maxUsers: 1000 })
    .onConflictDoUpdate({ target: schema.firms.id, set: { maxClients: 1000, maxUsers: 1000 } });

  await ownerDb
    .insert(schema.clients)
    .values({
      id: CLIENT_ID,
      firmId: FIRM_ID,
      registeredName: "Archive Test Client",
      tin: "000-000-000-00000",
      rdoCode: "000",
      taxpayerType: "corporation",
      vatStatus: "vat",
      incomeTaxRegime: "rcit",
      address: "Test address",
      status: "active",
    })
    .onConflictDoNothing();

  await upsertUser(OWNER_ID, "archive-owner@test.local", "firm_admin", "all");
  await upsertUser(BOOKKEEPER_ID, "archive-bookkeeper@test.local", "bookkeeper", "all");
  await upsertUser(REVIEWER_ID, "archive-reviewer@test.local", "reviewer", "assigned");
  await upsertUser(ENCODER_ID, "archive-encoder@test.local", "encoder", "assigned");
  await upsertUser(VIEWER_ID, "archive-viewer@test.local", "viewer", "assigned");

  await ownerDb
    .insert(schema.userClientAssignments)
    .values([
      { userId: REVIEWER_ID, clientId: CLIENT_ID },
      { userId: ENCODER_ID, clientId: CLIENT_ID },
      { userId: VIEWER_ID, clientId: CLIENT_ID },
    ])
    .onConflictDoNothing();

  const existingAccounts = await ownerDb.select().from(schema.accounts).where(eq(schema.accounts.clientId, CLIENT_ID));
  const asset = existingAccounts.find((a) => a.code === "ARC-CASH");
  const liability = existingAccounts.find((a) => a.code === "ARC-AP");
  if (asset) {
    assetAccountId = asset.id;
  } else {
    [{ id: assetAccountId }] = await ownerDb
      .insert(schema.accounts)
      .values({ clientId: CLIENT_ID, code: "ARC-CASH", name: "Archive Test Cash", type: "asset", normalBalance: "debit", fsLineMapping: "current_assets" })
      .returning({ id: schema.accounts.id });
  }
  if (liability) {
    liabilityAccountId = liability.id;
  } else {
    [{ id: liabilityAccountId }] = await ownerDb
      .insert(schema.accounts)
      .values({ clientId: CLIENT_ID, code: "ARC-AP", name: "Archive Test AP", type: "liability", normalBalance: "credit", fsLineMapping: "current_liabilities" })
      .returning({ id: schema.accounts.id });
  }
});

afterAll(async () => {
  await ownerConn.end();
});

describe("clients UPDATE (status → archived): Owner-only, enforced by trigger", () => {
  it("Owner CAN archive a client", async () => {
    await withUserContext(OWNER_ID, (tx) => tx.update(schema.clients).set({ status: "archived" }).where(eq(schema.clients.id, CLIENT_ID)));
    const [row] = await ownerDb.select().from(schema.clients).where(eq(schema.clients.id, CLIENT_ID));
    expect(row.status).toBe("archived");
  });

  it("Owner CAN reactivate that same client", async () => {
    await resetStatus("archived");
    await withUserContext(OWNER_ID, (tx) => tx.update(schema.clients).set({ status: "active" }).where(eq(schema.clients.id, CLIENT_ID)));
    const [row] = await ownerDb.select().from(schema.clients).where(eq(schema.clients.id, CLIENT_ID));
    expect(row.status).toBe("active");
  });

  it("Bookkeeper CANNOT archive, even though clients_update otherwise lets them edit this client", async () => {
    await expect(
      withUserContext(BOOKKEEPER_ID, (tx) => tx.update(schema.clients).set({ status: "archived" }).where(eq(schema.clients.id, CLIENT_ID)))
    ).rejects.toThrow();
    const [row] = await ownerDb.select().from(schema.clients).where(eq(schema.clients.id, CLIENT_ID));
    expect(row.status).toBe("active");
  });

  it("Bookkeeper CANNOT reactivate an archived client", async () => {
    await resetStatus("archived");
    await expect(
      withUserContext(BOOKKEEPER_ID, (tx) => tx.update(schema.clients).set({ status: "active" }).where(eq(schema.clients.id, CLIENT_ID)))
    ).rejects.toThrow();
    const [row] = await ownerDb.select().from(schema.clients).where(eq(schema.clients.id, CLIENT_ID));
    expect(row.status).toBe("archived");
    await resetStatus("active");
  });

  it("Reviewer/Encoder/Viewer CANNOT archive (they have no clients_update access to begin with)", async () => {
    for (const id of [REVIEWER_ID, ENCODER_ID, VIEWER_ID]) {
      // No clients_update policy match for these roles at all — the UPDATE
      // silently affects zero rows rather than throwing (no trigger even
      // fires), unlike the Bookkeeper case above.
      await withUserContext(id, (tx) => tx.update(schema.clients).set({ status: "archived" }).where(eq(schema.clients.id, CLIENT_ID)));
    }
    const [row] = await ownerDb.select().from(schema.clients).where(eq(schema.clients.id, CLIENT_ID));
    expect(row.status).toBe("active");
  });

  it("Bookkeeper CAN still edit an ordinary field on this client (proves the trigger is scoped to archive transitions only)", async () => {
    await withUserContext(BOOKKEEPER_ID, (tx) => tx.update(schema.clients).set({ tradeName: "Archive Test Co." }).where(eq(schema.clients.id, CLIENT_ID)));
    const [row] = await ownerDb.select().from(schema.clients).where(eq(schema.clients.id, CLIENT_ID));
    expect(row.tradeName).toBe("Archive Test Co.");
  });
});

describe("clients DELETE: no policy exists for anyone, including Owner", () => {
  it("Owner's DELETE affects zero rows — the client still exists", async () => {
    await withUserContext(OWNER_ID, (tx) => tx.delete(schema.clients).where(eq(schema.clients.id, CLIENT_ID)));
    const [row] = await ownerDb.select().from(schema.clients).where(eq(schema.clients.id, CLIENT_ID));
    expect(row).toBeDefined();
  });
});

const POSTED_FIXTURE_ENTRY_ID = "00000000-0000-4000-9800-000000000020";

describe("archived client's BIR history survives intact", () => {
  it("a posted journal entry and its audit_log rows remain fully readable after archiving", async () => {
    // Once posted, an entry (and its lines) is immutable forever — no role,
    // not even the schema owner, can update or delete it
    // (enforce_journal_entry_immutability / enforce_journal_line_immutability,
    // 001_functions_triggers_rls.sql). So this fixture uses a fixed id and an
    // idempotent insert, exactly like acceptance.test.ts's reserved
    // entryNo fixtures, rather than a throwaway row this test tries (and
    // fails) to clean up afterward.
    const existing = await ownerDb.select().from(schema.journalEntries).where(eq(schema.journalEntries.id, POSTED_FIXTURE_ENTRY_ID));
    let entryId = existing[0]?.id;
    if (!entryId) {
      const [entry] = await ownerDb
        .insert(schema.journalEntries)
        .values({ id: POSTED_FIXTURE_ENTRY_ID, clientId: CLIENT_ID, entryDate: "2026-01-15", book: "GJ", description: "Archive fixture entry", status: "draft", createdBy: OWNER_ID })
        .returning();
      entryId = entry.id;
      await ownerDb.insert(schema.journalLines).values([
        { entryId, lineNo: 1, accountId: assetAccountId, debitCentavos: 5000n, creditCentavos: 0n },
        { entryId, lineNo: 2, accountId: liabilityAccountId, debitCentavos: 0n, creditCentavos: 5000n },
      ]);
      await ownerDb.update(schema.journalEntries).set({ status: "posted" }).where(eq(schema.journalEntries.id, entryId));
    }

    await withUserContext(OWNER_ID, (tx) => tx.update(schema.clients).set({ status: "archived" }).where(eq(schema.clients.id, CLIENT_ID)));

    const linesAfterArchive = await withUserContext(OWNER_ID, (tx) => tx.select().from(schema.journalLines).where(eq(schema.journalLines.entryId, entryId)));
    expect(linesAfterArchive).toHaveLength(2);

    const auditRows = await ownerDb.select().from(schema.auditLog).where(eq(schema.auditLog.tableName, "clients"));
    expect(auditRows.some((r) => r.recordId === CLIENT_ID && r.action === "UPDATE")).toBe(true);

    await resetStatus("active");
  });
});

describe("setClientArchived()", () => {
  const owner: CurrentUser = { id: OWNER_ID, firmId: FIRM_ID, clientId: null, email: "archive-owner@test.local", name: "Owner", role: "firm_admin" };
  const bookkeeper: CurrentUser = { id: BOOKKEEPER_ID, firmId: FIRM_ID, clientId: null, email: "archive-bookkeeper@test.local", name: "Bookkeeper", role: "bookkeeper" };

  it("refuses a non-Owner with a friendly message, before ever touching the DB", async () => {
    const result = await setClientArchived(bookkeeper, { clientId: CLIENT_ID, archived: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/only an owner/i);
  });

  it("Owner can archive and reactivate through the function", async () => {
    const archiveResult = await setClientArchived(owner, { clientId: CLIENT_ID, archived: true });
    expect(archiveResult.ok).toBe(true);
    let [row] = await ownerDb.select().from(schema.clients).where(eq(schema.clients.id, CLIENT_ID));
    expect(row.status).toBe("archived");

    const reactivateResult = await setClientArchived(owner, { clientId: CLIENT_ID, archived: false });
    expect(reactivateResult.ok).toBe(true);
    [row] = await ownerDb.select().from(schema.clients).where(eq(schema.clients.id, CLIENT_ID));
    expect(row.status).toBe("active");
  });
});
