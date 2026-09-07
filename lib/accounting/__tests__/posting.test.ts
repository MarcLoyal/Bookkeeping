import { describe, expect, it } from "vitest";
import { centavos, pesosToCentavos } from "../../money";
import {
  UnbalancedEntryError,
  assertBalanced,
  buildCashDisbursementLines,
  buildCashReceiptLines,
  buildGeneralJournalLines,
  buildPayrollRunLines,
  buildPurchaseLines,
  buildReversalLines,
  buildSalesInvoiceLines,
  isDateLocked,
} from "../posting";

describe("buildSalesInvoiceLines", () => {
  it("produces a balanced entry for a vatable sale", () => {
    const lines = buildSalesInvoiceLines({
      contactId: "contact-1",
      arAccountId: "ar",
      vatableSalesAccountId: "sales-vatable",
      zeroRatedSalesAccountId: "sales-zero",
      exemptSalesAccountId: "sales-exempt",
      outputVatAccountId: "output-vat",
      totalCentavos: pesosToCentavos("11200.00"),
      vatableSalesCentavos: pesosToCentavos("10000.00"),
      zeroRatedSalesCentavos: 0n,
      exemptSalesCentavos: 0n,
      outputVatCentavos: pesosToCentavos("1200.00"),
    });
    // zero-amount buckets dropped
    expect(lines).toHaveLength(3);
    expect(() => assertBalanced(lines)).not.toThrow();
  });

  it("throws if the caller passes inconsistent totals", () => {
    expect(() =>
      buildSalesInvoiceLines({
        contactId: "c",
        arAccountId: "ar",
        vatableSalesAccountId: "sv",
        zeroRatedSalesAccountId: "sz",
        exemptSalesAccountId: "se",
        outputVatAccountId: "ov",
        totalCentavos: pesosToCentavos("100.00"),
        vatableSalesCentavos: pesosToCentavos("100.00"),
        zeroRatedSalesCentavos: 0n,
        exemptSalesCentavos: 0n,
        outputVatCentavos: pesosToCentavos("50.00"), // wrong — doesn't tie to total
      })
    ).toThrow(UnbalancedEntryError);
  });
});

describe("buildPurchaseLines", () => {
  it("nets EWT withheld out of accounts payable", () => {
    const lines = buildPurchaseLines({
      contactId: "supplier-1",
      expenseAccountId: "professional-fees",
      inputVatAccountId: "input-vat",
      apAccountId: "ap",
      ewtPayableAccountId: "ewt-payable",
      totalCentavos: pesosToCentavos("11200.00"),
      vatablePurchaseCentavos: pesosToCentavos("10000.00"),
      exemptPurchaseCentavos: 0n,
      zeroRatedPurchaseCentavos: 0n,
      inputVatCentavos: pesosToCentavos("1200.00"),
      ewtAmountCentavos: pesosToCentavos("500.00"),
    });
    const ap = lines.find((l) => l.accountId === "ap");
    const ewt = lines.find((l) => l.accountId === "ewt-payable");
    expect(ap?.creditCentavos).toBe(pesosToCentavos("10700.00"));
    expect(ewt?.creditCentavos).toBe(pesosToCentavos("500.00"));
    expect(() => assertBalanced(lines)).not.toThrow();
  });
});

describe("buildCashReceiptLines / buildCashDisbursementLines", () => {
  it("splits a receipt across multiple allocation accounts", () => {
    const lines = buildCashReceiptLines({
      bankCashAccountId: "bank",
      totalCentavos: pesosToCentavos("1000.00"),
      allocations: [
        { accountId: "ar", amountCentavos: pesosToCentavos("900.00") },
        { accountId: "bank-charges", amountCentavos: pesosToCentavos("100.00") },
      ],
    });
    expect(() => assertBalanced(lines)).not.toThrow();
  });

  it("rejects allocations that don't sum to the total", () => {
    expect(() =>
      buildCashDisbursementLines({
        bankCashAccountId: "bank",
        totalCentavos: pesosToCentavos("1000.00"),
        allocations: [{ accountId: "rent", amountCentavos: pesosToCentavos("900.00") }],
      })
    ).toThrow(UnbalancedEntryError);
  });
});

describe("buildGeneralJournalLines / assertBalanced (acceptance test #1, app-layer mirror)", () => {
  it("rejects a manually keyed entry with unequal debits and credits", () => {
    expect(() =>
      buildGeneralJournalLines([
        { accountId: "a", debitCentavos: 100n, creditCentavos: 0n },
        { accountId: "b", debitCentavos: 0n, creditCentavos: 90n },
      ])
    ).toThrow(UnbalancedEntryError);
  });

  it("accepts a balanced multi-line entry", () => {
    const lines = buildGeneralJournalLines([
      { accountId: "a", debitCentavos: 100n, creditCentavos: 0n },
      { accountId: "b", debitCentavos: 0n, creditCentavos: 60n },
      { accountId: "c", debitCentavos: 0n, creditCentavos: 40n },
    ]);
    expect(lines).toHaveLength(3);
  });
});

