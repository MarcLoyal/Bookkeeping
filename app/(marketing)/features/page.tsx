import Link from "next/link";
import { BookOpenCheck, Calculator, Clock, FileText, LayoutDashboard, ListChecks, ShieldCheck, Sparkles } from "lucide-react";

export const metadata = {
  title: "Features — Keep.Books",
  description: "Loose-leaf books, financial statements, BIR reports, a multi-client dashboard, and team access levels — what Keep.Books does, in detail.",
};

function Module({
  icon: Icon,
  title,
  children,
  comingSoon,
}: {
  icon: typeof BookOpenCheck;
  title: string;
  children: React.ReactNode;
  comingSoon?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-6 shadow-sm ${comingSoon ? "border-dashed border-slate-300 bg-slate-50" : "border-slate-200 bg-white"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Icon className={`h-6 w-6 ${comingSoon ? "text-slate-400" : "text-slate-700"}`} aria-hidden="true" />
          <h2 className={`text-lg font-bold ${comingSoon ? "text-slate-500" : "text-slate-900"}`}>{title}</h2>
        </div>
        {comingSoon && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            Coming soon · Custom plan
          </span>
        )}
      </div>
      <div className={`mt-3 space-y-2 text-sm leading-relaxed ${comingSoon ? "text-slate-500" : "text-slate-600"}`}>{children}</div>
    </div>
  );
}

export default function FeaturesPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Features</h1>
        <p className="mt-4 text-slate-600">Everything a Philippine bookkeeping practice needs, in one system.</p>
      </div>

      <div className="mt-12 space-y-6">
        <Module icon={BookOpenCheck} title="Print-ready loose-leaf books of accounts">
          <p>General journal, general ledger, and cash receipts/disbursements books, generated directly from what your team has posted — no separate spreadsheet to keep in sync.</p>
          <p>Formatted for printing and filing, including a dedicated print layout sized to match how these books are typically submitted.</p>
        </Module>

        <Module icon={Calculator} title="General ledger, trial balance & financial statements">
          <p>Trial Balance, Income Statement, and Balance Sheet — built live from your posted entries, always current, for every client you manage.</p>
        </Module>

        <Module icon={FileText} title="BIR reports">
          <p>Reports and figures prepared for BIR filing, covering:</p>
          <ul className="ml-4 list-disc space-y-1">
            <li>VAT — quarterly VAT return (2550Q)</li>
            <li>Percentage tax — quarterly percentage tax return (2551Q)</li>
            <li>Withholding tax — expanded withholding (1601-EQ) and BIR Form 2307 certificates</li>
            <li>Income tax — 1701A, 1701Q, 1702Q, and 1702RT</li>
          </ul>
          <p className="font-medium text-slate-700">
            Keep.Books prepares figures and reports for BIR filing — it is not BIR-accredited and does not file on your behalf. Every report should be
            reviewed by your bookkeeper before filing.
          </p>
        </Module>

        <Module icon={ListChecks} title="SLS/SLP and alphalists">
          <p>Summary List of Sales and Summary List of Purchases, plus employee and payee alphalists — built from the same transaction records as your books, ready to file.</p>
        </Module>

        <Module icon={LayoutDashboard} title="Multi-client dashboard">
          <p>One dashboard across every client you manage: recent activity, clients that need attention, and upcoming filing deadlines, without opening each client one by one.</p>
        </Module>

        <Module icon={ShieldCheck} title="Team access levels and audit trail">
          <p>Five roles, each scoped to what they should actually see and do:</p>
          <ul className="ml-4 list-disc space-y-1">
            <li><span className="font-medium text-slate-700">Owner</span> — full access to the firm: every client, team management, and billing.</li>
            <li><span className="font-medium text-slate-700">Bookkeeper</span> — creates and edits clients, books, and transactions; posts entries.</li>
            <li><span className="font-medium text-slate-700">Reviewer</span> — views everything and approves or posts entries, without editing their content.</li>
            <li><span className="font-medium text-slate-700">Encoder</span> — enters draft transactions for review; can&rsquo;t post, and has no access to reports or dashboard totals.</li>
            <li><span className="font-medium text-slate-700">Viewer</span> — read-only access to the clients they&rsquo;re assigned to.</li>
          </ul>
          <p>Every change to a client&rsquo;s records — who made it, what changed, and when — is captured in a non-bypassable activity log, visible to the firm&rsquo;s Owner and Reviewers.</p>
        </Module>

        <Module icon={Sparkles} title="AI receipt capture" comingSoon>
          <p>Snap or upload a photo of a receipt and have the vendor, date, amount, and VAT breakdown read automatically into a draft entry for your team to review and post.</p>
          <p>Not yet available in the product — planned for the Custom plan.</p>
        </Module>
      </div>

      <div className="mt-12 text-center">
        <Link href="/signup" className="rounded-md bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800">
          Start your free trial
        </Link>
      </div>
    </div>
  );
}
