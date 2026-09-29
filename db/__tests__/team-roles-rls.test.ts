/**
 * PR A (Team & Roles: role model + RLS) verification — every role's
 * allowed and denied actions, tested against the REAL RLS-enforcing
 * `keepbooks_app` DB role via withUserContext(), exactly like
 * acceptance.test.ts proves DB-level enforcement independent of the app
 * layer. "Direct URL access must be refused" translates at this layer to:
 * querying as a role/user who shouldn't see or touch a row must return
 * nothing / be rejected by Postgres itself, not just by a page guard —
 * every `expect(...).toHaveLength(0)` and `.rejects.toThrow()` below is
 * that proof, run the same way a bypassed page guard would hit the DB.
 *
 * Scope: sales_invoices is tested once as a representative sample of the
 * four specialized document tables (purchases, cash_receipts,
 * cash_disbursements) — all four got the identical policy pattern in
 * 009_team_roles_rls.sql (firm_admin/bookkeeper full, encoder own-linked-
 * draft-only via journal_entry_id join, reviewer/viewer read-only), so
 * this is a structural proof of the pattern, not independent behavior
 * needing its own duplicate coverage.
 *
 * Invites, the last-Owner rule, and Google-invite email matching are PR
 * B's territory (invites + team page aren't built yet in PR A) — not
 * covered here; PR B gets its own test file for those.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../schema";
import { withUserContext } from "../client";
import { listClients } from "../../lib/data/clients";

const ownerConn = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 2 });
const ownerDb = drizzle(ownerConn, { schema });

// Fixed UUIDs, idempotent setup — same pattern acceptance.test.ts uses for
// its throwaway client, so repeated `pnpm test` runs reuse fixtures rather
// than accumulating new ones.
const FIRM_ID = "00000000-0000-4000-9100-000000000001";
const CLIENT_ASSIGNED_ID = "00000000-0000-4000-9100-000000000002"; // in every assigned-scope user's grant
const CLIENT_UNASSIGNED_ID = "00000000-0000-4000-9100-000000000003"; // never assigned to anyone

const OWNER_ID = "00000000-0000-4000-9100-000000000010";
const BOOKKEEPER_ID = "00000000-0000-4000-9100-000000000011"; // access_scope 'all' — Owner/Bookkeeper are the only roles still allowed this
// REVIEWER_ID/ENCODER_A_ID/ENCODER_B_ID/VIEWER_ID: access_scope 'assigned'
// (013_role_access_scope_check.sql — Encoder/Reviewer/Viewer may never be
// 'all'), each granted BOTH clients explicitly below so their effective
// visibility is unchanged from when they were 'all' — every existing test
// that expects one of these to see/act on both clients keeps working.
const REVIEWER_ID = "00000000-0000-4000-9100-000000000012";
const ENCODER_A_ID = "00000000-0000-4000-9100-000000000013";
const ENCODER_B_ID = "00000000-0000-4000-9100-000000000014"; // — for "can't see A's drafts"
const VIEWER_ID = "00000000-0000-4000-9100-000000000015";
const ASSIGNED_ENCODER_ID = "00000000-0000-4000-9100-000000000016"; // access_scope 'assigned', granted only CLIENT_ASSIGNED_ID
const UNASSIGNED_BOOKKEEPER_ID = "00000000-0000-4000-9100-000000000017"; // access_scope 'assigned', zero grants
const ASSIGNED_BOOKKEEPER_ID = "00000000-0000-4000-9100-000000000018"; // access_scope 'assigned', granted only CLIENT_ASSIGNED_ID
const PLATFORM_ADMIN_ID = "00000000-0000-4000-9100-000000000019"; // firm_id NULL — never belongs to any firm

// A second, independent firm+client+user — proves firm isolation isn't an
// accident of only ever having tested within one firm's fixtures.
const OTHER_FIRM_ID = "00000000-0000-4000-9200-000000000001";
const OTHER_FIRM_USER_ID = "00000000-0000-4000-9200-000000000002";

let assetAccountId: string;
let liabilityAccountId: string;
let contactId: string;

async function upsertUser(id: string, email: string, role: string, accessScope: "all" | "assigned") {
  await ownerDb
    .insert(schema.users)
    .values({ id, firmId: FIRM_ID, email, name: email, role: role as any, accessScope })
    .onConflictDoUpdate({ target: schema.users.id, set: { role: role as any, accessScope } });
}

beforeAll(async () => {
  await ownerDb.insert(schema.firms).values({ id: FIRM_ID, name: "RLS Test Firm" }).onConflictDoNothing();

  for (const [id, name] of [
    [CLIENT_ASSIGNED_ID, "RLS Test Client (Assigned)"],
    [CLIENT_UNASSIGNED_ID, "RLS Test Client (Unassigned)"],
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

  await upsertUser(OWNER_ID, "rls-owner@test.local", "firm_admin", "all");
  await upsertUser(BOOKKEEPER_ID, "rls-bookkeeper@test.local", "bookkeeper", "all");
  await upsertUser(REVIEWER_ID, "rls-reviewer@test.local", "reviewer", "assigned");
  await upsertUser(ENCODER_A_ID, "rls-encoder-a@test.local", "encoder", "assigned");
  await upsertUser(ENCODER_B_ID, "rls-encoder-b@test.local", "encoder", "assigned");
  await upsertUser(VIEWER_ID, "rls-viewer@test.local", "viewer", "assigned");
  await upsertUser(ASSIGNED_ENCODER_ID, "rls-assigned-encoder@test.local", "encoder", "assigned");
  await upsertUser(UNASSIGNED_BOOKKEEPER_ID, "rls-unassigned-bookkeeper@test.local", "bookkeeper", "assigned");
  await upsertUser(ASSIGNED_BOOKKEEPER_ID, "rls-assigned-bookkeeper@test.local", "bookkeeper", "assigned");

  // firm_id NULL — mirrors how platform_admin rows actually exist (see
  // db/schema/enums.ts's userRoleEnum comment). upsertUser() always sets
  // firmId: FIRM_ID, which platform_admin must never have, so this is a
  // separate insert rather than reusing that helper.
  await ownerDb
    .insert(schema.users)
    .values({ id: PLATFORM_ADMIN_ID, firmId: null, email: "rls-platform-admin@test.local", name: "RLS Platform Admin", role: "platform_admin" })
    .onConflictDoUpdate({ target: schema.users.id, set: { role: "platform_admin", firmId: null } });

  // An independent second firm, to prove cross-firm isolation isn't an
  // accident of only ever testing within one firm's fixtures.
  await ownerDb.insert(schema.firms).values({ id: OTHER_FIRM_ID, name: "RLS Test Firm (Other)" }).onConflictDoNothing();
  await ownerDb
    .insert(schema.users)
    .values({ id: OTHER_FIRM_USER_ID, firmId: OTHER_FIRM_ID, email: "rls-other-firm-user@test.local", name: "RLS Other Firm User", role: "bookkeeper" })
    .onConflictDoUpdate({ target: schema.users.id, set: { role: "bookkeeper", firmId: OTHER_FIRM_ID } });

  await ownerDb
    .insert(schema.userClientAssignments)
    .values([
      { userId: ASSIGNED_ENCODER_ID, clientId: CLIENT_ASSIGNED_ID },
      { userId: ASSIGNED_BOOKKEEPER_ID, clientId: CLIENT_ASSIGNED_ID },
      // REVIEWER_ID/ENCODER_A_ID/ENCODER_B_ID/VIEWER_ID can no longer be
      // access_scope 'all' (013_role_access_scope_check.sql), so they're
      // granted both clients explicitly here to preserve the "sees
      // everything in the firm" behavior the rest of this file's tests
      // were written against.
      { userId: REVIEWER_ID, clientId: CLIENT_ASSIGNED_ID },
      { userId: REVIEWER_ID, clientId: CLIENT_UNASSIGNED_ID },
      { userId: ENCODER_A_ID, clientId: CLIENT_ASSIGNED_ID },
      { userId: ENCODER_A_ID, clientId: CLIENT_UNASSIGNED_ID },
      { userId: ENCODER_B_ID, clientId: CLIENT_ASSIGNED_ID },
      { userId: ENCODER_B_ID, clientId: CLIENT_UNASSIGNED_ID },
      { userId: VIEWER_ID, clientId: CLIENT_ASSIGNED_ID },
      { userId: VIEWER_ID, clientId: CLIENT_UNASSIGNED_ID },
    ])
    .onConflictDoNothing();

  const existingAccounts = await ownerDb.select().from(schema.accounts).where(eq(schema.accounts.clientId, CLIENT_ASSIGNED_ID));
  const asset = existingAccounts.find((a) => a.code === "RLS-CASH");
  const liability = existingAccounts.find((a) => a.code === "RLS-AP");
  if (asset) {
    assetAccountId = asset.id;
  } else {
    [{ id: assetAccountId }] = await ownerDb
      .insert(schema.accounts)
      .values({ clientId: CLIENT_ASSIGNED_ID, code: "RLS-CASH", name: "RLS Test Cash", type: "asset", normalBalance: "debit", fsLineMapping: "current_assets" })
      .returning({ id: schema.accounts.id });
  }
  if (liability) {
    liabilityAccountId = liability.id;
  } else {
    [{ id: liabilityAccountId }] = await ownerDb
      .insert(schema.accounts)
      .values({ clientId: CLIENT_ASSIGNED_ID, code: "RLS-AP", name: "RLS Test Payable", type: "liability", normalBalance: "credit", fsLineMapping: "current_liabilities" })
      .returning({ id: schema.accounts.id });
  }

  const existingContact = await ownerDb.select().from(schema.contacts).where(eq(schema.contacts.clientId, CLIENT_ASSIGNED_ID)).limit(1);
  if (existingContact[0]) {
    contactId = existingContact[0].id;
  } else {
    [{ id: contactId }] = await ownerDb
      .insert(schema.contacts)
      .values({ clientId: CLIENT_ASSIGNED_ID, registeredName: "RLS Test Contact", type: "supplier" })
      .returning({ id: schema.contacts.id });
  }
});

afterAll(async () => {
  await ownerConn.end();
});

/** Inserts a balanced 2-line draft journal entry as `createdBy`, via the owner connection (setup helper, not itself a permission check). */
async function seedDraftEntry(createdBy: string, clientId = CLIENT_ASSIGNED_ID) {
  const [entry] = await ownerDb
    .insert(schema.journalEntries)
    .values({ clientId, entryDate: "2026-01-15", book: "GJ", description: "RLS fixture entry", status: "draft", createdBy })
    .returning();
  await ownerDb.insert(schema.journalLines).values([
    { entryId: entry.id, lineNo: 1, accountId: assetAccountId, debitCentavos: 10000n, creditCentavos: 0n },
    { entryId: entry.id, lineNo: 2, accountId: liabilityAccountId, debitCentavos: 0n, creditCentavos: 10000n },
  ]);
  return entry.id;
}

