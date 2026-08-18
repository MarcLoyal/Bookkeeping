import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { listAccounts } from "@/lib/data/accounts";
import { listPostedLinesForReport } from "@/lib/data/journal";
import { getClient } from "@/lib/data/clients";
import { getPurchaseTotals, getSalesTotals } from "@/lib/data/tax-reports";
import { getCurrentTaxRule } from "@/lib/data/tax-rules";
import { buildBalanceSheet, buildIncomeStatement, buildTrialBalance } from "@/lib/accounting/reports";
import { buildVatReturnSummary } from "@/lib/tax/vat-return";
import { buildPercentageTaxSummary } from "@/lib/tax/percentage-tax";
import { buildEightPercentSummary } from "@/lib/tax/eight-percent";
import { formatCentavos, parseRateFraction, pesosToCentavos } from "@/lib/money";
import { PrintButton } from "./print-button";

const REPORT_TITLES: Record<string, string> = {
  "trial-balance": "Trial Balance",
  "income-statement": "Income Statement",
  "balance-sheet": "Balance Sheet",
  "vat-return": "VAT Return Summary",
  "percentage-tax": "Percentage Tax Summary",
  "eight-percent-tax": "8% Income Tax Summary",
};

const CORE_REPORT_TABS = [
  { slug: "trial-balance", label: "Trial Balance" },
  { slug: "income-statement", label: "Income Statement" },
  { slug: "balance-sheet", label: "Balance Sheet" },
];

function defaultRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString().slice(0, 10);
  const to = now.toISOString().slice(0, 10);
  return { from, to };
}

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; report: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const user = await requireCurrentUser();
  const { id, report } = await params;
  if (!REPORT_TITLES[report]) notFound();

  const client = await getClient(user.id, id);
  if (!client) notFound();

  const isVat = client.vatStatus === "vat";
  const isEightPercent = client.incomeTaxRegime === "eight_percent";
  const isPlainPercentageTax = client.vatStatus === "non_vat" && !isEightPercent;

  const reportTabs = [
    ...CORE_REPORT_TABS,
    ...(isVat ? [{ slug: "vat-return", label: "VAT Return" }] : []),
    ...(isPlainPercentageTax ? [{ slug: "percentage-tax", label: "Percentage Tax" }] : []),
    ...(isEightPercent ? [{ slug: "eight-percent-tax", label: "8% Income Tax" }] : []),
  ];
  if (!reportTabs.some((t) => t.slug === report)) notFound();

  const range = await searchParams;
  const { from, to } = { from: range.from || defaultRange().from, to: range.to || defaultRange().to };

  const accounts = await listAccounts(user.id, id);
  const lines = await listPostedLinesForReport(user.id, id, from, to);
  const tb = buildTrialBalance(accounts, lines);
  const incomeStatement = buildIncomeStatement(tb);
  const balanceSheet = buildBalanceSheet(tb, incomeStatement);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{REPORT_TITLES[report]}</h2>
        <form className="no-print flex items-center gap-2 text-sm" action={`/clients/${id}/reports/${report}`}>
          <input type="date" name="from" defaultValue={from} className="rounded-md border border-slate-300 px-2 py-1 text-sm" />
          <span className="text-slate-400">to</span>
          <input type="date" name="to" defaultValue={to} className="rounded-md border border-slate-300 px-2 py-1 text-sm" />
          <button type="submit" className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium hover:bg-slate-100">
            Apply
          </button>
          <PrintButton />
        </form>
      </div>

      <nav className="no-print mt-3 flex gap-1 border-b border-slate-200">
        {reportTabs.map((t) => (
          <Link
            key={t.slug}
            href={`/clients/${id}/reports/${t.slug}?from=${from}&to=${to}`}
            className={`rounded-t-md px-3 py-2 text-sm font-medium hover:bg-slate-100 ${
              t.slug === report ? "border-b-2 border-slate-900 text-slate-900" : "text-slate-600"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <p className="mt-3 text-xs text-slate-500">
        Period {from} to {to}. Figures are for review — see disclaimer in Settings → Tax Rules before relying on
        them for a filing.
      </p>

      <div className="mt-4">
        {report === "trial-balance" && <TrialBalanceView tb={tb} clientId={id} />}
        {report === "income-statement" && <IncomeStatementView is={incomeStatement} />}
        {report === "balance-sheet" && <BalanceSheetView bs={balanceSheet} tb={tb} clientId={id} />}
        {report === "vat-return" && <VatReturnReport userId={user.id} clientId={id} from={from} to={to} />}
        {report === "percentage-tax" && (
          <PercentageTaxReport userId={user.id} clientId={id} from={from} to={to} grossReceiptsCentavos={incomeStatement.revenueCentavos} />
        )}
        {report === "eight-percent-tax" && (
          <EightPercentReport userId={user.id} clientId={id} from={from} to={to} grossReceiptsCentavos={incomeStatement.revenueCentavos} />
        )}
      </div>
    </div>
  );
}

function TaxReportDisclaimer({ children }: { children?: React.ReactNode }) {
  return (
    <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
      <p className="font-semibold">Computation aid, not an official form.</p>
      <p className="mt-1">
        These figures are computed from your posted transactions and the rates on file in Settings → Tax Rules, to
        help you manually enter numbers into the BIR portal — this app does not file or replicate the actual return.
        Labels are plain-English descriptions, not official form line numbers; verify against the current form
        before filing. {children}
      </p>
    </div>
  );
}

async function VatReturnReport({ userId, clientId, from, to }: { userId: string; clientId: string; from: string; to: string }) {
  const [sales, purchases, vatRateValue] = await Promise.all([
    getSalesTotals(userId, clientId, from, to),
    getPurchaseTotals(userId, clientId, from, to),
    getCurrentTaxRule(userId, "vat_rate", to),
  ]);
  const summary = buildVatReturnSummary({
    vatableSalesCentavos: sales.vatableSalesCentavos,
    zeroRatedSalesCentavos: sales.zeroRatedSalesCentavos,
    exemptSalesCentavos: sales.exemptSalesCentavos,
    outputVatCentavos: sales.outputVatCentavos,
    vatablePurchasesCentavos: purchases.vatablePurchasesCentavos,
    inputVatCentavos: purchases.inputVatCentavos,
  });

  const rows: { label: string; amount: bigint; bold?: boolean }[] = [
    { label: "Vatable Sales/Receipts", amount: summary.vatableSalesCentavos },
    { label: "Zero-Rated Sales/Receipts", amount: summary.zeroRatedSalesCentavos },
    { label: "Exempt Sales/Receipts", amount: summary.exemptSalesCentavos },
    { label: "Total Sales/Receipts", amount: summary.totalSalesCentavos, bold: true },
    { label: `Output Tax (${vatRateValue ?? "?"} of vatable sales)`, amount: summary.outputVatCentavos },
    { label: "Vatable Purchases", amount: summary.vatablePurchasesCentavos },
    { label: "Input Tax", amount: summary.inputVatCentavos },
  ];

  return (
    <div className="max-w-xl">
      <TaxReportDisclaimer />
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className={r.bold ? "border-t border-slate-200 font-medium" : ""}>
                <td className="px-4 py-2">{r.label}</td>
                <td className="px-4 py-2 text-right font-mono">{formatCentavos(r.amount)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-slate-300 font-semibold">
              <td className="px-4 py-2">{summary.netVatCentavos >= 0n ? "Net VAT Payable" : "Excess Input Tax (carried over)"}</td>
              <td className="px-4 py-2 text-right font-mono">{formatCentavos(summary.netVatCentavos >= 0n ? summary.netVatCentavos : -summary.netVatCentavos)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

async function PercentageTaxReport({
  userId,
  from,
  to,
  grossReceiptsCentavos,
}: {
  userId: string;
  clientId: string;
  from: string;
  to: string;
  grossReceiptsCentavos: bigint;
}) {
  const rateValue = await getCurrentTaxRule(userId, "percentage_tax_rate", to);
  const { numerator, denominator } = parseRateFraction(rateValue ?? "0");
  const summary = buildPercentageTaxSummary(grossReceiptsCentavos, numerator, denominator);

  return (
    <div className="max-w-xl">
      <TaxReportDisclaimer />
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <tbody>
            <tr>
              <td className="px-4 py-2">Gross Sales/Receipts</td>
              <td className="px-4 py-2 text-right font-mono">{formatCentavos(summary.grossReceiptsCentavos)}</td>
            </tr>
            <tr>
              <td className="px-4 py-2">Tax Rate (from Tax Rules)</td>
              <td className="px-4 py-2 text-right font-mono">{rateValue ?? "—"}</td>
            </tr>
            <tr className="border-t-2 border-slate-300 font-semibold">
              <td className="px-4 py-2">Percentage Tax Due</td>
              <td className="px-4 py-2 text-right font-mono">{formatCentavos(summary.taxDueCentavos)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

async function EightPercentReport({
  userId,
  from,
  to,
  grossReceiptsCentavos,
}: {
  userId: string;
  clientId: string;
  from: string;
  to: string;
  grossReceiptsCentavos: bigint;
}) {
  const [rateValue, thresholdValue] = await Promise.all([
    getCurrentTaxRule(userId, "eight_percent_rate", to),
    getCurrentTaxRule(userId, "eight_percent_threshold_annual", to),
  ]);
  const { numerator, denominator } = parseRateFraction(rateValue ?? "0");
  const thresholdCentavos = pesosToCentavos(thresholdValue ?? "0");
  const summary = buildEightPercentSummary(grossReceiptsCentavos, thresholdCentavos, numerator, denominator);

  return (
    <div className="max-w-xl">
      <TaxReportDisclaimer>
        <span className="font-semibold">
          {" "}
          Simplified: this treats the ₱{formatCentavos(thresholdCentavos)} threshold as applying fresh to this
          period alone. The real 8% option applies it once per year, cumulatively — check year-to-date gross
          receipts by hand if this isn't your first quarter above the threshold.
        </span>
      </TaxReportDisclaimer>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <tbody>
            <tr>
              <td className="px-4 py-2">Gross Sales/Receipts (this period)</td>
              <td className="px-4 py-2 text-right font-mono">{formatCentavos(summary.grossReceiptsCentavos)}</td>
            </tr>
            <tr>
              <td className="px-4 py-2">Less: Threshold (simplified, per period)</td>
              <td className="px-4 py-2 text-right font-mono">{formatCentavos(summary.thresholdCentavos)}</td>
            </tr>
            <tr className="border-t border-slate-200 font-medium">
              <td className="px-4 py-2">Taxable Amount</td>
              <td className="px-4 py-2 text-right font-mono">{formatCentavos(summary.taxableAmountCentavos)}</td>
            </tr>
            <tr>
              <td className="px-4 py-2">Tax Rate (from Tax Rules)</td>
              <td className="px-4 py-2 text-right font-mono">{rateValue ?? "—"}</td>
            </tr>
            <tr className="border-t-2 border-slate-300 font-semibold">
              <td className="px-4 py-2">Income Tax Due</td>
              <td className="px-4 py-2 text-right font-mono">{formatCentavos(summary.taxDueCentavos)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TrialBalanceView({ tb, clientId }: { tb: ReturnType<typeof buildTrialBalance>; clientId: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-2">Code</th>
            <th className="px-4 py-2">Account</th>
            <th className="px-4 py-2 text-right">Debit</th>
            <th className="px-4 py-2 text-right">Credit</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {tb.rows.map((r) => (
            <tr key={r.account.id} className="hover:bg-slate-50">
              <td className="px-4 py-2 font-mono text-xs text-slate-500">{r.account.code}</td>
              <td className="px-4 py-2">
                <Link href={`/clients/${clientId}/transactions?account=${r.account.code}`} className="hover:underline">
                  {r.account.name}
                </Link>
              </td>
              <td className="px-4 py-2 text-right font-mono">
                {r.account.normalBalance === "debit" && r.balanceCentavos > 0n ? formatCentavos(r.balanceCentavos) : ""}
              </td>
              <td className="px-4 py-2 text-right font-mono">
                {r.account.normalBalance === "credit" && r.balanceCentavos > 0n ? formatCentavos(r.balanceCentavos) : ""}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 border-slate-300 font-semibold">
          <tr>
            <td className="px-4 py-2" colSpan={2}>
              Total
            </td>
            <td className="px-4 py-2 text-right font-mono">{formatCentavos(tb.totalDebitCentavos)}</td>
            <td className="px-4 py-2 text-right font-mono">{formatCentavos(tb.totalCreditCentavos)}</td>
          </tr>
        </tfoot>
      </table>
      <div className={`px-4 py-2 text-sm ${tb.isBalanced ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
        {tb.isBalanced ? "Balanced ✓" : "OUT OF BALANCE — this indicates a bug, not a user error"}
      </div>
    </div>
  );
}

function IncomeStatementView({ is }: { is: ReturnType<typeof buildIncomeStatement> }) {
  const rows: { label: string; amount: bigint; bold?: boolean }[] = [
    { label: "Revenue", amount: is.revenueCentavos },
    { label: "Cost of Sales", amount: -is.cogsCentavos },
    { label: "Gross Profit", amount: is.grossProfitCentavos, bold: true },
    { label: "Operating Expenses", amount: -is.operatingExpensesCentavos },
    { label: "Other Income", amount: is.otherIncomeCentavos },
    { label: "Net Income", amount: is.netIncomeCentavos, bold: true },
  ];
  return (
    <div className="max-w-xl overflow-hidden rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-100 text-sm">
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className={r.bold ? "border-t-2 border-slate-300 font-semibold" : ""}>
              <td className="px-4 py-2">{r.label}</td>
              <td className="px-4 py-2 text-right font-mono">{formatCentavos(r.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BalanceSheetView({
  bs,
  tb,
  clientId,
}: {
  bs: ReturnType<typeof buildBalanceSheet>;
  tb: ReturnType<typeof buildTrialBalance>;
  clientId: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Assets
        </div>
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <tbody>
            <tr>
              <td className="px-4 py-2">Current Assets</td>
              <td className="px-4 py-2 text-right font-mono">{formatCentavos(bs.currentAssetsCentavos)}</td>
            </tr>
            <tr>
              <td className="px-4 py-2">Non-Current Assets</td>
              <td className="px-4 py-2 text-right font-mono">{formatCentavos(bs.nonCurrentAssetsCentavos)}</td>
            </tr>
            <tr className="border-t-2 border-slate-300 font-semibold">
              <td className="px-4 py-2">Total Assets</td>
              <td className="px-4 py-2 text-right font-mono">{formatCentavos(bs.totalAssetsCentavos)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Liabilities &amp; Equity
        </div>
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <tbody>
            <tr>
              <td className="px-4 py-2">Current Liabilities</td>
              <td className="px-4 py-2 text-right font-mono">{formatCentavos(bs.currentLiabilitiesCentavos)}</td>
            </tr>
            <tr>
              <td className="px-4 py-2">Non-Current Liabilities</td>
              <td className="px-4 py-2 text-right font-mono">{formatCentavos(bs.nonCurrentLiabilitiesCentavos)}</td>
            </tr>
            <tr className="border-t border-slate-200 font-medium">
              <td className="px-4 py-2">Total Liabilities</td>
              <td className="px-4 py-2 text-right font-mono">{formatCentavos(bs.totalLiabilitiesCentavos)}</td>
            </tr>
            <tr>
              <td className="px-4 py-2">Contributed Equity</td>
              <td className="px-4 py-2 text-right font-mono">{formatCentavos(bs.contributedEquityCentavos)}</td>
            </tr>
            <tr>
              <td className="px-4 py-2">Net Income (period)</td>
              <td className="px-4 py-2 text-right font-mono">{formatCentavos(bs.netIncomeCentavos)}</td>
            </tr>
            <tr className="border-t border-slate-200 font-medium">
              <td className="px-4 py-2">Total Equity</td>
              <td className="px-4 py-2 text-right font-mono">{formatCentavos(bs.totalEquityCentavos)}</td>
            </tr>
            <tr className="border-t-2 border-slate-300 font-semibold">
              <td className="px-4 py-2">Total Liabilities &amp; Equity</td>
              <td className="px-4 py-2 text-right font-mono">
                {formatCentavos(bs.totalLiabilitiesCentavos + bs.totalEquityCentavos)}
              </td>
            </tr>
          </tbody>
        </table>
        <div className={`px-4 py-2 text-sm ${bs.isBalanced ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
          {bs.isBalanced ? "Assets = Liabilities + Equity ✓" : "OUT OF BALANCE — this indicates a bug"}
        </div>
      </div>
    </div>
  );
}
