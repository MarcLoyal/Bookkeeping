import "server-only";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { withUserContext } from "@/db/client";
import { accounts, contacts, journalEntries, journalLines } from "@/db/schema";
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
