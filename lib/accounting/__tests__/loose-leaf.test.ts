import { describe, expect, it } from "vitest";
import { pesosToCentavos } from "../../money";
import { paginateJournalBook, paginateLedgerAccount, type JournalBookLine, type LedgerLine } from "../loose-leaf";

function jbLine(overrides: Partial<JournalBookLine> = {}): JournalBookLine {
  return {
    entryId: "e1",
    entryNo: 1,
    entryDate: "2026-01-01",
    book: "GJ",
    referenceNo: null,
    description: "test",
    accountCode: "1010",
    accountName: "Cash",
    debitCentavos: 0n,
    creditCentavos: 0n,
    ...overrides,
  };
}

describe("paginateJournalBook (acceptance test #10 support)", () => {
  it("splits lines across pages with continuous page numbers", () => {
    const lines = Array.from({ length: 25 }, (_, i) =>
      jbLine({ entryNo: i + 1, debitCentavos: pesosToCentavos("100.00") })
    );
    const pages = paginateJournalBook(lines, 10);
    expect(pages).toHaveLength(3);
    expect(pages.map((p) => p.pageNo)).toEqual([1, 2, 3]);
    expect(pages.every((p) => p.totalPages === 3)).toBe(true);
    expect(pages[0].lines).toHaveLength(10);
    expect(pages[2].lines).toHaveLength(5);
  });

  it("carries the running total forward correctly page to page", () => {
    const lines = [
      jbLine({ debitCentavos: pesosToCentavos("100.00") }),
      jbLine({ creditCentavos: pesosToCentavos("100.00") }),
      jbLine({ debitCentavos: pesosToCentavos("50.00") }),
      jbLine({ creditCentavos: pesosToCentavos("50.00") }),
    ];
    const pages = paginateJournalBook(lines, 2);
    expect(pages).toHaveLength(2);
    expect(pages[0].broughtForwardDebit).toBe(0n);
    expect(pages[0].carriedForwardDebit).toBe(pesosToCentavos("100.00"));
    expect(pages[1].broughtForwardDebit).toBe(pesosToCentavos("100.00"));
    expect(pages[1].carriedForwardDebit).toBe(pesosToCentavos("150.00"));
    expect(pages[1].carriedForwardCredit).toBe(pesosToCentavos("150.00"));
  });

  it("always yields at least one (empty) page", () => {
    const pages = paginateJournalBook([], 10);
    expect(pages).toHaveLength(1);
    expect(pages[0].lines).toHaveLength(0);
  });
});

function glLine(overrides: Partial<LedgerLine> = {}): LedgerLine {
  return {
    entryId: "e1",
    entryNo: 1,
    entryDate: "2026-01-01",
    description: "test",
    memo: null,
    debitCentavos: 0n,
    creditCentavos: 0n,
    ...overrides,
  };
}

describe("paginateLedgerAccount", () => {
  it("computes a running debit-normal balance across pages", () => {
    const lines = [
      glLine({ debitCentavos: pesosToCentavos("1000.00") }),
      glLine({ creditCentavos: pesosToCentavos("300.00") }),
      glLine({ debitCentavos: pesosToCentavos("200.00") }),
    ];
    const result = paginateLedgerAccount("1020", "Cash in Bank", "debit", lines, 2);
    expect(result.pages).toHaveLength(2);
    expect(result.pages[0].broughtForwardBalance).toBe(0n);
    expect(result.pages[0].carriedForwardBalance).toBe(pesosToCentavos("700.00"));
    expect(result.pages[1].broughtForwardBalance).toBe(pesosToCentavos("700.00"));
    expect(result.pages[1].carriedForwardBalance).toBe(pesosToCentavos("900.00"));
  });

  it("computes a running credit-normal balance (e.g. a liability) correctly", () => {
    const lines = [
      glLine({ creditCentavos: pesosToCentavos("500.00") }),
      glLine({ debitCentavos: pesosToCentavos("200.00") }),
    ];
    const result = paginateLedgerAccount("2010", "Accounts Payable", "credit", lines, 10);
    expect(result.pages[0].carriedForwardBalance).toBe(pesosToCentavos("300.00"));
  });
});
