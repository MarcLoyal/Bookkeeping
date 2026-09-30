/**
 * updateDraftGeneralJournal() / deleteJournalEntry() (lib/data/post-
 * transaction.ts) — the data-layer functions behind the entry detail
 * page's Edit/Delete buttons. RLS is the real permission backstop (proven
 * directly against journal_entries/journal_lines in
 * team-roles-rls.test.ts); this file proves the higher-level functions
 * built on top of it behave correctly — resolving account codes, replacing
 * lines wholesale, and staying blocked exactly where RLS says they should.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../schema";
import { getJournalEntry } from "@/lib/data/journal";
import { createDraftGeneralJournal, deleteJournalEntry, postGeneralJournal, updateDraftGeneralJournal } from "@/lib/data/post-transaction";

const ownerConn = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 2 });
const ownerDb = drizzle(ownerConn, { schema });

const FIRM_ID = "00000000-0000-4000-9600-000000000001";
const CLIENT_ID = "00000000-0000-4000-9600-000000000002";
const ENCODER_A_ID = "00000000-0000-4000-9600-000000000010";
const ENCODER_B_ID = "00000000-0000-4000-9600-000000000011";
const OWNER_ID = "00000000-0000-4000-9600-000000000012";
const BOOKKEEPER_ID = "00000000-0000-4000-9600-000000000013";

beforeAll(async () => {
  await ownerDb.insert(schema.firms).values({ id: FIRM_ID, name: "Edit/Delete Draft Test Firm" }).onConflictDoNothing();
  await ownerDb
    .insert(schema.clients)
    .values({
      id: CLIENT_ID,
      firmId: FIRM_ID,
      registeredName: "Edit/Delete Draft Test Client",
      tin: "000-000-000-00000",
      rdoCode: "000",
      taxpayerType: "corporation",
      vatStatus: "vat",
      incomeTaxRegime: "rcit",
      address: "Test address",
      status: "active",
    })
    .onConflictDoNothing();

  await ownerDb
    .insert(schema.users)
    .values([
      { id: ENCODER_A_ID, firmId: FIRM_ID, email: `${ENCODER_A_ID}@test.local`, name: "Encoder A", role: "encoder", accessScope: "assigned" },
      { id: ENCODER_B_ID, firmId: FIRM_ID, email: `${ENCODER_B_ID}@test.local`, name: "Encoder B", role: "encoder", accessScope: "assigned" },
      { id: OWNER_ID, firmId: FIRM_ID, email: `${OWNER_ID}@test.local`, name: "Owner", role: "firm_admin" },
      { id: BOOKKEEPER_ID, firmId: FIRM_ID, email: `${BOOKKEEPER_ID}@test.local`, name: "Bookkeeper", role: "bookkeeper" },
    ])
    .onConflictDoNothing();
  await ownerDb
    .insert(schema.userClientAssignments)
    .values([
      { userId: ENCODER_A_ID, clientId: CLIENT_ID },
      { userId: ENCODER_B_ID, clientId: CLIENT_ID },
    ])
    .onConflictDoNothing();

  const existingAccounts = await ownerDb.select().from(schema.accounts).where(eq(schema.accounts.clientId, CLIENT_ID));
  if (!existingAccounts.some((a) => a.code === "ED-CASH")) {
    await ownerDb
      .insert(schema.accounts)
      .values({ clientId: CLIENT_ID, code: "ED-CASH", name: "Edit Test Cash", type: "asset", normalBalance: "debit", fsLineMapping: "current_assets" });
  }
  if (!existingAccounts.some((a) => a.code === "ED-AP")) {
    await ownerDb
      .insert(schema.accounts)
      .values({ clientId: CLIENT_ID, code: "ED-AP", name: "Edit Test Payable", type: "liability", normalBalance: "credit", fsLineMapping: "current_liabilities" });
  }
});

afterAll(async () => {
  await ownerConn.end();
});

describe("updateDraftGeneralJournal()", () => {
  it("the creator CAN edit their own draft — fields and lines both replaced", async () => {
    const entryId = await createDraftGeneralJournal(ENCODER_A_ID, {
      clientId: CLIENT_ID,
      entryDate: "2026-04-01",
      description: "Original",
      referenceNo: "ED-001",
      lines: [
        { accountCode: "ED-CASH", debitCentavos: 1000n, creditCentavos: 0n },
        { accountCode: "ED-AP", debitCentavos: 0n, creditCentavos: 1000n },
      ],
    });

    await updateDraftGeneralJournal(ENCODER_A_ID, entryId, {
      clientId: CLIENT_ID,
      entryDate: "2026-04-02",
      description: "Edited",
      referenceNo: "ED-002",
      lines: [
        { accountCode: "ED-CASH", debitCentavos: 2500n, creditCentavos: 0n },
        { accountCode: "ED-AP", debitCentavos: 0n, creditCentavos: 2500n },
      ],
    });

    const after = await getJournalEntry(ENCODER_A_ID, CLIENT_ID, entryId);
    expect(after?.entryDate).toBe("2026-04-02");
    expect(after?.description).toBe("Edited");
    expect(after?.referenceNo).toBe("ED-002");
    expect(after?.lines).toHaveLength(2);
    expect(after?.lines.find((l) => l.accountCode === "ED-CASH")?.debitCentavos).toBe(2500n);
  });

  it("firm_admin/bookkeeper CAN edit an Encoder's draft (not just their own)", async () => {
    const entryId = await createDraftGeneralJournal(ENCODER_A_ID, {
      clientId: CLIENT_ID,
      entryDate: "2026-04-03",
      description: "Encoder's draft",
      lines: [
        { accountCode: "ED-CASH", debitCentavos: 500n, creditCentavos: 0n },
        { accountCode: "ED-AP", debitCentavos: 0n, creditCentavos: 500n },
      ],
    });

    await updateDraftGeneralJournal(OWNER_ID, entryId, {
      clientId: CLIENT_ID,
      entryDate: "2026-04-03",
      description: "Edited by Owner",
      lines: [
        { accountCode: "ED-CASH", debitCentavos: 500n, creditCentavos: 0n },
        { accountCode: "ED-AP", debitCentavos: 0n, creditCentavos: 500n },
      ],
    });

    const after = await getJournalEntry(OWNER_ID, CLIENT_ID, entryId);
    expect(after?.description).toBe("Edited by Owner");
  });

  it("an Encoder CANNOT edit another Encoder's draft — rejected outright, nothing left half-changed", async () => {
    const entryId = await createDraftGeneralJournal(ENCODER_B_ID, {
      clientId: CLIENT_ID,
      entryDate: "2026-04-04",
      description: "Encoder B's draft",
      lines: [
        { accountCode: "ED-CASH", debitCentavos: 750n, creditCentavos: 0n },
        { accountCode: "ED-AP", debitCentavos: 0n, creditCentavos: 750n },
      ],
    });

    // Unlike DELETE (which silently affects 0 rows when RLS's USING clause
    // excludes every row), the entry UPDATE here also affects 0 rows, but
    // the line replace's INSERT has no "no matching rows" to fall back to
    // — WITH CHECK rejects the new row outright, so this throws instead of
    // quietly no-op'ing.
    await expect(
      updateDraftGeneralJournal(ENCODER_A_ID, entryId, {
        clientId: CLIENT_ID,
        entryDate: "2026-04-04",
        description: "Should not apply",
        lines: [
          { accountCode: "ED-CASH", debitCentavos: 750n, creditCentavos: 0n },
          { accountCode: "ED-AP", debitCentavos: 0n, creditCentavos: 750n },
        ],
      })
    ).rejects.toThrow(/row-level security/i);

    // The entry's own fields never changed (its UPDATE affected 0 rows
    // before the throw), but the DELETE-then-INSERT on its lines is NOT
    // atomic against that same fact in isolation — confirm the lines
    // themselves survived too, not just the entry row.
    const after = await getJournalEntry(OWNER_ID, CLIENT_ID, entryId);
    expect(after?.description).toBe("Encoder B's draft");
    expect(after?.lines).toHaveLength(2);
  });

  it("CANNOT edit a posted entry — the immutability trigger rejects it outright", async () => {
    const entryId = await postGeneralJournal(BOOKKEEPER_ID, {
      clientId: CLIENT_ID,
      entryDate: "2026-04-05",
      description: "Posted entry",
      lines: [
        { accountCode: "ED-CASH", debitCentavos: 300n, creditCentavos: 0n },
        { accountCode: "ED-AP", debitCentavos: 0n, creditCentavos: 300n },
      ],
    });

    await expect(
      updateDraftGeneralJournal(BOOKKEEPER_ID, entryId, {
        clientId: CLIENT_ID,
        entryDate: "2026-04-05",
        description: "Should not apply",
        lines: [
          { accountCode: "ED-CASH", debitCentavos: 300n, creditCentavos: 0n },
          { accountCode: "ED-AP", debitCentavos: 0n, creditCentavos: 300n },
        ],
      })
    ).rejects.toThrow(/immutable/i);
  });
});

describe("deleteJournalEntry()", () => {
  it("the creator CAN delete their own draft — lines cascade with it", async () => {
    const entryId = await createDraftGeneralJournal(ENCODER_A_ID, {
      clientId: CLIENT_ID,
      entryDate: "2026-04-06",
      description: "To be deleted",
      lines: [
        { accountCode: "ED-CASH", debitCentavos: 100n, creditCentavos: 0n },
        { accountCode: "ED-AP", debitCentavos: 0n, creditCentavos: 100n },
      ],
    });

    await deleteJournalEntry(ENCODER_A_ID, entryId);

    const [entryRow] = await ownerDb.select().from(schema.journalEntries).where(eq(schema.journalEntries.id, entryId));
    expect(entryRow).toBeUndefined();
    const lineRows = await ownerDb.select().from(schema.journalLines).where(eq(schema.journalLines.entryId, entryId));
    expect(lineRows).toHaveLength(0);
  });

  it("firm_admin CAN delete an Encoder's draft (not just their own)", async () => {
    const entryId = await createDraftGeneralJournal(ENCODER_A_ID, {
      clientId: CLIENT_ID,
      entryDate: "2026-04-07",
      description: "Owner will delete this",
      lines: [
        { accountCode: "ED-CASH", debitCentavos: 200n, creditCentavos: 0n },
        { accountCode: "ED-AP", debitCentavos: 0n, creditCentavos: 200n },
      ],
    });

    await deleteJournalEntry(OWNER_ID, entryId);

    const [entryRow] = await ownerDb.select().from(schema.journalEntries).where(eq(schema.journalEntries.id, entryId));
    expect(entryRow).toBeUndefined();
  });

  it("an Encoder CANNOT delete another Encoder's draft — silently a no-op", async () => {
    const entryId = await createDraftGeneralJournal(ENCODER_B_ID, {
      clientId: CLIENT_ID,
      entryDate: "2026-04-08",
      description: "Encoder B's draft, untouched",
      lines: [
        { accountCode: "ED-CASH", debitCentavos: 400n, creditCentavos: 0n },
        { accountCode: "ED-AP", debitCentavos: 0n, creditCentavos: 400n },
      ],
    });

    await deleteJournalEntry(ENCODER_A_ID, entryId);

    const [entryRow] = await ownerDb.select().from(schema.journalEntries).where(eq(schema.journalEntries.id, entryId));
    expect(entryRow).toBeDefined();
  });

  it("CANNOT delete a posted entry — the immutability trigger rejects it outright", async () => {
    const entryId = await postGeneralJournal(BOOKKEEPER_ID, {
      clientId: CLIENT_ID,
      entryDate: "2026-04-09",
      description: "Posted, cannot delete",
      lines: [
        { accountCode: "ED-CASH", debitCentavos: 600n, creditCentavos: 0n },
        { accountCode: "ED-AP", debitCentavos: 0n, creditCentavos: 600n },
      ],
    });

    await expect(deleteJournalEntry(BOOKKEEPER_ID, entryId)).rejects.toThrow(/immutable|reversing entry/i);
  });
});

describe("createDraftGeneralJournal(): sourceDocumentId (AI receipt capture)", () => {
  const SOURCE_DOCUMENT_ID = "00000000-0000-4000-9600-000000000020";

  beforeAll(async () => {
    await ownerDb
      .insert(schema.sourceDocuments)
      .values({ id: SOURCE_DOCUMENT_ID, clientId: CLIENT_ID, storagePath: `${CLIENT_ID}/${SOURCE_DOCUMENT_ID}.jpg`, mimeType: "image/jpeg", uploadedBy: OWNER_ID })
      .onConflictDoNothing();
  });

  it("attaches the given sourceDocumentId to the new draft", async () => {
    const entryId = await createDraftGeneralJournal(OWNER_ID, {
      clientId: CLIENT_ID,
      entryDate: "2026-04-10",
      description: "From a receipt photo",
      lines: [
        { accountCode: "ED-CASH", debitCentavos: 700n, creditCentavos: 0n },
        { accountCode: "ED-AP", debitCentavos: 0n, creditCentavos: 700n },
      ],
      sourceDocumentId: SOURCE_DOCUMENT_ID,
    });

    const [row] = await ownerDb.select().from(schema.journalEntries).where(eq(schema.journalEntries.id, entryId));
    expect(row.sourceDocumentId).toBe(SOURCE_DOCUMENT_ID);
  });

  it("leaves sourceDocumentId null for an ordinary draft that doesn't pass one — existing manual-entry flow is unaffected", async () => {
    const entryId = await createDraftGeneralJournal(OWNER_ID, {
      clientId: CLIENT_ID,
      entryDate: "2026-04-11",
      description: "Ordinary manual draft, no photo",
      lines: [
        { accountCode: "ED-CASH", debitCentavos: 300n, creditCentavos: 0n },
        { accountCode: "ED-AP", debitCentavos: 0n, creditCentavos: 300n },
      ],
    });

    const [row] = await ownerDb.select().from(schema.journalEntries).where(eq(schema.journalEntries.id, entryId));
    expect(row.sourceDocumentId).toBeNull();
  });

  it("editing the draft never detaches its source document — updateDraftGeneralJournal's UPDATE never touches that column", async () => {
    const entryId = await createDraftGeneralJournal(OWNER_ID, {
      clientId: CLIENT_ID,
      entryDate: "2026-04-12",
      description: "From a receipt photo, about to be edited",
      lines: [
        { accountCode: "ED-CASH", debitCentavos: 800n, creditCentavos: 0n },
        { accountCode: "ED-AP", debitCentavos: 0n, creditCentavos: 800n },
      ],
      sourceDocumentId: SOURCE_DOCUMENT_ID,
    });

    await updateDraftGeneralJournal(OWNER_ID, entryId, {
      clientId: CLIENT_ID,
      entryDate: "2026-04-13",
      description: "Edited after AI prefill",
      lines: [
        { accountCode: "ED-CASH", debitCentavos: 850n, creditCentavos: 0n },
        { accountCode: "ED-AP", debitCentavos: 0n, creditCentavos: 850n },
      ],
    });

    const [row] = await ownerDb.select().from(schema.journalEntries).where(eq(schema.journalEntries.id, entryId));
    expect(row.sourceDocumentId).toBe(SOURCE_DOCUMENT_ID);
    expect(row.description).toBe("Edited after AI prefill");
  });
});