describe("access_scope: client visibility", () => {
  it("'all' scope sees every client in the firm", async () => {
    // BOOKKEEPER_ID, not an Encoder/Reviewer/Viewer — those three can never
    // be access_scope 'all' (013_role_access_scope_check.sql), so Bookkeeper
    // is the only non-Owner role left that can actually demonstrate this.
    const ids = await withUserContext(BOOKKEEPER_ID, (tx) => tx.select({ id: schema.clients.id }).from(schema.clients));
    const idSet = new Set(ids.map((r) => r.id));
    expect(idSet.has(CLIENT_ASSIGNED_ID)).toBe(true);
    expect(idSet.has(CLIENT_UNASSIGNED_ID)).toBe(true);
  });

  it("'assigned' scope with zero assignments sees no clients at all", async () => {
    const ids = await withUserContext(UNASSIGNED_BOOKKEEPER_ID, (tx) => tx.select({ id: schema.clients.id }).from(schema.clients));
    expect(ids).toHaveLength(0);
  });

  it("'assigned' scope sees only the explicitly assigned client", async () => {
    const ids = await withUserContext(ASSIGNED_ENCODER_ID, (tx) => tx.select({ id: schema.clients.id }).from(schema.clients));
    expect(ids.map((r) => r.id)).toEqual([CLIENT_ASSIGNED_ID]);
  });

  it("Owner sees every client in the firm regardless of access_scope", async () => {
    const ids = await withUserContext(OWNER_ID, (tx) => tx.select({ id: schema.clients.id }).from(schema.clients));
    expect(ids.map((r) => r.id).sort()).toEqual([CLIENT_ASSIGNED_ID, CLIENT_UNASSIGNED_ID].sort());
  });
});

