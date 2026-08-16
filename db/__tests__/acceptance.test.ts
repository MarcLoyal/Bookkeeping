/**
 * Spec §9 acceptance tests for Phase 0/1 (tests 7, 8, 11 are tax-engine/AI
 * extraction — Phase 2/3, deferred; not applicable yet).
 *
 * These hit a REAL local Postgres (via .env.local) — the seeded demo data
 * for #2/#3, and a raw owner-role connection to prove DB-level enforcement
 * independent of the app layer for #1/#4/#5/#6. Requires `pnpm db:migrate`
 * and `pnpm seed` to have been run first (see README).
 *
 * A dedicated throwaway client ("Acceptance Test Co.") is created for the
 * immutability/reversal and period-lock tests so they never show up in the
 * two demo clients' books. Its posted journal entries are, by design,
 * immutable and therefore NOT deleted in afterAll — that's the DB-level
 * immutability guarantee itself, not test pollution left by accident.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
import { and, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../schema";
import { listAccounts } from "@/lib/data/accounts";
import { listPostedLinesForReport } from "@/lib/data/journal";
import {
  PeriodLockedError,
  postGeneralJournal,
  reverseJournalEntry,
} from "@/lib/data/post-transaction";
import { buildBalanceSheet, buildIncomeStatement, buildTrialBalance } from "@/lib/accounting/reports";
import { PH_SME_CHART_OF_ACCOUNTS } from "@/lib/accounting/coa-template";

// Owner-role connection, scoped to this test file only, for fixture setup and
// for proving DB triggers fire independent of the app layer. db/authClient.ts
// is reserved for the login credential lookup — never reused here.
const ownerConn = postgres(process.env.MIGRATION_DATABASE_URL!, { max: 2 });
const ownerDb = drizzle(ownerConn, { schema });

let firmId: string;
let tradingCorpId: string; // Client A — VAT, seeded, ~120+ real transactions
let servicesId: string; // Client B — Non-VAT, seeded
let adminUserId: string;

let testClientId: string; // "Acceptance Test Co." — throwaway, for #1/#4/#5
let testAccounts: Record<string, string>; // code -> account id

beforeAll(async () => {
  const [firm] = await ownerDb
    .select()
    .from(schema.firms)
    .where(eq(schema.firms.name, "Keep.Books Demo Firm"))
    .limit(1);
  if (!firm) throw new Error("Seed data not found — run `pnpm db:migrate && pnpm seed` first.");
  firmId = firm.id;

  const clients = await ownerDb.select().from(schema.clients).where(eq(schema.clients.firmId, firmId));
  tradingCorpId = clients.find((c) => c.registeredName.includes("Trading"))!.id;
  servicesId = clients.find((c) => c.registeredName.includes("Services"))!.id;

  const [admin] = await ownerDb
    .select()
    .from(schema.users)
    .where(and(eq(schema.users.firmId, firmId), eq(schema.users.role, "firm_admin")))
    .limit(1);
  adminUserId = admin.id;

  // Throwaway client for tests that mutate/lock (never touches demo data).
  // Fixed id + idempotent creation so repeated `pnpm test` runs reuse the
  // same fixture instead of accumulating a fresh "Acceptance Test Co." (and
  // its posted, permanently-immutable journal entries — see afterAll) every
  // single run.
  const FIXED_TEST_CLIENT_ID = "00000000-0000-4000-8000-000000000001";
  const [existing] = await ownerDb.select().from(schema.clients).where(eq(schema.clients.id, FIXED_TEST_CLIENT_ID)).limit(1);
  testClientId = FIXED_TEST_CLIENT_ID;
  testAccounts = {};

  if (existing) {
    const rows = await ownerDb.select().from(schema.accounts).where(eq(schema.accounts.clientId, testClientId));
    for (const r of rows) testAccounts[r.code] = r.id;
  } else {
    await ownerDb.insert(schema.clients).values({
      id: testClientId,
      firmId,
      registeredName: "Acceptance Test Co.",
      tin: "000-000-000-00000",
      rdoCode: "000",
      taxpayerType: "corporation",
      vatStatus: "vat",
      incomeTaxRegime: "rcit",
      address: "N/A — test fixture",
    });
    for (const a of PH_SME_CHART_OF_ACCOUNTS) {
      const id = crypto.randomUUID();
      await ownerDb.insert(schema.accounts).values({
        id,
        clientId: testClientId,
        code: a.code,
        name: a.name,
        type: a.type,
        normalBalance: a.normalBalance,
        fsLineMapping: a.fsLineMapping,
      });
      testAccounts[a.code] = id;
    }
  }
}, 30000);

afterAll(async () => {
  await ownerConn.end();
});

describe("acceptance #1: a journal entry with unequal debits and credits is rejected by the database", () => {
  it("rejects at the DB trigger, bypassing the app layer entirely", async () => {
    const entryId = crypto.randomUUID();
    await ownerDb.insert(schema.journalEntries).values({
      id: entryId,
      clientId: testClientId,
      entryDate: "2025-01-15",
      book: "GJ",
      description: "Deliberately unbalanced (acceptance test #1)",
      status: "draft",
      createdBy: adminUserId,
    });
    await ownerDb.insert(schema.journalLines).values([
      { entryId, lineNo: 1, accountId: testAccounts["1010"], debitCentavos: 10000n, creditCentavos: 0n },
      { entryId, lineNo: 2, accountId: testAccounts["3010"], debitCentavos: 0n, creditCentavos: 9000n },
    ]);

    await expect(
      ownerDb
        .update(schema.journalEntries)
        .set({ status: "posted", entryNo: 999001, postedBy: adminUserId, postedAt: new Date() })
        .where(eq(schema.journalEntries.id, entryId))
    ).rejects.toThrow(/out of balance/i);
  });
});

describe("acceptance #2: Trial Balance debits equal credits for a seeded dataset of ≥100 transactions", () => {
  it("balances against the real seeded Demo Trading Corp. ledger", async () => {
    const [{ count }] = await ownerDb
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.journalEntries)
      .where(
        and(
          eq(schema.journalEntries.clientId, tradingCorpId),
          inArray(schema.journalEntries.status, ["posted", "reversed"])
        )
      );
    expect(count).toBeGreaterThanOrEqual(100);

    const accounts = await listAccounts(adminUserId, tradingCorpId);
    const lines = await listPostedLinesForReport(adminUserId, tradingCorpId);
    const tb = buildTrialBalance(accounts, lines);

    expect(tb.isBalanced).toBe(true);
    expect(tb.totalDebitCentavos).toBe(tb.totalCreditCentavos);
    expect(tb.totalDebitCentavos).toBeGreaterThan(0n);
  });
});

describe("acceptance #3: Balance Sheet balances (Assets = Liabilities + Equity) and net income ties to the Income Statement", () => {
  it("holds for the real seeded Demo Services (Sole Prop) ledger", async () => {
    const accounts = await listAccounts(adminUserId, servicesId);
    const lines = await listPostedLinesForReport(adminUserId, servicesId);
    const tb = buildTrialBalance(accounts, lines);
    const is = buildIncomeStatement(tb);
    const bs = buildBalanceSheet(tb, is);

    expect(bs.isBalanced).toBe(true);
    expect(bs.totalAssetsCentavos).toBe(bs.totalLiabilitiesCentavos + bs.totalEquityCentavos);
    expect(bs.netIncomeCentavos).toBe(is.netIncomeCentavos);
  });
});

describe("acceptance #4: a posted entry cannot be updated or deleted through any code path; reversal produces a correctly linked mirror entry", () => {
  it("blocks direct UPDATE/DELETE at the DB level and links the reversal correctly", async () => {
    const entryId = await postGeneralJournal(adminUserId, {
      clientId: testClientId,
      entryDate: "2025-02-01",
      description: "Acceptance test #4 fixture entry",
      lines: [
        { accountCode: "1010", debitCentavos: 50000n, creditCentavos: 0n },
        { accountCode: "3010", debitCentavos: 0n, creditCentavos: 50000n },
      ],
    });

    // Direct DB-level mutation attempts, bypassing the app layer entirely.
    await expect(
      ownerDb
        .update(schema.journalEntries)
        .set({ description: "tampered" })
        .where(eq(schema.journalEntries.id, entryId))
    ).rejects.toThrow(/immutable/i);

    await expect(
      ownerDb.delete(schema.journalEntries).where(eq(schema.journalEntries.id, entryId))
    ).rejects.toThrow(/immutable|reversing entry/i);

    const [firstLine] = await ownerDb
      .select()
      .from(schema.journalLines)
      .where(eq(schema.journalLines.entryId, entryId))
      .limit(1);
    await expect(
      ownerDb.delete(schema.journalLines).where(eq(schema.journalLines.id, firstLine.id))
    ).rejects.toThrow(/immutable/i);

    // Reversal path: the ONLY sanctioned way to correct a posted entry.
    const reversalId = await reverseJournalEntry(adminUserId, testClientId, entryId, "2025-02-02", "acceptance test #4");

    const [original] = await ownerDb.select().from(schema.journalEntries).where(eq(schema.journalEntries.id, entryId));
    expect(original.status).toBe("reversed");

    const [reversal] = await ownerDb.select().from(schema.journalEntries).where(eq(schema.journalEntries.id, reversalId));
    expect(reversal.reversalOfEntryId).toBe(entryId);
    expect(reversal.status).toBe("posted");

    const originalLines = await ownerDb.select().from(schema.journalLines).where(eq(schema.journalLines.entryId, entryId));
    const reversalLines = await ownerDb.select().from(schema.journalLines).where(eq(schema.journalLines.entryId, reversalId));
    const byAccount = new Map(originalLines.map((l) => [l.accountId, l]));
    for (const rl of reversalLines) {
      const ol = byAccount.get(rl.accountId)!;
      expect(rl.debitCentavos).toBe(ol.creditCentavos);
      expect(rl.creditCentavos).toBe(ol.debitCentavos);
    }
  });
});

describe("acceptance #5: posting into a locked period is rejected", () => {
  it("rejects a post dated inside a locked period, both through the app and at the DB level", async () => {
    await ownerDb.insert(schema.periodLocks).values({
      clientId: testClientId,
      periodStart: "2025-03-01",
      periodEnd: "2025-03-31",
      lockedBy: adminUserId,
    });

    await expect(
      postGeneralJournal(adminUserId, {
        clientId: testClientId,
        entryDate: "2025-03-15",
        description: "Should be rejected — period is locked",
        lines: [
          { accountCode: "1010", debitCentavos: 1000n, creditCentavos: 0n },
          { accountCode: "3010", debitCentavos: 0n, creditCentavos: 1000n },
        ],
      })
    ).rejects.toThrow(PeriodLockedError);

    // Prove the DB trigger itself rejects it too, independent of the app's
    // pre-check (defense in depth — see enforce_period_lock() in 001_functions_triggers_rls.sql).
    const entryId = crypto.randomUUID();
    await ownerDb.insert(schema.journalEntries).values({
      id: entryId,
      clientId: testClientId,
      entryDate: "2025-03-20",
      book: "GJ",
      description: "Direct-SQL attempt inside locked period",
      status: "draft",
      createdBy: adminUserId,
    });
    await ownerDb.insert(schema.journalLines).values([
      { entryId, lineNo: 1, accountId: testAccounts["1010"], debitCentavos: 1000n, creditCentavos: 0n },
      { entryId, lineNo: 2, accountId: testAccounts["3010"], debitCentavos: 0n, creditCentavos: 1000n },
    ]);
    await expect(
      ownerDb
        .update(schema.journalEntries)
        .set({ status: "posted", entryNo: 999002, postedBy: adminUserId, postedAt: new Date() })
        .where(eq(schema.journalEntries.id, entryId))
    ).rejects.toThrow(/period is locked/i);
  });
});

describe("acceptance #6: Client A's user receives zero rows when querying Client B's journal lines", () => {
  it("RLS isolates a client_user scoped to Demo Trading Corp. from Demo Services' data", async () => {
    const clientAUserId = crypto.randomUUID();
    await ownerDb.insert(schema.users).values({
      id: clientAUserId,
      firmId,
      clientId: tradingCorpId,
      email: `acceptance-test-client-a-${clientAUserId}@example.invalid`,
      name: "Acceptance Test — Client A User",
      role: "client_user",
      passwordHash: "not-a-real-hash",
    });

    try {
      const rowsForOwnClient = await listPostedLinesForReport(clientAUserId, tradingCorpId);
      expect(rowsForOwnClient.length).toBeGreaterThan(0);

      const rowsForOtherClient = await listPostedLinesForReport(clientAUserId, servicesId);
      expect(rowsForOtherClient.length).toBe(0);
    } finally {
      await ownerDb.delete(schema.users).where(eq(schema.users.id, clientAUserId));
    }
  });
});

describe("acceptance #9: VAT is computed from tax_rules — never a hardcoded decimal literal", () => {
  it("finds zero hits for 0.12 / 12% / 1.12 in application source (db/seed.ts's tax_rules INSERT and test-file comments are the sanctioned exceptions — see DECISIONS.md)", async () => {
    const { execSync } = await import("node:child_process");
    const root = new URL("../..", import.meta.url).pathname;
    let output = "";
    try {
      output = execSync(
        String.raw`grep -rnE "0\.12|12%|1\.12" app lib db middleware.ts --include="*.ts" --include="*.tsx" --include="*.sql"`,
        { cwd: root, encoding: "utf8" }
      );
    } catch (err: any) {
      // grep exits 1 when it finds nothing — that's the success case here.
      if (err.status === 1) {
        output = "";
      } else {
        throw err;
      }
    }
    const offendingLines = output
      .split("\n")
      .filter((line) => line.length > 0)
      .filter((line) => !line.startsWith("db/seed.ts:")) // the sanctioned tax_rules data literal
      .filter((line) => !/__tests__|\.test\.ts:/.test(line)); // illustrative comments in tests

    expect(offendingLines).toEqual([]);
  });
});
