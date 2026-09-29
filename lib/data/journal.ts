import "server-only";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { withUserContext } from "@/db/client";
import { accounts, contacts, journalEntries, journalLines, users } from "@/db/schema";
import type { PostedLine } from "@/lib/accounting/reports";

export type EntryLine = {
  id: string;
  lineNo: number;
  accountId: string;
  accountCode: string | null;
  accountName: string | null;
  debitCentavos: bigint;
  creditCentavos: bigint;
  memo: string | null;
  contactId: string | null;
  contactName: string | null;
};

export type EntryWithLines = {
  id: string;
  entryNo: number | null;
  entryDate: string;
  book: "GJ" | "CRB" | "CDB" | "SJ" | "PJ";
  referenceNo: string | null;
  description: string;
  status: "draft" | "posted" | "reversed";
  reversalOfEntryId: string | null;
  postedAt: Date | null;
  createdBy: string | null;
  enteredByName: string | null;
  lines: EntryLine[];
};

export async function listJournalEntries(
  userId: string,
  clientId: string,
  opts?: {
    book?: "GJ" | "CRB" | "CDB" | "SJ" | "PJ";
    dateFrom?: string;
    dateTo?: string;
    statusIn?: ("draft" | "posted" | "reversed")[];
    accountCode?: string;
  }
): Promise<EntryWithLines[]> {
  return withUserContext(userId, async (tx) => {
    const conditions = [eq(journalEntries.clientId, clientId)];
    if (opts?.book) conditions.push(eq(journalEntries.book, opts.book));
    if (opts?.dateFrom) conditions.push(gte(journalEntries.entryDate, opts.dateFrom));
    if (opts?.dateTo) conditions.push(lte(journalEntries.entryDate, opts.dateTo));
    if (opts?.statusIn) conditions.push(inArray(journalEntries.status, opts.statusIn));

    if (opts?.accountCode) {
      const matches = await tx
        .selectDistinct({ entryId: journalLines.entryId })
        .from(journalLines)
        .innerJoin(accounts, eq(journalLines.accountId, accounts.id))
        .where(and(eq(accounts.clientId, clientId), eq(accounts.code, opts.accountCode)));
      const ids = matches.map((m) => m.entryId);
      if (ids.length === 0) return [];
      conditions.push(inArray(journalEntries.id, ids));
    }

    const entries = await tx
      .select()
      .from(journalEntries)
      .where(and(...conditions))
      .orderBy(asc(journalEntries.entryDate), asc(journalEntries.entryNo));

    if (entries.length === 0) return [];

    const entryIds = entries.map((e) => e.id);
    const creatorIds = [...new Set(entries.map((e) => e.createdBy).filter((id): id is string => !!id))];
    const creatorNames =
      creatorIds.length > 0
        ? await tx.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, creatorIds))
        : [];
    const creatorNameById = new Map(creatorNames.map((u) => [u.id, u.name]));

    const lineRows = await tx
      .select({
        line: journalLines,
        accountCode: accounts.code,
        accountName: accounts.name,
        contactName: contacts.registeredName,
      })
      .from(journalLines)
      .leftJoin(accounts, eq(journalLines.accountId, accounts.id))
      .leftJoin(contacts, eq(journalLines.contactId, contacts.id))
      .where(inArray(journalLines.entryId, entryIds))
      .orderBy(asc(journalLines.lineNo));

    const linesByEntry = new Map<string, EntryLine[]>();
    for (const row of lineRows) {
      const list = linesByEntry.get(row.line.entryId) ?? [];
      list.push({
        id: row.line.id,
        lineNo: row.line.lineNo,
        accountId: row.line.accountId,
        accountCode: row.accountCode,
        accountName: row.accountName,
        debitCentavos: row.line.debitCentavos,
        creditCentavos: row.line.creditCentavos,
        memo: row.line.memo,
        contactId: row.line.contactId,
        contactName: row.contactName,
      });
      linesByEntry.set(row.line.entryId, list);
    }

    return entries.map((e) => ({
      id: e.id,
      entryNo: e.entryNo,
      entryDate: e.entryDate,
      book: e.book,
      referenceNo: e.referenceNo,
      description: e.description,
      status: e.status,
      reversalOfEntryId: e.reversalOfEntryId,
      postedAt: e.postedAt,
      createdBy: e.createdBy,
      enteredByName: e.createdBy ? (creatorNameById.get(e.createdBy) ?? null) : null,
      lines: linesByEntry.get(e.id) ?? [],
    }));
  });
}

export async function getJournalEntry(userId: string, clientId: string, entryId: string): Promise<EntryWithLines | null> {
  return withUserContext(userId, async (tx) => {
    const [entry] = await tx
      .select()
      .from(journalEntries)
      .where(and(eq(journalEntries.id, entryId), eq(journalEntries.clientId, clientId)))
      .limit(1);
    if (!entry) return null;

    const [creator] = entry.createdBy ? await tx.select({ name: users.name }).from(users).where(eq(users.id, entry.createdBy)).limit(1) : [];

    const lineRows = await tx
      .select({
        line: journalLines,
        accountCode: accounts.code,
        accountName: accounts.name,
        contactName: contacts.registeredName,
      })
      .from(journalLines)
      .leftJoin(accounts, eq(journalLines.accountId, accounts.id))
      .leftJoin(contacts, eq(journalLines.contactId, contacts.id))
      .where(eq(journalLines.entryId, entryId))
      .orderBy(asc(journalLines.lineNo));

    return {
      id: entry.id,
      entryNo: entry.entryNo,
      entryDate: entry.entryDate,
      book: entry.book,
      referenceNo: entry.referenceNo,
      description: entry.description,
      status: entry.status,
      reversalOfEntryId: entry.reversalOfEntryId,
      postedAt: entry.postedAt,
      createdBy: entry.createdBy,
      enteredByName: creator?.name ?? null,
      lines: lineRows.map((row) => ({
        id: row.line.id,
        lineNo: row.line.lineNo,
        accountId: row.line.accountId,
        accountCode: row.accountCode,
        accountName: row.accountName,
        debitCentavos: row.line.debitCentavos,
        creditCentavos: row.line.creditCentavos,
        memo: row.line.memo,
        contactId: row.line.contactId,
        contactName: row.contactName,
      })),
    };
  });
}

