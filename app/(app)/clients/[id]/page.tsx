import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { getClient } from "@/lib/data/clients";
import { listAccounts } from "@/lib/data/accounts";
import { listPostedLinesForReport } from "@/lib/data/journal";
import { buildBalanceSheet, buildIncomeStatement, buildTrialBalance } from "@/lib/accounting/reports";
import { formatCentavos } from "@/lib/money";

function currentQuarterRange(): { from: string; to: string; label: string } {
  const now = new Date();
  const q = Math.floor(now.getUTCMonth() / 3);
  const from = new Date(Date.UTC(now.getUTCFullYear(), q * 3, 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), q * 3 + 3, 0));
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    label: `Q${q + 1} ${now.getUTCFullYear()}`,
  };
}

export default async function ClientOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCurrentUser();
  const { id } = await params;
  const client = await getClient(user.id, id);
  if (!client) return null; // layout already 404s

  const accts = await listAccounts(user.id, id);
  const { from, to, label } = currentQuarterRange();
  const lines = await listPostedLinesForReport(user.id, id, undefined, to);
  const tb = buildTrialBalance(accts, lines);
  const is = buildIncomeStatement(tb);
  const bs = buildBalanceSheet(tb, is);

  const qtdLines = await listPostedLinesForReport(user.id, id, from, to);
  const qtdTb = buildTrialBalance(accts, qtdLines);
  const qtdIs = buildIncomeStatement(qtdTb);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={`Revenue (${label})`} value={formatCentavos(qtdIs.revenueCentavos)} />
        <StatCard label={`Net Income (${label})`} value={formatCentavos(qtdIs.netIncomeCentavos)} />
        <StatCard label="Total Assets (to date)" value={formatCentavos(bs.totalAssetsCentavos)} />
        <StatCard
          label="Balance Sheet Check"
          value={bs.isBalanced ? "Balanced" : "OUT OF BALANCE"}
          tone={bs.isBalanced ? "good" : "bad"}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">Registration Details</h2>
          <dl className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-slate-500">Taxpayer Type</dt>
            <dd className="capitalize">{client.taxpayerType.replace("_", " ")}</dd>
            <dt className="text-slate-500">VAT Status</dt>
            <dd className="capitalize">{client.vatStatus.replace("_", " ")}</dd>
            <dt className="text-slate-500">Income Tax Regime</dt>
            <dd className="capitalize">{client.incomeTaxRegime.replace(/_/g, " ")}</dd>
            <dt className="text-slate-500">RDO Code</dt>
            <dd>{client.rdoCode}</dd>
            <dt className="text-slate-500">Books Type</dt>
            <dd className="capitalize">{client.booksType.replace("_", " ")}</dd>
            <dt className="text-slate-500">Accounting Method</dt>
            <dd className="capitalize">{client.accountingMethod}</dd>
          </dl>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">Quick Actions</h2>
          <div className="mt-3 flex flex-col gap-2 text-sm">
            <Link className="text-slate-700 hover:underline" href={`/clients/${id}/transactions/new/sales_invoice`}>
              + Encode Sales Invoice
            </Link>
            <Link className="text-slate-700 hover:underline" href={`/clients/${id}/transactions/new/purchase`}>
              + Encode Purchase
            </Link>
            <Link className="text-slate-700 hover:underline" href={`/clients/${id}/transactions/new/cash_receipt`}>
              + Encode Cash Receipt
            </Link>
            <Link className="text-slate-700 hover:underline" href={`/clients/${id}/transactions/new/cash_disbursement`}>
              + Encode Cash Disbursement
            </Link>
            <Link className="text-slate-700 hover:underline" href={`/clients/${id}/transactions/new/general_journal`}>
              + Encode General Journal Entry
            </Link>
            <Link className="text-slate-700 hover:underline" href={`/clients/${id}/reports/trial-balance`}>
              View Trial Balance
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div
        className={`mt-1 text-xl font-bold ${
          tone === "bad" ? "text-red-600" : tone === "good" ? "text-emerald-600" : "text-slate-900"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
