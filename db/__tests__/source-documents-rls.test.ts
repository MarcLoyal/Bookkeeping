/**
 * db/sql/020_source_documents_rls.sql — RLS on the new source_documents
 * table (foundation for AI receipt capture), tested against the real
 * RLS-enforcing keepbooks_app DB role via withUserContext(), same
 * approach team-roles-rls.test.ts and user-client-views.test.ts use.
 * Mirrors journal_entries' own insert/select shape deliberately (see
 * 020's own header comment for why) — this proves that mirroring holds.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../schema";
import { withUserContext } from "../client";

const ownerConn = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 2 });
const ownerDb = drizzle(ownerConn, { schema });

const FIRM_ID = "00000000-0000-4000-9800-000000000001";
const OTHER_FIRM_ID = "00000000-0000-4000-9800-000000000002";
const CLIENT_ID = "00000000-0000-4000-9800-000000000010";
const OTHER_FIRM_CLIENT_ID = "00000000-0000-4000-9800-000000000011";

const OWNER_ID = "00000000-0000-4000-9800-000000000020";
const BOOKKEEPER_ID = "00000000-0000-4000-9800-000000000021"; // access_scope 'all'
const ENCODER_A_ID = "00000000-0000-4000-9800-000000000022"; // access_scope 'assigned' — 013 forbids 'all' for encoder/reviewer/viewer
const ENCODER_B_ID = "00000000-0000-4000-9800-000000000023"; // access_scope 'assigned' — for "can't see/insert-as A"
const REVIEWER_ID = "00000000-0000-4000-9800-000000000024"; // access_scope 'assigned'
const VIEWER_ID = "00000000-0000-4000-9800-000000000025"; // access_scope 'assigned'
const OTHER_FIRM_OWNER_ID = "00000000-0000-4000-9800-000000000026";

function newClient(id: string, firmId: string, name: string) {
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
    status: "active" as const,
  };
}

beforeAll(async () => {
  await ownerDb.insert(schema.firms).values([{ id: FIRM_ID, name: "Source Docs Test Firm" }, { id: OTHER_FIRM_ID, name: "Source Docs Test Firm (Other)" }]).onConflictDoNothing();
  await ownerDb.insert(schema.clients).values([newClient(CLIENT_ID, FIRM_ID, "Source Docs Client"), newClient(OTHER_FIRM_CLIENT_ID, OTHER_FIRM_ID, "Other Firm Client")]).onConflictDoNothing();

  await ownerDb
    .insert(schema.users)
    .values([
      { id: OWNER_ID, firmId: FIRM_ID, email: `${OWNER_ID}@test.local`, name: "Owner", role: "firm_admin" },
      { id: BOOKKEEPER_ID, firmId: FIRM_ID, email: `${BOOKKEEPER_ID}@test.local`, name: "Bookkeeper", role: "bookkeeper", accessScope: "all" },
      { id: ENCODER_A_ID, firmId: FIRM_ID, email: `${ENCODER_A_ID}@test.local`, name: "Encoder A", role: "encoder", accessScope: "assigned" },
      { id: ENCODER_B_ID, firmId: FIRM_ID, email: `${ENCODER_B_ID}@test.local`, name: "Encoder B", role: "encoder", accessScope: "assigned" },
      { id: REVIEWER_ID, firmId: FIRM_ID, email: `${REVIEWER_ID}@test.local`, name: "Reviewer", role: "reviewer", accessScope: "assigned" },
      { id: VIEWER_ID, firmId: FIRM_ID, email: `${VIEWER_ID}@test.local`, name: "Viewer", role: "viewer", accessScope: "assigned" },
      { id: OTHER_FIRM_OWNER_ID, firmId: OTHER_FIRM_ID, email: `${OTHER_FIRM_OWNER_ID}@test.local`, name: "Other Firm Owner", role: "firm_admin" },
    ])
    .onConflictDoNothing();

  await ownerDb
    .insert(schema.userClientAssignments)
    .values([
      { userId: ENCODER_A_ID, clientId: CLIENT_ID },
      { userId: ENCODER_B_ID, clientId: CLIENT_ID },
      { userId: REVIEWER_ID, clientId: CLIENT_ID },
      { userId: VIEWER_ID, clientId: CLIENT_ID },
    ])
    .onConflictDoNothing();
});

afterAll(async () => {
  await ownerConn.end();
});

function upload(clientId: string, uploadedBy: string) {
  return { clientId, storagePath: `${clientId}/${crypto.randomUUID()}.jpg`, mimeType: "image/jpeg", uploadedBy };
}

describe("source_documents_insert", () => {
  it("Owner (firm_admin) can insert for any client in their firm", async () => {
    await withUserContext(OWNER_ID, (tx) => tx.insert(schema.sourceDocuments).values(upload(CLIENT_ID, OWNER_ID)));
  });

  it("Bookkeeper can insert for an accessible client", async () => {
    await withUserContext(BOOKKEEPER_ID, (tx) => tx.insert(schema.sourceDocuments).values(upload(CLIENT_ID, BOOKKEEPER_ID)));
  });

  it("Encoder can insert their own upload", async () => {
    await withUserContext(ENCODER_A_ID, (tx) => tx.insert(schema.sourceDocuments).values(upload(CLIENT_ID, ENCODER_A_ID)));
  });

  it("Encoder CANNOT insert a row attributed to someone else", async () => {
    await expect(
      withUserContext(ENCODER_A_ID, (tx) => tx.insert(schema.sourceDocuments).values(upload(CLIENT_ID, ENCODER_B_ID)))
    ).rejects.toThrow(/row-level security/i);
  });

  it("Reviewer CANNOT insert — not one of the upload-capable roles", async () => {
    await expect(
      withUserContext(REVIEWER_ID, (tx) => tx.insert(schema.sourceDocuments).values(upload(CLIENT_ID, REVIEWER_ID)))
    ).rejects.toThrow(/row-level security/i);
  });

  it("Viewer CANNOT insert — not one of the upload-capable roles", async () => {
    await expect(
      withUserContext(VIEWER_ID, (tx) => tx.insert(schema.sourceDocuments).values(upload(CLIENT_ID, VIEWER_ID)))
    ).rejects.toThrow(/row-level security/i);
  });

  it("nobody can insert for a client in another firm", async () => {
    await expect(
      withUserContext(OWNER_ID, (tx) => tx.insert(schema.sourceDocuments).values(upload(OTHER_FIRM_CLIENT_ID, OWNER_ID)))
    ).rejects.toThrow(/row-level security/i);
  });
});

describe("source_documents_select", () => {
  it("Owner/Bookkeeper/Reviewer/Viewer see every document for an accessible client, not just their own", async () => {
    await ownerDb.delete(schema.sourceDocuments).where(eq(schema.sourceDocuments.clientId, CLIENT_ID));
    await withUserContext(ENCODER_A_ID, (tx) => tx.insert(schema.sourceDocuments).values(upload(CLIENT_ID, ENCODER_A_ID)));
    await withUserContext(ENCODER_B_ID, (tx) => tx.insert(schema.sourceDocuments).values(upload(CLIENT_ID, ENCODER_B_ID)));

    for (const viewerId of [OWNER_ID, BOOKKEEPER_ID, REVIEWER_ID, VIEWER_ID]) {
      const rows = await withUserContext(viewerId, (tx) => tx.select().from(schema.sourceDocuments).where(eq(schema.sourceDocuments.clientId, CLIENT_ID)));
      expect(rows.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("Encoder sees only their own uploads, not another encoder's", async () => {
    const rowsA = await withUserContext(ENCODER_A_ID, (tx) => tx.select().from(schema.sourceDocuments).where(eq(schema.sourceDocuments.clientId, CLIENT_ID)));
    expect(rowsA.every((r) => r.uploadedBy === ENCODER_A_ID)).toBe(true);
    expect(rowsA.some((r) => r.uploadedBy === ENCODER_B_ID)).toBe(false);
  });

  it("a user in another firm sees none of this firm's documents", async () => {
    const rows = await withUserContext(OTHER_FIRM_OWNER_ID, (tx) => tx.select().from(schema.sourceDocuments).where(eq(schema.sourceDocuments.clientId, CLIENT_ID)));
    expect(rows).toHaveLength(0);
  });
});

describe("enforce_ai_scan_plan_limit() — fair-use cap on AI scans per month", () => {
  const CAP_FIRM_ID = "00000000-0000-4000-9800-000000000030";
  const CAP_CLIENT_ID = "00000000-0000-4000-9800-000000000031";
  const CAP_OWNER_ID = "00000000-0000-4000-9800-000000000032";
  const CAP_ENCODER_ID = "00000000-0000-4000-9800-000000000033"; // access_scope 'assigned'

  const OTHER_CAP_FIRM_ID = "00000000-0000-4000-9800-000000000034";
  const OTHER_CAP_CLIENT_ID = "00000000-0000-4000-9800-000000000035";
  const OTHER_CAP_OWNER_ID = "00000000-0000-4000-9800-000000000036";

  beforeAll(async () => {
    await ownerDb
      .insert(schema.firms)
      .values({ id: CAP_FIRM_ID, name: "AI Scan Cap Test Firm", maxAiScansPerMonth: 2 })
      .onConflictDoUpdate({ target: schema.firms.id, set: { maxAiScansPerMonth: 2 } });
    await ownerDb
      .insert(schema.firms)
      .values({ id: OTHER_CAP_FIRM_ID, name: "AI Scan Cap Test Firm (Other)", maxAiScansPerMonth: 1 })
      .onConflictDoUpdate({ target: schema.firms.id, set: { maxAiScansPerMonth: 1 } });

    await ownerDb
      .insert(schema.clients)
      .values([newClient(CAP_CLIENT_ID, CAP_FIRM_ID, "AI Scan Cap Client"), newClient(OTHER_CAP_CLIENT_ID, OTHER_CAP_FIRM_ID, "AI Scan Cap Client (Other Firm)")])
      .onConflictDoNothing();
    await ownerDb
      .insert(schema.users)
      .values([
        { id: CAP_OWNER_ID, firmId: CAP_FIRM_ID, email: `${CAP_OWNER_ID}@test.local`, name: "Cap Owner", role: "firm_admin" },
        { id: CAP_ENCODER_ID, firmId: CAP_FIRM_ID, email: `${CAP_ENCODER_ID}@test.local`, name: "Cap Encoder", role: "encoder", accessScope: "assigned" },
        { id: OTHER_CAP_OWNER_ID, firmId: OTHER_CAP_FIRM_ID, email: `${OTHER_CAP_OWNER_ID}@test.local`, name: "Other Cap Owner", role: "firm_admin" },
      ])
      .onConflictDoNothing();
    await ownerDb.insert(schema.userClientAssignments).values([{ userId: CAP_ENCODER_ID, clientId: CAP_CLIENT_ID }]).onConflictDoNothing();

    // Clean slate for the counting tests below — this describe block's own
    // fixture firm, not touching any other test file's data.
    await ownerDb.delete(schema.sourceDocuments).where(eq(schema.sourceDocuments.clientId, CAP_CLIENT_ID));
    await ownerDb.delete(schema.sourceDocuments).where(eq(schema.sourceDocuments.clientId, OTHER_CAP_CLIENT_ID));
  });

  it("allows scans up to the cap, counted across roles — not just the inserting user's own", async () => {
    // First scan as Owner, second as Encoder: both must count toward the
    // SAME firm-wide total for the third (by either role) to be rejected —
    // this is exactly what the trigger's SECURITY DEFINER exists to prove,
    // since source_documents_select would otherwise hide Owner's scan from
    // an Encoder's own RLS-scoped view.
    await withUserContext(CAP_OWNER_ID, (tx) => tx.insert(schema.sourceDocuments).values(upload(CAP_CLIENT_ID, CAP_OWNER_ID)));
    await withUserContext(CAP_ENCODER_ID, (tx) => tx.insert(schema.sourceDocuments).values(upload(CAP_CLIENT_ID, CAP_ENCODER_ID)));
  });

  it("rejects the scan that would exceed the cap, with a clear message", async () => {
    await expect(
      withUserContext(CAP_OWNER_ID, (tx) => tx.insert(schema.sourceDocuments).values(upload(CAP_CLIENT_ID, CAP_OWNER_ID)))
    ).rejects.toThrow(/monthly ai scan limit reached/i);
  });

  it("a scan from a previous month doesn't count against the current month's cap", async () => {
    // The two scans above already used up this firm's cap of 2 for the
    // current month. Backdate one of them via a plain UPDATE (the trigger
    // is BEFORE INSERT only, so this doesn't re-trigger it) to prove the
    // count is genuinely calendar-month-scoped, not just "ever" — freeing
    // up room for one more scan this month.
    const [firstDoc] = await ownerDb.select().from(schema.sourceDocuments).where(eq(schema.sourceDocuments.clientId, CAP_CLIENT_ID)).limit(1);
    await ownerDb.update(schema.sourceDocuments).set({ createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000) }).where(eq(schema.sourceDocuments.id, firstDoc.id));

    await withUserContext(CAP_OWNER_ID, (tx) => tx.insert(schema.sourceDocuments).values(upload(CAP_CLIENT_ID, CAP_OWNER_ID)));
  });

  it("a different firm's cap and scan count are completely independent", async () => {
    // OTHER_CAP_FIRM_ID's cap is 1 — unaffected by CAP_FIRM_ID's scans above.
    await withUserContext(OTHER_CAP_OWNER_ID, (tx) => tx.insert(schema.sourceDocuments).values(upload(OTHER_CAP_CLIENT_ID, OTHER_CAP_OWNER_ID)));
    await expect(
      withUserContext(OTHER_CAP_OWNER_ID, (tx) => tx.insert(schema.sourceDocuments).values(upload(OTHER_CAP_CLIENT_ID, OTHER_CAP_OWNER_ID)))
    ).rejects.toThrow(/monthly ai scan limit reached/i);
  });
});

describe("journal_entries.source_document_id FK", () => {
  it("can be set to a real source_documents row and read back", async () => {
    const [doc] = await withUserContext(OWNER_ID, (tx) => tx.insert(schema.sourceDocuments).values(upload(CLIENT_ID, OWNER_ID)).returning());
    const [entry] = await withUserContext(OWNER_ID, (tx) =>
      tx
        .insert(schema.journalEntries)
        .values({
          clientId: CLIENT_ID,
          entryDate: "2026-01-15",
          book: "GJ",
          description: "Receipt-capture fixture entry",
          status: "draft",
          createdBy: OWNER_ID,
          sourceDocumentId: doc.id,
        })
        .returning()
    );
    expect(entry.sourceDocumentId).toBe(doc.id);
  });
});