describe("buildReversalLines", () => {
  it("mirrors debit/credit on every line, same accounts", () => {
    const original = buildGeneralJournalLines([
      { accountId: "a", debitCentavos: 100n, creditCentavos: 0n },
      { accountId: "b", debitCentavos: 0n, creditCentavos: 100n },
    ]);
    const reversal = buildReversalLines(original);
    expect(reversal).toEqual([
      { accountId: "a", debitCentavos: 0n, creditCentavos: 100n, memo: "Reversal", contactId: undefined },
      { accountId: "b", debitCentavos: 100n, creditCentavos: 0n, memo: "Reversal", contactId: undefined },
    ]);
    expect(() => assertBalanced(reversal)).not.toThrow();
  });
});

describe("isDateLocked", () => {
  const locks = [{ periodStart: "2026-01-01", periodEnd: "2026-01-31", unlockedAt: null }];

  it("flags a date inside a locked, un-unlocked period", () => {
    expect(isDateLocked("2026-01-15", locks)).toBe(true);
  });

  it("allows a date outside the locked period", () => {
    expect(isDateLocked("2026-02-01", locks)).toBe(false);
  });

  it("allows a date inside a period that has since been unlocked", () => {
    expect(
      isDateLocked("2026-01-15", [{ ...locks[0], unlockedAt: "2026-02-01T00:00:00Z" }])
    ).toBe(false);
  });
});

describe("buildPayrollRunLines", () => {
  it("aggregates every payslip into one balanced entry", () => {
    const payslips = [
      {
        basicPayCentavos: centavos(20_000_00),
        overtimePayCentavos: 0n,
        otherTaxableEarningsCentavos: 0n,
        deMinimisCentavos: centavos(1_000_00),
        thirteenthMonthPayCentavos: 0n,
        sssEmployeeCentavos: centavos(900_00),
        sssEmployerCentavos: centavos(1_930_00),
        philhealthEmployeeCentavos: centavos(500_00),
        philhealthEmployerCentavos: centavos(500_00),
        pagibigEmployeeCentavos: centavos(100_00),
        pagibigEmployerCentavos: centavos(200_00),
        withholdingTaxCentavos: 0n,
        netPayCentavos: centavos(19_500_00),
      },
      {
        basicPayCentavos: centavos(35_000_00),
        overtimePayCentavos: 0n,
        otherTaxableEarningsCentavos: 0n,
        deMinimisCentavos: 0n,
        thirteenthMonthPayCentavos: 0n,
        sssEmployeeCentavos: centavos(900_00),
        sssEmployerCentavos: centavos(1_930_00),
        philhealthEmployeeCentavos: centavos(875_00),
        philhealthEmployerCentavos: centavos(875_00),
        pagibigEmployeeCentavos: centavos(100_00),
        pagibigEmployerCentavos: centavos(200_00),
        withholdingTaxCentavos: centavos(1_843_75),
        netPayCentavos: centavos(31_281_25),
      },
    ];

    const lines = buildPayrollRunLines({
      salariesExpenseAccountId: "salaries-expense",
      statutoryContributionsExpenseAccountId: "statutory-expense",
      withholdingTaxPayableAccountId: "wtax-payable",
      statutoryPayableAccountId: "statutory-payable",
      salariesPayableAccountId: "salaries-payable",
      payslips,
    });

    expect(() => assertBalanced(lines)).not.toThrow();
    const byAccount = Object.fromEntries(lines.map((l) => [l.accountId, l]));
    expect(byAccount["salaries-expense"].debitCentavos).toBe(centavos(56_000_00));
    expect(byAccount["statutory-expense"].debitCentavos).toBe(centavos(5_635_00));
    expect(byAccount["wtax-payable"].creditCentavos).toBe(centavos(1_843_75));
    expect(byAccount["statutory-payable"].creditCentavos).toBe(centavos(9_010_00));
    expect(byAccount["salaries-payable"].creditCentavos).toBe(centavos(50_781_25));
  });

  it("throws UnbalancedEntryError with no payslips (all lines zero)", () => {
    expect(() =>
      buildPayrollRunLines({
        salariesExpenseAccountId: "salaries-expense",
        statutoryContributionsExpenseAccountId: "statutory-expense",
        withholdingTaxPayableAccountId: "wtax-payable",
        statutoryPayableAccountId: "statutory-payable",
        salariesPayableAccountId: "salaries-payable",
        payslips: [],
      })
    ).toThrow(UnbalancedEntryError);
  });
});
