import { describe, expect, it } from "vitest";
import { pesosToCentavos } from "../../money";
import { buildBalanceSheet, buildIncomeStatement, buildTrialBalance, type AccountForReport } from "../reports";

const accounts: AccountForReport[] = [
  { id: "cash", code: "1020", name: "Cash in Bank", type: "asset", normalBalance: "debit", fsLineMapping: "current_assets" },
  { id: "capital", code: "3010", name: "Owner's Capital", type: "equity", normalBalance: "credit", fsLineMapping: "equity" },
  { id: "sales", code: "4010", name: "Sales — Vatable", type: "income", normalBalance: "credit", fsLineMapping: "revenue" },
  { id: "rent", code: "5050", name: "Rent", type: "expense", normalBalance: "debit", fsLineMapping: "operating_expenses" },
];

// Owner invests 100,000 cash; the business earns 20,000 in sales (cash) and pays 5,000 rent (cash).
const lines = [
  { accountId: "cash", debitCentavos: pesosToCentavos("100000.00"), creditCentavos: 0n },
  { accountId: "capital", debitCentavos: 0n, creditCentavos: pesosToCentavos("100000.00") },
  { accountId: "cash", debitCentavos: pesosToCentavos("20000.00"), creditCentavos: 0n },
  { accountId: "sales", debitCentavos: 0n, creditCentavos: pesosToCentavos("20000.00") },
  { accountId: "rent", debitCentavos: pesosToCentavos("5000.00"), creditCentavos: 0n },
  { accountId: "cash", debitCentavos: 0n, creditCentavos: pesosToCentavos("5000.00") },
];

describe("buildTrialBalance (acceptance test #2)", () => {
  it("balances: total debits equal total credits", () => {
    const tb = buildTrialBalance(accounts, lines);
    expect(tb.isBalanced).toBe(true);
    expect(tb.totalDebitCentavos).toBe(tb.totalCreditCentavos);
  });

  it("nets cash to its normal (debit) balance", () => {
    const tb = buildTrialBalance(accounts, lines);
    const cashRow = tb.rows.find((r) => r.account.id === "cash")!;
    expect(cashRow.balanceCentavos).toBe(pesosToCentavos("115000.00"));
  });
});

describe("buildIncomeStatement + buildBalanceSheet (acceptance test #3)", () => {
  it("Assets = Liabilities + Equity, and net income ties to the income statement", () => {
    const tb = buildTrialBalance(accounts, lines);
    const is = buildIncomeStatement(tb);
    const bs = buildBalanceSheet(tb, is);

    expect(is.netIncomeCentavos).toBe(pesosToCentavos("15000.00")); // 20,000 sales - 5,000 rent
    expect(bs.totalAssetsCentavos).toBe(pesosToCentavos("115000.00"));
    expect(bs.totalLiabilitiesCentavos).toBe(0n);
    expect(bs.totalEquityCentavos).toBe(pesosToCentavos("115000.00")); // 100,000 capital + 15,000 net income
    expect(bs.isBalanced).toBe(true);
    expect(bs.netIncomeCentavos).toBe(is.netIncomeCentavos);
  });
});
