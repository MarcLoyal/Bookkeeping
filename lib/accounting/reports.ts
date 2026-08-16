import { sumCentavos, type Centavos } from "../money";
import { FS_LINES } from "./coa-template";

export type AccountForReport = {
  id: string;
  code: string;
  name: string;
  type: "asset" | "liability" | "equity" | "income" | "expense";
  normalBalance: "debit" | "credit";
  fsLineMapping: string;
};

export type PostedLine = {
  accountId: string;
  debitCentavos: Centavos;
  creditCentavos: Centavos;
};

export type TrialBalanceRow = {
  account: AccountForReport;
  debitCentavos: Centavos;
  creditCentavos: Centavos;
  balanceCentavos: Centavos; // signed per normal balance: positive = normal side
};

export type TrialBalance = {
  rows: TrialBalanceRow[];
  totalDebitCentavos: Centavos;
  totalCreditCentavos: Centavos;
  isBalanced: boolean;
};

/** Trial Balance: sums every posted line per account. Debits equal credits by construction of the ledger, but we surface both totals so an imbalance (bug, not user error) is visible. */
export function buildTrialBalance(accounts: AccountForReport[], lines: PostedLine[]): TrialBalance {
  const byAccount = new Map<string, { debit: Centavos; credit: Centavos }>();
  for (const line of lines) {
    const existing = byAccount.get(line.accountId) ?? { debit: 0n, credit: 0n };
    existing.debit += line.debitCentavos;
    existing.credit += line.creditCentavos;
    byAccount.set(line.accountId, existing);
  }

  const rows: TrialBalanceRow[] = accounts
    .filter((a) => byAccount.has(a.id))
    .map((account) => {
      const { debit, credit } = byAccount.get(account.id)!;
      const net = debit - credit;
      const balanceCentavos = account.normalBalance === "debit" ? net : -net;
      return { account, debitCentavos: debit, creditCentavos: credit, balanceCentavos };
    })
    .sort((a, b) => a.account.code.localeCompare(b.account.code));

  const totalDebitCentavos = sumCentavos(rows.map((r) => r.debitCentavos));
  const totalCreditCentavos = sumCentavos(rows.map((r) => r.creditCentavos));

  return {
    rows,
    totalDebitCentavos,
    totalCreditCentavos,
    isBalanced: totalDebitCentavos === totalCreditCentavos,
  };
}

export type IncomeStatement = {
  revenueCentavos: Centavos;
  cogsCentavos: Centavos;
  grossProfitCentavos: Centavos;
  operatingExpensesCentavos: Centavos;
  otherIncomeCentavos: Centavos;
  netIncomeCentavos: Centavos;
  lines: { fsLine: string; label: string; amountCentavos: Centavos }[];
};

function sumByFsLine(tb: TrialBalance, fsLine: string): Centavos {
  return sumCentavos(
    tb.rows.filter((r) => r.account.fsLineMapping === fsLine).map((r) => r.balanceCentavos)
  );
}

/** Income Statement assembled purely from fsLineMapping — never a hardcoded account code (spec §11). */
export function buildIncomeStatement(tb: TrialBalance): IncomeStatement {
  const revenueCentavos = sumByFsLine(tb, FS_LINES.revenue);
  const cogsCentavos = sumByFsLine(tb, FS_LINES.cogs);
  const operatingExpensesCentavos = sumByFsLine(tb, FS_LINES.operatingExpenses);
  const otherIncomeCentavos = sumByFsLine(tb, FS_LINES.otherIncome);
  const grossProfitCentavos = revenueCentavos - cogsCentavos;
  const netIncomeCentavos = grossProfitCentavos - operatingExpensesCentavos + otherIncomeCentavos;

  return {
    revenueCentavos,
    cogsCentavos,
    grossProfitCentavos,
    operatingExpensesCentavos,
    otherIncomeCentavos,
    netIncomeCentavos,
    lines: [
      { fsLine: FS_LINES.revenue, label: "Revenue", amountCentavos: revenueCentavos },
      { fsLine: FS_LINES.cogs, label: "Cost of Sales", amountCentavos: cogsCentavos },
      { fsLine: FS_LINES.operatingExpenses, label: "Operating Expenses", amountCentavos: operatingExpensesCentavos },
      { fsLine: FS_LINES.otherIncome, label: "Other Income", amountCentavos: otherIncomeCentavos },
    ],
  };
}

export type BalanceSheet = {
  currentAssetsCentavos: Centavos;
  nonCurrentAssetsCentavos: Centavos;
  totalAssetsCentavos: Centavos;
  currentLiabilitiesCentavos: Centavos;
  nonCurrentLiabilitiesCentavos: Centavos;
  totalLiabilitiesCentavos: Centavos;
  contributedEquityCentavos: Centavos;
  netIncomeCentavos: Centavos;
  totalEquityCentavos: Centavos;
  isBalanced: boolean; // Assets = Liabilities + Equity (acceptance test #3)
};

/** Balance Sheet as of the trial balance's date range, with net income for the period folded into equity (no formal closing entry required for reporting). */
export function buildBalanceSheet(tb: TrialBalance, incomeStatement: IncomeStatement): BalanceSheet {
  const currentAssetsCentavos = sumByFsLine(tb, FS_LINES.currentAssets);
  const nonCurrentAssetsCentavos = sumByFsLine(tb, FS_LINES.nonCurrentAssets);
  const totalAssetsCentavos = currentAssetsCentavos + nonCurrentAssetsCentavos;

  const currentLiabilitiesCentavos = sumByFsLine(tb, FS_LINES.currentLiabilities);
  const nonCurrentLiabilitiesCentavos = sumByFsLine(tb, FS_LINES.nonCurrentLiabilities);
  const totalLiabilitiesCentavos = currentLiabilitiesCentavos + nonCurrentLiabilitiesCentavos;

  const contributedEquityCentavos = sumByFsLine(tb, FS_LINES.equity);
  const netIncomeCentavos = incomeStatement.netIncomeCentavos;
  const totalEquityCentavos = contributedEquityCentavos + netIncomeCentavos;

  return {
    currentAssetsCentavos,
    nonCurrentAssetsCentavos,
    totalAssetsCentavos,
    currentLiabilitiesCentavos,
    nonCurrentLiabilitiesCentavos,
    totalLiabilitiesCentavos,
    contributedEquityCentavos,
    netIncomeCentavos,
    totalEquityCentavos,
    isBalanced: totalAssetsCentavos === totalLiabilitiesCentavos + totalEquityCentavos,
  };
}