describe("clients: create/edit", () => {
  it("Bookkeeper CAN create a client (previously blocked — this is the reconciliation fix)", async () => {
    // No .returning() — same documented workaround lib/data/clients.ts's
    // createClient() already uses: INSERT ... RETURNING re-checks the
    // SELECT policy against a snapshot that doesn't yet include this
    // statement's own uncommitted insert, so Postgres reports a false
    // WITH CHECK violation even though the row genuinely qualifies.
    // Generate the id ourselves and confirm via a separate follow-up
    // SELECT instead, exactly like the real app code does.
    const newId = crypto.randomUUID();
    await withUserContext(BOOKKEEPER_ID, (tx) =>
      tx.insert(schema.clients).values({
        id: newId,
        firmId: FIRM_ID,
        registeredName: "Bookkeeper-created Co.",
        tin: "111-111-111-00000",
        rdoCode: "000",
        taxpayerType: "corporation",
        vatStatus: "vat",
        incomeTaxRegime: "rcit",
        address: "Test",
        status: "active",
      })
    );
    const [row] = await ownerDb.select().from(schema.clients).where(eq(schema.clients.id, newId));
    expect(row.registeredName).toBe("Bookkeeper-created Co.");
    await ownerDb.delete(schema.clients).where(eq(schema.clients.id, newId));
  });

  it("Reviewer CANNOT create a client", async () => {
    await expect(
      withUserContext(REVIEWER_ID, (tx) =>
        tx.insert(schema.clients).values({
          firmId: FIRM_ID,
          registeredName: "Should Not Exist Co.",
          tin: "222-222-222-00000",
          rdoCode: "000",
          taxpayerType: "corporation",
          vatStatus: "vat",
          incomeTaxRegime: "rcit",
          address: "Test",
          status: "active",
        })
      )
    ).rejects.toThrow();
  });

  it("Encoder CANNOT create a client", async () => {
    await expect(
      withUserContext(ENCODER_A_ID, (tx) =>
        tx.insert(schema.clients).values({
          firmId: FIRM_ID,
          registeredName: "Should Not Exist Co. 2",
          tin: "333-333-333-00000",
          rdoCode: "000",
          taxpayerType: "corporation",
          vatStatus: "vat",
          incomeTaxRegime: "rcit",
          address: "Test",
          status: "active",
        })
      )
    ).rejects.toThrow();
  });

  it("Viewer CANNOT edit a client", async () => {
    await expect(
      withUserContext(VIEWER_ID, (tx) =>
        tx.update(schema.clients).set({ tradeName: "Hacked" }).where(eq(schema.clients.id, CLIENT_ASSIGNED_ID))
      ).then(async () => {
        const [row] = await ownerDb.select().from(schema.clients).where(eq(schema.clients.id, CLIENT_ASSIGNED_ID));
        if (row.tradeName === "Hacked") throw new Error("viewer's UPDATE silently succeeded — RLS did not block it");
      })
    ).resolves.toBeUndefined(); // UPDATE against 0 matching rows doesn't throw — the assertion above is the real check
  });

  it("'assigned'-scope Bookkeeper CAN edit a client they're assigned to", async () => {
    await withUserContext(ASSIGNED_BOOKKEEPER_ID, (tx) =>
      tx.update(schema.clients).set({ tradeName: "Edited by assigned bookkeeper" }).where(eq(schema.clients.id, CLIENT_ASSIGNED_ID))
    );
    const [row] = await ownerDb.select().from(schema.clients).where(eq(schema.clients.id, CLIENT_ASSIGNED_ID));
    expect(row.tradeName).toBe("Edited by assigned bookkeeper");
    await ownerDb.update(schema.clients).set({ tradeName: null }).where(eq(schema.clients.id, CLIENT_ASSIGNED_ID));
  });

  it("'assigned'-scope Bookkeeper CANNOT edit a client outside their assignment — not just any bookkeeper editing any firm client", async () => {
    await withUserContext(ASSIGNED_BOOKKEEPER_ID, (tx) =>
      tx.update(schema.clients).set({ tradeName: "Should not apply" }).where(eq(schema.clients.id, CLIENT_UNASSIGNED_ID))
    );
    const [row] = await ownerDb.select().from(schema.clients).where(eq(schema.clients.id, CLIENT_UNASSIGNED_ID));
    expect(row.tradeName).not.toBe("Should not apply");
  });

  it("'all'-scope Bookkeeper CAN edit any firm client (their read scope and write scope match)", async () => {
    await withUserContext(BOOKKEEPER_ID, (tx) =>
      tx.update(schema.clients).set({ tradeName: "Edited by all-scope bookkeeper" }).where(eq(schema.clients.id, CLIENT_UNASSIGNED_ID))
    );
    const [row] = await ownerDb.select().from(schema.clients).where(eq(schema.clients.id, CLIENT_UNASSIGNED_ID));
    expect(row.tradeName).toBe("Edited by all-scope bookkeeper");
    await ownerDb.update(schema.clients).set({ tradeName: null }).where(eq(schema.clients.id, CLIENT_UNASSIGNED_ID));
  });
});