/**
 * Lines for financial reporting: entries with status posted OR reversed
 * (a reversed entry's original lines stay on the books — the mirroring
 * reversal entry is what nets them to zero, per rule #3). Drafts excluded.
 */
export async function listPostedLinesForReport(
  userId: string,
  clientId: string,
  dateFrom?: string,
  dateTo?: string
): Promise<PostedLine[]> {
  return withUserContext(userId, async (tx) => {
    const conditions = [
      eq(journalEntries.clientId, clientId),
      inArray(journalEntries.status, ["posted", "reversed"]),
    ];
    if (dateFrom) conditions.push(gte(journalEntries.entryDate, dateFrom));
    if (dateTo) conditions.push(lte(journalEntries.entryDate, dateTo));

    const rows = await tx
      .select({
        accountId: journalLines.accountId,
        debitCentavos: journalLines.debitCentavos,
        creditCentavos: journalLines.creditCentavos,
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
      .where(and(...conditions));

    return rows;
  });
}

export type GeneralLedgerRow = {
  accountId: string;
  accountCode: string;
  accountName: string;
  normalBalance: "debit" | "credit";
  entryId: string;
  entryNo: number | null;
  entryDate: string;
  description: string;
  memo: string | null;
  debitCentavos: bigint;
  creditCentavos: bigint;
};

/** Every posted/reversed line across every account, ordered for General Ledger pagination (account, then chronologically). */
export async function listLedgerLines(
  userId: string,
  clientId: string,
  dateFrom?: string,
  dateTo?: string
): Promise<GeneralLedgerRow[]> {
  return withUserContext(userId, async (tx) => {
    const conditions = [
      eq(accounts.clientId, clientId),
      inArray(journalEntries.status, ["posted", "reversed"]),
    ];
    if (dateFrom) conditions.push(gte(journalEntries.entryDate, dateFrom));
    if (dateTo) conditions.push(lte(journalEntries.entryDate, dateTo));

    const rows = await tx
      .select({
        accountId: accounts.id,
        accountCode: accounts.code,
        accountName: accounts.name,
        normalBalance: accounts.normalBalance,
        entryId: journalEntries.id,
        entryNo: journalEntries.entryNo,
        entryDate: journalEntries.entryDate,
        description: journalEntries.description,
        memo: journalLines.memo,
        debitCentavos: journalLines.debitCentavos,
        creditCentavos: journalLines.creditCentavos,
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
      .innerJoin(accounts, eq(journalLines.accountId, accounts.id))
      .where(and(...conditions))
      .orderBy(asc(accounts.code), asc(journalEntries.entryDate), asc(journalEntries.entryNo));

    return rows;
  });
}

export type DuplicateEntryMatch = {
  entryId: string;
  entryNo: number | null;
  status: "draft" | "posted" | "reversed";
  enteredByName: string | null;
};

/**
 * A same-client entry already on the books with the same date, reference
 * number, and total amount as the one about to be created — surfaced as a
 * non-blocking warning before saving, not a hard block (two genuinely
 * separate transactions can coincidentally match on all four). Only
 * checked when a reference number is actually given: without one, "same
 * date + amount" alone is far too common a coincidence (e.g. two
 * unrelated cash entries on the same day for a round number) to be a
 * meaningful duplicate signal, and would just be noise.
 *
 * This is exactly the check that benefits from Encoders now seeing every
 * entry on their assigned clients, not just their own — the point is
 * catching a SECOND encoder (or the Bookkeeper) re-keying something
 * already entered, which requires seeing across who entered what.
 */
export async function findPossibleDuplicateGeneralJournalEntry(
  userId: string,
  input: { clientId: string; entryDate: string; referenceNo: string | undefined; totalDebitCentavos: bigint }
): Promise<DuplicateEntryMatch | null> {
  const referenceNo = input.referenceNo;
  if (!referenceNo || referenceNo.trim() === "") return null;

  return withUserContext(userId, async (tx) => {
    const candidates = await tx
      .select({ id: journalEntries.id, entryNo: journalEntries.entryNo, status: journalEntries.status, createdBy: journalEntries.createdBy })
      .from(journalEntries)
      .where(and(eq(journalEntries.clientId, input.clientId), eq(journalEntries.entryDate, input.entryDate), eq(journalEntries.referenceNo, referenceNo)));
    if (candidates.length === 0) return null;

    const totals = await tx
      .select({ entryId: journalLines.entryId, debitCentavos: journalLines.debitCentavos })
      .from(journalLines)
      .where(
        inArray(
          journalLines.entryId,
          candidates.map((c) => c.id)
        )
      );
    const totalByEntry = new Map<string, bigint>();
    for (const l of totals) {
      totalByEntry.set(l.entryId, (totalByEntry.get(l.entryId) ?? 0n) + l.debitCentavos);
    }

    const match = candidates.find((c) => totalByEntry.get(c.id) === input.totalDebitCentavos);
    if (!match) return null;

    const [creator] = match.createdBy ? await tx.select({ name: users.name }).from(users).where(eq(users.id, match.createdBy)).limit(1) : [];
    return { entryId: match.id, entryNo: match.entryNo, status: match.status, enteredByName: creator?.name ?? null };
  });
}
