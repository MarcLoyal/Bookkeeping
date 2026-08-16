import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { listJournalEntries } from "@/lib/data/journal";
import { formatCentavos } from "@/lib/money";

const BOOK_LABELS: Record<string, string> = {
  GJ: "General Journal",
  CRB: "Cash Receipts Book",
  CDB: "Cash Disbursements Book",
  SJ: "Sales Journal",
  PJ: "Purchase Journal",
};

const NEW_TX_TYPES = [
  { type: "sales_invoice", label: "Sales Invoice" },
  { type: "purchase", label: "Purchase" },
  { type: "cash_receipt", label: "Cash Receipt" },
  { type: "cash_disbursement", label: "Cash Disbursement" },
  { type: "general_journal", label: "General Journal" },
];

export default async function TransactionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ book?: string; status?: string; account?: string }>;
}) {
  const user = await requireCurrentUser();
  const { id } = await params;
  const { book, status, account } = await searchParams;

  const entries = await listJournalEntries(user.id, id, {
    book: book as "GJ" | "CRB" | "CDB" | "SJ" | "PJ" | undefined,
    statusIn: status ? [status as "draft" | "posted" | "reversed"] : undefined,
    accountCode: account,
  });
  const sorted = [...entries].reverse();

  return (
    <div>
      {account && (
        <div className="mb-3 flex items-center justify-between rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <span>
            Filtered to entries touching account <span className="font-mono font-semibold">{account}</span>
          </span>
          <Link href={`/clients/${id}/transactions`} className="text-xs font-medium underline">
            Clear filter
          </Link>
        </div>
      )}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Transactions</h2>
        {user.role !== "client_user" && (
          <div className="flex gap-2">
            {NEW_TX_TYPES.map((t) => (
              <Link
                key={t.type}
                href={`/clients/${id}/transactions/new/${t.type}`}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-100"
              >
                + {t.label}
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Entry #</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Book</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Reference</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((e) => {
              const total = e.lines.reduce((s, l) => s + l.debitCentavos, 0n);
              return (
                <tr key={e.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">
                    <Link href={`/clients/${id}/transactions/${e.id}`} className="hover:underline">
                      {e.entryNo ?? "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{e.entryDate}</td>
                  <td className="px-4 py-3 text-slate-600">{BOOK_LABELS[e.book]}</td>
                  <td className="px-4 py-3">{e.description}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{e.referenceNo}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatCentavos(total)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={e.status} />
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  No transactions yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "bg-amber-50 text-amber-700",
    posted: "bg-emerald-50 text-emerald-700",
    reversed: "bg-slate-100 text-slate-500",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${styles[status]}`}>
      {status}
    </span>
  );
}