describe("clients: delete stays Owner-only", () => {
  // A fresh, dependent-free client for each test — journal_entries.client_id
  // is ON DELETE RESTRICT, so CLIENT_ASSIGNED_ID/CLIENT_UNASSIGNED_ID (both
  // carry accounts/contacts/journal entries from other tests) could never
  // actually be deleted regardless of RLS; a real DELETE test needs a
  // client nothing else references.
  async function seedDeletableClient(suffix: string): Promise<string> {
    const id = crypto.randomUUID();
    await ownerDb.insert(schema.clients).values({
      id,
      firmId: FIRM_ID,
      registeredName: `RLS Delete-Test Co. ${suffix}`,
      tin: "444-444-444-00000",
      rdoCode: "000",
      taxpayerType: "corporation",
      vatStatus: "vat",
      incomeTaxRegime: "rcit",
      address: "Test",
      status: "active",
    });
    return id;
  }

  it("Bookkeeper CANNOT delete a client, even one they can edit", async () => {
    const id = await seedDeletableClient("bookkeeper-attempt");
    await withUserContext(BOOKKEEPER_ID, (tx) => tx.delete(schema.clients).where(eq(schema.clients.id, id)));
    const [row] = await ownerDb.select().from(schema.clients).where(eq(schema.clients.id, id));
    expect(row).toBeDefined(); // still there — RLS silently matched 0 rows for the DELETE
    await ownerDb.delete(schema.clients).where(eq(schema.clients.id, id));
  });

  it("Owner (firm_admin) CAN delete a client", async () => {
    const id = await seedDeletableClient("owner-attempt");
    await withUserContext(OWNER_ID, (tx) => tx.delete(schema.clients).where(eq(schema.clients.id, id)));
    const rows = await ownerDb.select().from(schema.clients).where(eq(schema.clients.id, id));
    expect(rows).toHaveLength(0);
  });
});

describe("journal_entries: Encoder (add own drafts, edit/delete only own, can't post)", () => {
  it("CAN insert their own draft entry", async () => {
    const [entry] = await withUserContext(ENCODER_A_ID, (tx) =>
      tx
        .insert(schema.journalEntries)
        .values({ clientId: CLIENT_ASSIGNED_ID, entryDate: "2026-01-16", book: "GJ", description: "Encoder A draft", status: "draft", createdBy: ENCODER_A_ID })
        .returning()
    );
    expect(entry.status).toBe("draft");
  });

  it("CANNOT insert an entry attributed to someone else", async () => {
    await expect(
      withUserContext(ENCODER_A_ID, (tx) =>
        tx.insert(schema.journalEntries).values({
          clientId: CLIENT_ASSIGNED_ID,
          entryDate: "2026-01-16",
          book: "GJ",
          description: "Impersonation attempt",
          status: "draft",
          createdBy: ENCODER_B_ID,
        })
      )
    ).rejects.toThrow();
  });

  it("CANNOT insert a non-draft (pre-posted) entry", async () => {
    await expect(
      withUserContext(ENCODER_A_ID, (tx) =>
        tx.insert(schema.journalEntries).values({
          clientId: CLIENT_ASSIGNED_ID,
          entryDate: "2026-01-16",
          book: "GJ",
          description: "Skip-the-draft attempt",
          status: "posted",
          createdBy: ENCODER_A_ID,
        })
      )
    ).rejects.toThrow();
  });

  it("CAN see another encoder's draft on the same client — read scope was widened by 014_encoder_read_all_client_entries.sql", async () => {
    const bId = await seedDraftEntry(ENCODER_B_ID);
    const rows = await withUserContext(ENCODER_A_ID, (tx) => tx.select().from(schema.journalEntries).where(eq(schema.journalEntries.id, bId)));
    expect(rows).toHaveLength(1);
  });

  it("CAN edit and delete their own draft", async () => {
    const aId = await seedDraftEntry(ENCODER_A_ID);
    await withUserContext(ENCODER_A_ID, (tx) =>
      tx.update(schema.journalEntries).set({ description: "Edited by owner-encoder" }).where(eq(schema.journalEntries.id, aId))
    );
    const [after] = await ownerDb.select().from(schema.journalEntries).where(eq(schema.journalEntries.id, aId));
    expect(after.description).toBe("Edited by owner-encoder");

    await withUserContext(ENCODER_A_ID, (tx) => tx.delete(schema.journalEntries).where(eq(schema.journalEntries.id, aId)));
    const gone = await ownerDb.select().from(schema.journalEntries).where(eq(schema.journalEntries.id, aId));
    expect(gone).toHaveLength(0);
  });

  it("CANNOT edit another encoder's draft, even though it's a draft", async () => {
    const bId = await seedDraftEntry(ENCODER_B_ID);
    await withUserContext(ENCODER_A_ID, (tx) =>
      tx.update(schema.journalEntries).set({ description: "Should not apply" }).where(eq(schema.journalEntries.id, bId))
    );
    const [after] = await ownerDb.select().from(schema.journalEntries).where(eq(schema.journalEntries.id, bId));
    expect(after.description).not.toBe("Should not apply");
  });

  it("CANNOT delete another encoder's draft, even though it's a draft", async () => {
    const bId = await seedDraftEntry(ENCODER_B_ID);
    // UPDATE against 0 matching rows doesn't throw — same DELETE-affects-
    // zero-rows shape as the Viewer "CANNOT edit" test above, so the real
    // check is that the row is still there afterward, not that this rejects.
    await withUserContext(ENCODER_A_ID, (tx) => tx.delete(schema.journalEntries).where(eq(schema.journalEntries.id, bId)));
    const [stillThere] = await ownerDb.select().from(schema.journalEntries).where(eq(schema.journalEntries.id, bId));
    expect(stillThere).toBeDefined();
  });

  it("CANNOT post their own draft (flip status to posted)", async () => {
    const aId = await seedDraftEntry(ENCODER_A_ID);
    // USING matches (it's their own draft — selected for update), but
    // WITH CHECK rejects the proposed NEW row (status != 'draft'), so
    // Postgres raises rather than silently affecting 0 rows — that's the
    // documented distinction between USING (which row) and WITH CHECK
    // (which new values), and it's still airtight either way.
    await expect(
      withUserContext(ENCODER_A_ID, (tx) =>
        tx.update(schema.journalEntries).set({ status: "posted", postedBy: ENCODER_A_ID, postedAt: new Date() }).where(eq(schema.journalEntries.id, aId))
      )
    ).rejects.toThrow();
    const [after] = await ownerDb.select().from(schema.journalEntries).where(eq(schema.journalEntries.id, aId));
    expect(after.status).toBe("draft");
  });
});

