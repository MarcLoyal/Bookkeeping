import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { getJournalEntry } from "@/lib/data/journal";
import { formatCentavos } from "@/lib/money";
import { ReverseForm } from "./reverse-form";

const BOOK_LABELS: Record<string, string> = {
  GJ: "General Journal",
  CRB: "Cash Receipts Book",
  CDB: "Cash Disbursements Book",
  SJ: "Sales Journal",
  PJ: "Purchase Journal",
};

export default async function EntryDetailPage({
  params,
}: {
  params: Promise<{ id: string; entryId: string }>;
}) {
  const user = await requireCurrentUser();
  const { id, entryId } = await params;
  const entry = await getJournalEntry(user.id, id, entryId);
  if (!entry) notFound();

  const totalDebit = entry.lines.reduce((s, l) => s + l.debitCentavos, 0n);
  const totalCredit = entry.lines.reduce((s, l) => s + l.creditCentavos, 0n);

  return (
    <div>
      <Link href={`/clients/${id}/transactions`} className="text-sm text-slate-500 hover:underline">
        ← Back to Transactions
      </Link>

      <div className="mt-4 flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold">
            {BOOK_LABELS[entry.book]} — Entry #{entry.entryNo ?? "(draft)"}
          </h2>
          <p className="text-sm text-slate-500">
            {entry.entryDate} · {entry.description}
            {entry.referenceNo && <> · Ref: {entry.referenceNo}</>}
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium capitalize text-slate-600">
          {entry.status}
        </span>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">Account</th>
              <th className="px-4 py-2">Memo</th>
              <th className="px-4 py-2 text-right">Debit</th>
              <th className="px-4 py-2 text-right">Credit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {entry.lines.map((l) => (
              <tr key={l.id}>
                <td className="px-4 py-2">
                  <span className="font-mono text-xs text-slate-500">{l.accountCode}</span> {l.accountName}
                </td>
                <td className="px-4 py-2 text-slate-500">{l.memo}</td>
                <td className="px-4 py-2 text-right font-mono">
                  {l.debitCentavos > 0n ? formatCentavos(l.debitCentavos) : ""}
                </td>
                <td className="px-4 py-2 text-right font-mono">
                  {l.creditCentavos > 0n ? formatCentavos(l.creditCentavos) : ""}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-slate-300 font-semibold">
            <tr>
              <td className="px-4 py-2" colSpan={2}>
                Total
              </td>
              <td className="px-4 py-2 text-right font-mono">{formatCentavos(totalDebit)}</td>
              <td className="px-4 py-2 text-right font-mono">{formatCentavos(totalCredit)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {entry.status === "posted" && user.role !== "client_user" && (
        <div className="mt-4">
          <ReverseForm clientId={id} entryId={entry.id} />
        </div>
      )}
      {entry.status === "reversed" && (
        <p className="mt-4 text-sm text-slate-500">
          This entry has been reversed. It remains on the books per rule #3 (posted entries are immutable) — see
          the offsetting reversal entry in the transactions list.
        </p>
      )}
    </div>
  );
}
