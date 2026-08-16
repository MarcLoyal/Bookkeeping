import { sumCentavos, type Centavos } from "../money";

/**
 * Pure pagination for loose-leaf book printing (spec §6 M5). Chromium's
 * print engine turns each `.print-page` block into one physical page via
 * `page-break-after`, so pagination decisions are made HERE — not left to
 * the browser — specifically so brought-forward/carried-forward totals and
 * "Page N of M" are computed against the SAME page boundaries that get
 * printed.
 */

export type JournalBookLine = {
  entryId: string;
  entryNo: number | null;
  entryDate: string;
  book: string;
  referenceNo: string | null;
  description: string;
  accountCode: string;
  accountName: string;
  debitCentavos: Centavos;
  creditCentavos: Centavos;
};

export type JournalBookPage = {
  pageNo: number;
  totalPages: number;
  lines: JournalBookLine[];
  broughtForwardDebit: Centavos;
  broughtForwardCredit: Centavos;
  carriedForwardDebit: Centavos;
  carriedForwardCredit: Centavos;
};

/** Paginates a flat, date-ordered list of journal lines (General Journal, CRB, CDB, SJ, PJ) with running column totals brought/carried forward per page. */
export function paginateJournalBook(lines: JournalBookLine[], linesPerPage: number): JournalBookPage[] {
  if (linesPerPage < 1) throw new Error("linesPerPage must be >= 1");
  const chunks: JournalBookLine[][] = [];
  for (let i = 0; i < lines.length; i += linesPerPage) {
    chunks.push(lines.slice(i, i + linesPerPage));
  }
  if (chunks.length === 0) chunks.push([]);

  const pages: JournalBookPage[] = [];
  let runningDebit = 0n;
  let runningCredit = 0n;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const broughtForwardDebit = runningDebit;
    const broughtForwardCredit = runningCredit;
    const pageDebit = sumCentavos(chunk.map((l) => l.debitCentavos));
    const pageCredit = sumCentavos(chunk.map((l) => l.creditCentavos));
    runningDebit += pageDebit;
    runningCredit += pageCredit;
    pages.push({
      pageNo: i + 1,
      totalPages: chunks.length,
      lines: chunk,
      broughtForwardDebit,
      broughtForwardCredit,
      carriedForwardDebit: runningDebit,
      carriedForwardCredit: runningCredit,
    });
  }
  return pages;
}

export type LedgerLine = {
  entryId: string;
  entryNo: number | null;
  entryDate: string;
  description: string;
  memo: string | null;
  debitCentavos: Centavos;
  creditCentavos: Centavos;
};

export type LedgerPage = {
  pageNo: number;
  totalPages: number;
  lines: LedgerLine[];
  broughtForwardBalance: Centavos;
  carriedForwardBalance: Centavos;
};

export type LedgerAccountPages = {
  accountCode: string;
  accountName: string;
  normalBalance: "debit" | "credit";
  pages: LedgerPage[];
};

/**
 * Paginates one account's chronological lines into its own page run, with a
 * running balance brought forward/carried forward per page (never mixed
 * with another account's folio).
 */
export function paginateLedgerAccount(
  accountCode: string,
  accountName: string,
  normalBalance: "debit" | "credit",
  lines: LedgerLine[],
  linesPerPage: number
): LedgerAccountPages {
  if (linesPerPage < 1) throw new Error("linesPerPage must be >= 1");
  const chunks: LedgerLine[][] = [];
  for (let i = 0; i < lines.length; i += linesPerPage) {
    chunks.push(lines.slice(i, i + linesPerPage));
  }
  if (chunks.length === 0) chunks.push([]);

  const pages: LedgerPage[] = [];
  let runningBalance = 0n;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const broughtForwardBalance = runningBalance;
    for (const line of chunk) {
      const delta = normalBalance === "debit" ? line.debitCentavos - line.creditCentavos : line.creditCentavos - line.debitCentavos;
      runningBalance += delta;
    }
    pages.push({
      pageNo: i + 1,
      totalPages: chunks.length,
      lines: chunk,
      broughtForwardBalance,
      carriedForwardBalance: runningBalance,
    });
  }
  return { accountCode, accountName, normalBalance, pages };
}