// 014_encoder_read_all_client_entries.sql — Encoder's read scope widened
// from "only entries I created" to "every entry on a client I can
// access," matching every other role's read scope. Write access is
// unchanged (still own-draft-only, already proven above and in the
// "CANNOT edit another encoder's draft" test).
describe("journal_entries: Encoder sees ALL entries on their client, not just their own (014)", () => {
  it("CAN see another Encoder's draft (read-only — same test as above, restated under this migration's own describe block)", async () => {
    const bId = await seedDraftEntry(ENCODER_B_ID);
    const rows = await withUserContext(ENCODER_A_ID, (tx) => tx.select().from(schema.journalEntries).where(eq(schema.journalEntries.id, bId)));
    expect(rows).toHaveLength(1);
  });

  it("CAN see the Bookkeeper's draft on the same client", async () => {
    const entryId = crypto.randomUUID();
    await ownerDb.insert(schema.journalEntries).values({
      id: entryId,
      clientId: CLIENT_ASSIGNED_ID,
      entryDate: "2026-02-01",
      book: "GJ",
      description: "Bookkeeper-authored draft",
      status: "draft",
      createdBy: BOOKKEEPER_ID,
    });
    await ownerDb.insert(schema.journalLines).values([
      { entryId, lineNo: 1, accountId: assetAccountId, debitCentavos: 7500n, creditCentavos: 0n },
      { entryId, lineNo: 2, accountId: liabilityAccountId, debitCentavos: 0n, creditCentavos: 7500n },
    ]);
    const rows = await withUserContext(ENCODER_A_ID, (tx) => tx.select().from(schema.journalEntries).where(eq(schema.journalEntries.id, entryId)));
    expect(rows).toHaveLength(1);
  });

  it("CAN see a POSTED entry created by someone else — the actual duplicate-encoding risk this migration closes", async () => {
    const { postGeneralJournal } = await import("../../lib/data/post-transaction");
    const entryId = await postGeneralJournal(BOOKKEEPER_ID, {
      clientId: CLIENT_ASSIGNED_ID,
      entryDate: "2026-02-02",
      description: "Bookkeeper-posted entry",
      lines: [
        { accountCode: "RLS-CASH", debitCentavos: 3000n, creditCentavos: 0n },
        { accountCode: "RLS-AP", debitCentavos: 0n, creditCentavos: 3000n },
      ],
    });
    const rows = await withUserContext(ENCODER_A_ID, (tx) => tx.select().from(schema.journalEntries).where(eq(schema.journalEntries.id, entryId)));
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("posted");
  });

  it("Read visibility does NOT extend to write — Encoder still cannot edit a posted entry created by someone else", async () => {
    const { postGeneralJournal } = await import("../../lib/data/post-transaction");
    const entryId = await postGeneralJournal(BOOKKEEPER_ID, {
      clientId: CLIENT_ASSIGNED_ID,
      entryDate: "2026-02-03",
      description: "Bookkeeper-posted entry (immutable anyway, but proving RLS denies it first)",
      lines: [
        { accountCode: "RLS-CASH", debitCentavos: 2000n, creditCentavos: 0n },
        { accountCode: "RLS-AP", debitCentavos: 0n, creditCentavos: 2000n },
      ],
    });
    await withUserContext(ENCODER_A_ID, (tx) =>
      tx.update(schema.journalEntries).set({ description: "Should not apply" }).where(eq(schema.journalEntries.id, entryId))
    );
    const [after] = await ownerDb.select().from(schema.journalEntries).where(eq(schema.journalEntries.id, entryId));
    expect(after.description).not.toBe("Should not apply");
  });
});

