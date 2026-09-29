/**
 * findPossibleDuplicateGeneralJournalEntry() (lib/data/journal.ts) — the
 * "did someone already key this" check that runs before
 * GeneralJournalForm actually saves a draft or posts. Only meaningful
 * once an Encoder can see entries other than their own (see
 * db/sql/014_encoder_read_all_client_entries.sql and
 * team-roles-rls.test.ts's "Encoder sees ALL entries" describe block) —
 * this file focuses on the matching logic itself, not RLS.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../schema";
import { findPossibleDuplicateGeneralJournalEntry } from "@/lib/data/journal";
import { createDraftGeneralJournal } from "@/lib/data/post-transaction";

const ownerConn = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 2 });
const ownerDb = drizzle(ownerConn, { schema });

const FIRM_ID = "00000000-0000-4000-9500-000000000001";
const CLIENT_ID = "00000000-0000-4000-9500-000000000002";
const ENCODER_A_ID = "00000000-0000-4000-9500-000000000010";
const ENCODER_B_ID = "00000000-0000-4000-9500-000000000011";

let assetAccountId: string;
let liabilityAccountId: string;

beforeAll(async () => {
  await ownerDb.insert(schema.firms).values({ id: FIRM_ID, name: "Duplicate Detection Test Firm" }).onConflictDoNothing();
  await ownerDb
    .insert(schema.clients)
    .values({
      id: CLIENT_ID,
      firmId: FIRM_ID,
      registeredName: "Duplicate Detection Test Client",
      tin: "000-000-000-00000",
      rdoCode: "000",
      taxpayerType: "corporation",
      vatStatus: "vat",
      incomeTaxRegime: "rcit",
      address: "Test address",
      status: "active",
    })
    .onConflictDoNothing();

  // accessScope: "assigned", not "all" — Encoder may never be 'all'
  // (db/sql/013_role_access_scope_check.sql's CHECK constraint). Both
  // granted CLIENT_ID explicitly so they still see each other's entries,
  // which is exactly what this file's duplicate-detection checks need.
  for (const id of [ENCODER_A_ID, ENCODER_B_ID]) {
    await ownerDb
      .insert(schema.users)
      .values({ id, firmId: FIRM_ID, email: `${id}@test.local`, name: id, role: "encoder", accessScope: "assigned" })
      .onConflictDoUpdate({ target: schema.users.id, set: { role: "encoder", firmId: FIRM_ID, accessScope: "assigned" } });
  }
  await ownerDb
    .insert(schema.userClientAssignments)
    .values([
      { userId: ENCODER_A_ID, clientId: CLIENT_ID },
      { userId: ENCODER_B_ID, clientId: CLIENT_ID },
    ])
    .onConflictDoNothing();

  const existingAccounts = await ownerDb.select().from(schema.accounts).where(eq(schema.accounts.clientId, CLIENT_ID));
  const asset = existingAccounts.find((a) => a.code == "DD-CASH");
  const liability = existingAccounts.find((a) => a.code === "DD-AP");
  assetAccountId = asset
    ? asset.id
    : (
        await ownerDb
          .insert(schema.accounts)
          .values({ clientId: CLIENT_ID, code: "DD-CASH", name: "Dup Test Cash", type: "asset", normalBalance: "debit", fsLineMapping: "current_assets" })
          .returning({ id: schema.accounts.id })
      )[0].id;
  liabilityAccountId = liability
    ? liability.id
    : (
        await ownerDb
          .insert(schema.accounts)
          .values({ clientId: CLIENT_ID, code: "DD-AP", name: "Dup Test AP", type: "liability", normalBalance: "credit", fsLineMapping: "current_liabilities" })
          .returning({ id: schema.accounts.id })
      )[0].id;
});

afterAll(async () => {
  await ownerConn.end();
});

describe("findPossibleDuplicateGeneralJournalEntry()", () => {
  it("returns null when nothing on the books resembles it", async () => {
    const match = await findPossibleDuplicateGeneralJournalEntry(ENCODER_A_ID, {
      clientId: CLIENT_ID,
      entryDate: "2026-03-01",
      referenceNo: "DUP-NONE",
      totalDebitCentavos: 1000n,
    });
    expect(match).toBeNull();
  });

  it("finds a match on same client + date + reference + amount, created by someone else", async () => {
    await createDraftGeneralJournal(ENCODER_A_ID, {
      clientId: CLIENT_ID,
      entryDate: "2026-03-02",
      description: "Original entry",
      referenceNo: "DUP-001",
      lines: [
        { accountCode: "DD-CASH", debitCentavos: 5000n, creditCentavos: 0n },
        { accountCode: "DD-AP", debitCentavos: 0n, creditCentavos: 5000n },
      ],
    });

    const match = await findPossibleDuplicateGeneralJournalEntry(ENCODER_B_ID, {
      clientId: CLIENT_ID,
      entryDate: "2026-03-02",
      referenceNo: "DUP-001",
      totalDebitCentavos: 5000n,
    });
    expect(match).not.toBeNull();
    expect(match?.status).toBe("draft");
    expect(match?.enteredByName).toBe(ENCODER_A_ID); // name === id in this fixture (see upsert above)
  });

  it("does NOT match when the reference number differs", async () => {
    const match = await findPossibleDuplicateGeneralJournalEntry(ENCODER_B_ID, {
      clientId: CLIENT_ID,
      entryDate: "2026-03-02",
      referenceNo: "DUP-DIFFERENT",
      totalDebitCentavos: 5000n,
    });
    expect(match).toBeNull();
  });

  it("does NOT match when the amount differs", async () => {
    const match = await findPossibleDuplicateGeneralJournalEntry(ENCODER_B_ID, {
      clientId: CLIENT_ID,
      entryDate: "2026-03-02",
      referenceNo: "DUP-001",
      totalDebitCentavos: 9999n,
    });
    expect(match).toBeNull();
  });

  it("skips the check entirely when no reference number is given, even if date+amount match", async () => {
    const match = await findPossibleDuplicateGeneralJournalEntry(ENCODER_B_ID, {
      clientId: CLIENT_ID,
      entryDate: "2026-03-02",
      referenceNo: undefined,
      totalDebitCentavos: 5000n,
    });
    expect(match).toBeNull();
  });
});
