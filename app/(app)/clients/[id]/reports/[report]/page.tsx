import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { listAccounts } from "@/lib/data/accounts";
import { listPostedLinesForReport } from "@/lib/data/journal";
import { getClient } from "@/lib/data/clients";
import { getEwtWithheldByCustomerTotal, getPurchaseTotals, getSalesTotals } from "@/lib/data/tax-reports";
import { getWithholdingByAtcCode } from "@/lib/data/withholding";
import { getCurrentTaxRule } from "@/lib/data/tax-rules";
import { getActiveWithholdingBrackets } from "@/lib/data/payroll";
import { buildBalanceSheet, buildIncomeStatement, buildTrialBalance, type IncomeStatement } from "@/lib/accounting/reports";
import { buildVatReturnSummary } from "@/lib/tax/vat-return";
import { buildPercentageTaxSummary } from "@/lib/tax/percentage-tax";
import { buildEightPercentSummary } from "@/lib/tax/eight-percent";
import { quarterBoundsFor, quarterLabelFor } from "@/lib/tax/quarter-label";
import { formatCentavos, parseRateFraction, pesosToCentavos } from "@/lib/money";
import { PrintButton } from "./print-button";
import { Bir2550QForm } from "./bir-2550q-form";
import { Bir2551QForm } from "./bir-2551q-form";
import { Bir1601EqForm } from "./bir-1601eq-form";
import { Bir1701QForm } from "./bir-1701q-form";
import { Bir1701AForm } from "./bir-1701a-form";