describe("journal_entries: Reviewer (post/approve only, cannot add or edit)", () => {
  it("CANNOT insert a new entry", async () => {
    await expect(
      withUserContext(REVIEWER_ID, (tx) =>
        tx.insert(schema.journalEntries).values({
          clientId: CLIENT_ASSIGNED_ID,
          entryDate: "2026-01-17",
          book: "GJ",
          description: "Reviewer attempting to add",
          status: "draft",
          createdBy: REVIEWER_ID,
        })
      )
    ).rejects.toThrow();
  });

  it("CAN post an existing draft (status-only transition)", async () => {
    const entryId = await seedDraftEntry(BOOKKEEPER_ID);
    await withUserContext(REVIEWER_ID, (tx) =>
      tx.update(schema.journalEntries).set({ status: "posted", postedBy: REVIEWER_ID, postedAt: new Date() }).where(eq(schema.journalEntries.id, entryId))
    );
    const [after] = await ownerDb.select().from(schema.journalEntries).where(eq(schema.journalEntries.id, entryId));
    expect(after.status).toBe("posted");
    expect(after.postedBy).toBe(REVIEWER_ID);
  });

  it("CANNOT edit a draft's other fields (no status change alongside)", async () => {
    const entryId = await seedDraftEntry(BOOKKEEPER_ID);
    await expect(
      withUserContext(REVIEWER_ID, (tx) => tx.update(schema.journalEntries).set({ description: "Reviewer edit attempt" }).where(eq(schema.journalEntries.id, entryId)))
    ).rejects.toThrow(); // enforce_reviewer_status_only_update() trigger raises
  });

  it("CANNOT sneak a description change in alongside a legitimate status change", async () => {
    const entryId = await seedDraftEntry(BOOKKEEPER_ID);
    await expect(
      withUserContext(REVIEWER_ID, (tx) =>
        tx
          .update(schema.journalEntries)
          .set({ status: "posted", postedBy: REVIEWER_ID, postedAt: new Date(), description: "Sneaked in" })
          .where(eq(schema.journalEntries.id, entryId))
      )
    ).rejects.toThrow();
  });

  it("CANNOT delete a draft", async () => {
    // No journal_entries_delete branch names 'reviewer' at all, so this
    // affects 0 rows rather than throwing — same shape as Viewer's
    // "CANNOT edit" test below.
    const entryId = await seedDraftEntry(BOOKKEEPER_ID);
    await withUserContext(REVIEWER_ID, (tx) => tx.delete(schema.journalEntries).where(eq(schema.journalEntries.id, entryId)));
    const [stillThere] = await ownerDb.select().from(schema.journalEntries).where(eq(schema.journalEntries.id, entryId));
    expect(stillThere).toBeDefined();
  });
});

describe("journal_entries: Viewer (read-only)", () => {
  it("CAN select", async () => {
    const rows = await withUserContext(VIEWER_ID, (tx) => tx.select().from(schema.journalEntries).where(eq(schema.journalEntries.clientId, CLIENT_ASSIGNED_ID)));
    expect(rows.length).toBeGreaterThan(0);
  });

  it("CANNOT insert", async () => {
    await expect(
      withUserContext(VIEWER_ID, (tx) =>
        tx.insert(schema.journalEntries).values({ clientId: CLIENT_ASSIGNED_ID, entryDate: "2026-01-18", book: "GJ", description: "Viewer attempt", status: "draft", createdBy: VIEWER_ID })
      )
    ).rejects.toThrow();
  });

  it("CANNOT update", async () => {
    const entryId = await seedDraftEntry(BOOKKEEPER_ID);
    await withUserContext(VIEWER_ID, (tx) => tx.update(schema.journalEntries).set({ description: "Viewer edit" }).where(eq(schema.journalEntries.id, entryId)));
    const [after] = await ownerDb.select().from(schema.journalEntries).where(eq(schema.journalEntries.id, entryId));
    expect(after.description).not.toBe("Viewer edit");
  });

  it("CANNOT delete a draft", async () => {
    const entryId = await seedDraftEntry(BOOKKEEPER_ID);
    await withUserContext(VIEWER_ID, (tx) => tx.delete(schema.journalEntries).where(eq(schema.journalEntries.id, entryId)));
    const [stillThere] = await ownerDb.select().from(schema.journalEntries).where(eq(schema.journalEntries.id, entryId));
    expect(stillThere).toBeDefined();
  });
});

describe("journal_entries: Bookkeeper (unchanged — full add/edit/post)", () => {
  it("CAN insert, edit, and post an entry", async () => {
    // Not .returning() — see the "Bookkeeper CAN create a client" test's
    // comment; same false-positive on a self-referential RETURNING check.
    const entryId = crypto.randomUUID();
    await withUserContext(BOOKKEEPER_ID, (tx) =>
      tx
        .insert(schema.journalEntries)
        .values({ id: entryId, clientId: CLIENT_ASSIGNED_ID, entryDate: "2026-01-19", book: "GJ", description: "Bookkeeper entry", status: "draft", createdBy: BOOKKEEPER_ID })
    );
    await withUserContext(BOOKKEEPER_ID, (tx) =>
      tx.insert(schema.journalLines).values([
        { entryId, lineNo: 1, accountId: assetAccountId, debitCentavos: 5000n, creditCentavos: 0n },
        { entryId, lineNo: 2, accountId: liabilityAccountId, debitCentavos: 0n, creditCentavos: 5000n },
      ])
    );
    await withUserContext(BOOKKEEPER_ID, (tx) => tx.update(schema.journalEntries).set({ description: "Edited" }).where(eq(schema.journalEntries.id, entryId)));
    await withUserContext(BOOKKEEPER_ID, (tx) =>
      tx.update(schema.journalEntries).set({ status: "posted", postedBy: BOOKKEEPER_ID, postedAt: new Date() }).where(eq(schema.journalEntries.id, entryId))
    );
    const [after] = await ownerDb.select().from(schema.journalEntries).where(eq(schema.journalEntries.id, entryId));
    expect(after.description).toBe("Edited");
    expect(after.status).toBe("posted");
  });
});

// The entry detail page's Edit/Delete buttons are the first UI to let
// firm_admin/bookkeeper touch a draft they didn't create themselves — every
// prior edit/delete test above (Encoder, Bookkeeper) only ever proved a
// role managing its OWN entry. journal_entries_update/_delete's USING
// clauses put no created_by condition on firm_admin/bookkeeper at all
// (009_team_roles_rls.sql), so this should already work; this closes the
// gap in what's actually been proven, not a gap in what's enforced.
describe("journal_entries: Owner/Bookkeeper CAN edit and delete an Encoder's draft (not just their own)", () => {
  it("Owner (firm_admin) CAN edit an Encoder's draft", async () => {
    const aId = await seedDraftEntry(ENCODER_A_ID);
    await withUserContext(OWNER_ID, (tx) =>
      tx.update(schema.journalEntries).set({ description: "Edited by Owner" }).where(eq(schema.journalEntries.id, aId))
    );
    const [after] = await ownerDb.select().from(schema.journalEntries).where(eq(schema.journalEntries.id, aId));
    expect(after.description).toBe("Edited by Owner");
  });

  it("Owner (firm_admin) CAN delete an Encoder's draft", async () => {
    const aId = await seedDraftEntry(ENCODER_A_ID);
    await withUserContext(OWNER_ID, (tx) => tx.delete(schema.journalEntries).where(eq(schema.journalEntries.id, aId)));
    const gone = await ownerDb.select().from(schema.journalEntries).where(eq(schema.journalEntries.id, aId));
    expect(gone).toHaveLength(0);
  });

  it("Bookkeeper CAN edit an Encoder's draft", async () => {
    const aId = await seedDraftEntry(ENCODER_A_ID);
    await withUserContext(BOOKKEEPER_ID, (tx) =>
      tx.update(schema.journalEntries).set({ description: "Edited by Bookkeeper" }).where(eq(schema.journalEntries.id, aId))
    );
    const [after] = await ownerDb.select().from(schema.journalEntries).where(eq(schema.journalEntries.id, aId));
    expect(after.description).toBe("Edited by Bookkeeper");
  });

  it("Bookkeeper CAN delete an Encoder's draft", async () => {
    const aId = await seedDraftEntry(ENCODER_A_ID);
    await withUserContext(BOOKKEEPER_ID, (tx) => tx.delete(schema.journalEntries).where(eq(schema.journalEntries.id, aId)));
    const gone = await ownerDb.select().from(schema.journalEntries).where(eq(schema.journalEntries.id, aId));
    expect(gone).toHaveLength(0);
  });
});

describe("sales_invoices: representative sample of the 4 document tables", () => {
  it("Encoder CAN see a sales invoice linked to another encoder's draft (read scope widened by 013)", async () => {
    const entryId = await seedDraftEntry(ENCODER_B_ID);
    const [invoice] = await ownerDb
      .insert(schema.salesInvoices)
      .values({
        clientId: CLIENT_ASSIGNED_ID,
        contactId,
        invoiceNo: "RLS-INV-1",
        invoiceDate: "2026-01-20",
        totalCentavos: 10000n,
        journalEntryId: entryId,
      })
      .returning();
    const rows = await withUserContext(ENCODER_A_ID, (tx) => tx.select().from(schema.salesInvoices).where(eq(schema.salesInvoices.id, invoice.id)));
    expect(rows).toHaveLength(1);
  });

  it("Viewer CAN select but CANNOT insert", async () => {
    const rows = await withUserContext(VIEWER_ID, (tx) => tx.select().from(schema.salesInvoices).where(eq(schema.salesInvoices.clientId, CLIENT_ASSIGNED_ID)));
    expect(rows.length).toBeGreaterThan(0);

    await expect(
      withUserContext(VIEWER_ID, (tx) =>
        tx.insert(schema.salesInvoices).values({ clientId: CLIENT_ASSIGNED_ID, contactId, invoiceNo: "RLS-INV-2", invoiceDate: "2026-01-20", totalCentavos: 5000n })
      )
    ).rejects.toThrow();
  });
});

describe("accounts/contacts: structural edits (Owner+Bookkeeper only)", () => {
  it("Reviewer CANNOT create an account", async () => {
    await expect(
      withUserContext(REVIEWER_ID, (tx) =>
        tx
          .insert(schema.accounts)
          .values({ clientId: CLIENT_ASSIGNED_ID, code: "RLS-BLOCKED", name: "Blocked", type: "asset", normalBalance: "debit", fsLineMapping: "current_assets" })
      )
    ).rejects.toThrow();
  });

  it("Encoder CANNOT create a contact", async () => {
    await expect(
      withUserContext(ENCODER_A_ID, (tx) => tx.insert(schema.contacts).values({ clientId: CLIENT_ASSIGNED_ID, registeredName: "Blocked Contact", type: "supplier" }))
    ).rejects.toThrow();
  });
});