const REPORT_TITLES: Record<string, string> = {
  "trial-balance": "Trial Balance",
  "income-statement": "Income Statement",
  "balance-sheet": "Balance Sheet",
  "vat-return": "VAT Return Summary",
  "vat-return-form": "VAT Return (BIR Form 2550Q)",
  "percentage-tax": "Percentage Tax Summary",
  "percentage-tax-form": "Percentage Tax (BIR Form 2551Q)",
  "eight-percent-tax": "8% Income Tax Summary",
  "withholding-tax-form": "Withholding Tax (BIR Form 1601-EQ)",
  "income-tax-quarterly-form": "Quarterly Income Tax (BIR Form 1701Q)",
  "income-tax-annual-form": "Annual Income Tax (BIR Form 1701A)",
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
  // 1701Q/1701A are individual income tax returns — only Single Proprietor
  // and Professional taxpayers file them (corporations use the 1702
  // series, a later Phase 3 group; a plain "individual" taxpayerType is a
  // pure compensation earner who doesn't self-file quarterly/annual
  // business income tax at all).
  const isIndividualBusinessFiler = client.taxpayerType === "sole_prop" || client.taxpayerType === "professional";
  // 1701A itself only covers OSD or 8% filers ("PURELY from Business/
  // Profession", per the form's own title) — itemized-deduction
  // individuals need the full BIR Form 1701, not built here.
  const supports1701A = isIndividualBusinessFiler && (client.incomeTaxRegime === "graduated_osd" || isEightPercent);

  const reportTabs = [
    ...CORE_REPORT_TABS,
    ...(isVat ? [{ slug: "vat-return", label: "VAT Return" }, { slug: "vat-return-form", label: "VAT Return (BIR Form)" }] : []),
    ...(isPlainPercentageTax
      ? [{ slug: "percentage-tax", label: "Percentage Tax" }, { slug: "percentage-tax-form", label: "Percentage Tax (BIR Form)" }]
      : []),
    ...(isEightPercent ? [{ slug: "eight-percent-tax", label: "8% Income Tax" }] : []),
    { slug: "withholding-tax-form", label: "Withholding Tax (BIR Form)" },
    ...(isIndividualBusinessFiler ? [{ slug: "income-tax-quarterly-form", label: "Income Tax Quarterly (BIR Form)" }] : []),
    ...(supports1701A ? [{ slug: "income-tax-annual-form", label: "Income Tax Annual (BIR Form)" }] : []),
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
        {report === "vat-return-form" && <Vat2550QFormReport userId={user.id} client={client} from={from} to={to} />}
        {report === "percentage-tax" && (
          <PercentageTaxReport userId={user.id} clientId={id} from={from} to={to} grossReceiptsCentavos={incomeStatement.revenueCentavos} />
        )}
        {report === "percentage-tax-form" && (
          <PercentageTax2551QFormReport
            userId={user.id}
            client={client}
            from={from}
            to={to}
            grossReceiptsCentavos={incomeStatement.revenueCentavos}
          />
        )}
        {report === "eight-percent-tax" && (
          <EightPercentReport userId={user.id} clientId={id} from={from} to={to} grossReceiptsCentavos={incomeStatement.revenueCentavos} />
        )}
        {report === "withholding-tax-form" && <Withholding1601EqFormReport userId={user.id} client={client} from={from} to={to} />}
        {report === "income-tax-quarterly-form" && <IncomeTax1701QFormReport userId={user.id} client={client} accounts={accounts} from={from} />}
        {report === "income-tax-annual-form" && <IncomeTax1701AFormReport userId={user.id} client={client} accounts={accounts} from={from} />}
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

async function Vat2550QFormReport({
  userId,
  client,
  from,
  to,
}: {
  userId: string;
  client: NonNullable<Awaited<ReturnType<typeof getClient>>>;
  from: string;
  to: string;
}) {
  const [sales, purchases] = await Promise.all([
    getSalesTotals(userId, client.id, from, to),
    getPurchaseTotals(userId, client.id, from, to),
  ]);
  return (
    <div>
      <TaxReportDisclaimer>
        <span className="font-semibold"> This replica only fills in lines this app has real data for — see notes on the form itself for what still needs manual entry.</span>
      </TaxReportDisclaimer>
      <Bir2550QForm
        client={client}
        quarterLabel={quarterLabelFor(from)}
        from={from}
        to={to}
        sales={sales}
        purchases={purchases}
      />
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

async function PercentageTax2551QFormReport({
  userId,
  client,
  from,
  to,
  grossReceiptsCentavos,
}: {
  userId: string;
  client: NonNullable<Awaited<ReturnType<typeof getClient>>>;
  from: string;
  to: string;
  grossReceiptsCentavos: bigint;
}) {
  const rateValue = await getCurrentTaxRule(userId, "percentage_tax_rate", to);
  const { numerator, denominator } = parseRateFraction(rateValue ?? "0");
  const summary = buildPercentageTaxSummary(grossReceiptsCentavos, numerator, denominator);
  return (
    <div>
      <TaxReportDisclaimer>
        <span className="font-semibold"> This replica only fills in lines this app has real data for — see notes on the form itself for what still needs manual entry.</span>
      </TaxReportDisclaimer>
      <Bir2551QForm client={client} quarterLabel={quarterLabelFor(from)} from={from} to={to} summary={summary} />
    </div>
  );
}

async function Withholding1601EqFormReport({
  userId,
  client,
  from,
  to,
}: {
  userId: string;
  client: NonNullable<Awaited<ReturnType<typeof getClient>>>;
  from: string;
  to: string;
}) {
  const schedule = await getWithholdingByAtcCode(userId, client.id, from, to);
  return (
    <div>
      <TaxReportDisclaimer>
        <span className="font-semibold"> This replica only fills in lines this app has real data for — see notes on the form itself for what still needs manual entry.</span>
      </TaxReportDisclaimer>
      <Bir1601EqForm client={client} quarterLabel={quarterLabelFor(from)} from={from} to={to} schedule={schedule} />
    </div>
  );
}

/** Income Statement for an arbitrary date range, reusing the accounts already fetched at the top of the page (accounts don't vary by date range, only posted lines do). */
async function incomeStatementFor(userId: string, clientId: string, accounts: Awaited<ReturnType<typeof listAccounts>>, from: string, to: string): Promise<IncomeStatement> {
  const lines = await listPostedLinesForReport(userId, clientId, from, to);
  return buildIncomeStatement(buildTrialBalance(accounts, lines));
}

async function IncomeTax1701QFormReport({
  userId,
  client,
  accounts,
  from,
}: {
  userId: string;
  client: NonNullable<Awaited<ReturnType<typeof getClient>>>;
  accounts: Awaited<ReturnType<typeof listAccounts>>;
  from: string;
}) {
  const bounds = quarterBoundsFor(from);
  if (bounds.quarterNumber === 4) {
    return (
      <div className="max-w-xl rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        BIR Form 1701Q has no 4th-quarter filing — the real form only offers First/Second/Third Quarter checkboxes.
        The 4th quarter is reconciled directly on the Annual Return (BIR Form 1701A). Pick a date within Q1–Q3 above.
      </div>
    );
  }

  const [thisQuarter, previousCumulative, ewtThisQuarter, ewtPrevious, graduatedBrackets, eightPercentRateValue, eightPercentThresholdValue] = await Promise.all([
    incomeStatementFor(userId, client.id, accounts, bounds.quarterStartIso, bounds.quarterEndIso),
    bounds.previousCumulativeEndIso ? incomeStatementFor(userId, client.id, accounts, bounds.yearStartIso, bounds.previousCumulativeEndIso) : Promise.resolve(null),
    getEwtWithheldByCustomerTotal(userId, client.id, bounds.quarterStartIso, bounds.quarterEndIso),
    bounds.previousCumulativeEndIso ? getEwtWithheldByCustomerTotal(userId, client.id, bounds.yearStartIso, bounds.previousCumulativeEndIso) : Promise.resolve(0n),
    getActiveWithholdingBrackets(userId, bounds.quarterEndIso),
    getCurrentTaxRule(userId, "eight_percent_rate", bounds.quarterEndIso),
    getCurrentTaxRule(userId, "eight_percent_threshold_annual", bounds.quarterEndIso),
  ]);

  const eightPercentRate = eightPercentRateValue ? parseRateFraction(eightPercentRateValue) : null;
  const eightPercentThresholdCentavos = eightPercentThresholdValue ? pesosToCentavos(eightPercentThresholdValue) : null;

  return (
    <div>
      <TaxReportDisclaimer>
        <span className="font-semibold"> This replica only fills in lines this app has real data for — see notes on the form itself for what still needs manual entry.</span>
      </TaxReportDisclaimer>
      <Bir1701QForm
        client={client}
        quarterLabel={quarterLabelFor(from)}
        quarterNumber={bounds.quarterNumber as 1 | 2 | 3}
        from={bounds.quarterStartIso}
        to={bounds.quarterEndIso}
        thisQuarter={thisQuarter}
        previousCumulative={previousCumulative}
        ewtWithheldThisQuarter={ewtThisQuarter}
        ewtWithheldPreviousQuarters={ewtPrevious}
        graduatedBrackets={graduatedBrackets}
        eightPercentRate={eightPercentRate}
        eightPercentThresholdCentavos={eightPercentThresholdCentavos}
      />
    </div>
  );
}

async function IncomeTax1701AFormReport({
  userId,
  client,
  accounts,
  from,
}: {
  userId: string;
  client: NonNullable<Awaited<ReturnType<typeof getClient>>>;
  accounts: Awaited<ReturnType<typeof listAccounts>>;
  from: string;
}) {
  const year = from.slice(0, 4);
  const yearStartIso = `${year}-01-01`;
  const yearEndIso = `${year}-12-31`;
  const q3EndIso = `${year}-09-30`;

  const [fullYear, first9Months, ewtFullYear, ewtFirst9Months, graduatedBrackets, eightPercentRateValue, eightPercentThresholdValue] = await Promise.all([
    incomeStatementFor(userId, client.id, accounts, yearStartIso, yearEndIso),
    incomeStatementFor(userId, client.id, accounts, yearStartIso, q3EndIso),
    getEwtWithheldByCustomerTotal(userId, client.id, yearStartIso, yearEndIso),
    getEwtWithheldByCustomerTotal(userId, client.id, yearStartIso, q3EndIso),
    getActiveWithholdingBrackets(userId, yearEndIso),
    getCurrentTaxRule(userId, "eight_percent_rate", yearEndIso),
    getCurrentTaxRule(userId, "eight_percent_threshold_annual", yearEndIso),
  ]);

  const eightPercentRate = eightPercentRateValue ? parseRateFraction(eightPercentRateValue) : null;
  const eightPercentThresholdCentavos = eightPercentThresholdValue ? pesosToCentavos(eightPercentThresholdValue) : null;

  return (
    <div>
      <TaxReportDisclaimer>
        <span className="font-semibold"> This replica only fills in lines this app has real data for — see notes on the form itself for what still needs manual entry.</span>
      </TaxReportDisclaimer>
      <Bir1701AForm
        client={client}
        year={year}
        fullYear={fullYear}
        first9Months={first9Months}
        ewtFullYear={ewtFullYear}
        ewtFirst9Months={ewtFirst9Months}
        graduatedBrackets={graduatedBrackets}
        eightPercentRate={eightPercentRate}
        eightPercentThresholdCentavos={eightPercentThresholdCentavos}
      />
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