// 010_bookkeeper_add_encoder_rls.sql — a Bookkeeper adding a team member
// through the app (see lib/auth/create-team-member.ts). These insert
// directly as the RLS-enforcing role, bypassing the app layer entirely —
// proving the restriction is real even if a bug ever let the wrong role
// or clientIds reach the insert.
describe("team invites: Bookkeeper can only add Encoders, scoped to their own clients", () => {
  async function cleanupUser(id: string) {
    await ownerDb.delete(schema.userClientAssignments).where(eq(schema.userClientAssignments.userId, id));
    await ownerDb.delete(schema.users).where(eq(schema.users.id, id));
  }

  it("Bookkeeper CAN insert a new Encoder in their own firm", async () => {
    const id = crypto.randomUUID();
    await withUserContext(BOOKKEEPER_ID, (tx) =>
      tx.insert(schema.users).values({ id, firmId: FIRM_ID, email: `rls-new-encoder-${id}@test.local`, name: "New Encoder", role: "encoder", accessScope: "assigned" })
    );
    const [row] = await ownerDb.select().from(schema.users).where(eq(schema.users.id, id));
    expect(row).toBeDefined();
    expect(row.role).toBe("encoder");
    await cleanupUser(id);
  });

  it("Bookkeeper CANNOT insert a new Bookkeeper, Reviewer, Viewer, or Owner", async () => {
    for (const role of ["bookkeeper", "reviewer", "viewer", "firm_admin"] as const) {
      const id = crypto.randomUUID();
      await expect(
        withUserContext(BOOKKEEPER_ID, (tx) =>
          tx.insert(schema.users).values({ id, firmId: FIRM_ID, email: `rls-blocked-${id}@test.local`, name: "Blocked", role, accessScope: "all" })
        )
      ).rejects.toThrow();
    }
  });

  it("Owner CAN insert a new member of any role (e.g. Viewer)", async () => {
    const id = crypto.randomUUID();
    // accessScope: "assigned", not "all" — Viewer may never be 'all'
    // (013_role_access_scope_check.sql's CHECK constraint), unrelated to
    // what this test actually proves (Owner can insert any role at all).
    await withUserContext(OWNER_ID, (tx) =>
      tx.insert(schema.users).values({ id, firmId: FIRM_ID, email: `rls-owner-added-viewer-${id}@test.local`, name: "Owner-added Viewer", role: "viewer", accessScope: "assigned" })
    );
    const [row] = await ownerDb.select().from(schema.users).where(eq(schema.users.id, id));
    expect(row).toBeDefined();
    await cleanupUser(id);
  });

  it("'assigned'-scope Bookkeeper CAN assign their new Encoder to a client they themselves can access", async () => {
    const id = crypto.randomUUID();
    await ownerDb.insert(schema.users).values({ id, firmId: FIRM_ID, email: `rls-scoped-encoder-${id}@test.local`, name: "Scoped Encoder", role: "encoder", accessScope: "assigned" });
    await withUserContext(ASSIGNED_BOOKKEEPER_ID, (tx) => tx.insert(schema.userClientAssignments).values({ userId: id, clientId: CLIENT_ASSIGNED_ID }));
    const rows = await ownerDb.select().from(schema.userClientAssignments).where(eq(schema.userClientAssignments.userId, id));
    expect(rows).toHaveLength(1);
    await cleanupUser(id);
  });

  it("'assigned'-scope Bookkeeper CANNOT assign their new Encoder to a client outside their own access", async () => {
    const id = crypto.randomUUID();
    await ownerDb.insert(schema.users).values({ id, firmId: FIRM_ID, email: `rls-scoped-encoder-2-${id}@test.local`, name: "Scoped Encoder 2", role: "encoder", accessScope: "assigned" });
    await expect(
      withUserContext(ASSIGNED_BOOKKEEPER_ID, (tx) => tx.insert(schema.userClientAssignments).values({ userId: id, clientId: CLIENT_UNASSIGNED_ID }))
    ).rejects.toThrow();
    await cleanupUser(id);
  });

  it("Bookkeeper CANNOT assign a client to a non-Encoder user, even one they can otherwise access", async () => {
    await expect(
      withUserContext(BOOKKEEPER_ID, (tx) => tx.insert(schema.userClientAssignments).values({ userId: REVIEWER_ID, clientId: CLIENT_ASSIGNED_ID }))
    ).rejects.toThrow();
  });
});

// The /settings/team page's roster and "assign to clients" picker both
// read straight off RLS (listTeamMembers / listClients, both plain
// withUserContext() selects) — this proves the boundaries THAT page
// depends on hold at the database level, not just because the UI happens
// not to render the wrong rows.
describe("users: visibility boundaries (platform_admin and cross-firm isolation)", () => {
  const FIRM_MEMBER_IDS = [OWNER_ID, BOOKKEEPER_ID, REVIEWER_ID, ENCODER_A_ID, VIEWER_ID];

  it("No firm user (Owner, Bookkeeper, Reviewer, Encoder, Viewer) can see a platform_admin row", async () => {
    for (const id of FIRM_MEMBER_IDS) {
      const rows = await withUserContext(id, (tx) => tx.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, PLATFORM_ADMIN_ID)));
      expect(rows).toHaveLength(0);
    }
  });

  it("Nobody's full users listing (what the Team page's roster queries) includes a platform_admin row", async () => {
    for (const id of FIRM_MEMBER_IDS) {
      const rows = await withUserContext(id, (tx) => tx.select({ id: schema.users.id }).from(schema.users));
      expect(rows.map((r) => r.id)).not.toContain(PLATFORM_ADMIN_ID);
    }
  });

  it("No firm user can see a user row belonging to a different firm", async () => {
    for (const id of FIRM_MEMBER_IDS) {
      const rows = await withUserContext(id, (tx) => tx.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, OTHER_FIRM_USER_ID)));
      expect(rows).toHaveLength(0);
    }
  });

  it("A Bookkeeper's client picker (listClients — what /settings/team's 'assign to clients' list uses) only shows clients they're assigned to", async () => {
    const rows = await listClients(ASSIGNED_BOOKKEEPER_ID);
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(CLIENT_ASSIGNED_ID);
    expect(ids).not.toContain(CLIENT_UNASSIGNED_ID);
  });

  it("An 'assigned'-scope Bookkeeper with zero assignments sees no clients in their picker at all", async () => {
    const rows = await listClients(UNASSIGNED_BOOKKEEPER_ID);
    expect(rows).toHaveLength(0);
  });
});
