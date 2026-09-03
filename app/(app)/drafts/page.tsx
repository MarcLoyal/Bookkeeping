import Link from "next/link";
import { requireStaffUser } from "@/lib/auth/current-user";
import { listFirmDrafts } from "@/lib/data/dashboard";

const BOOK_LABELS: Record<string, string> = {
  GJ: "General Journal",
  CRB: "Cash Receipts",
  CDB: "Cash Disbursements",
  SJ: "Sales",
  PJ: "Purchases",
};

export default async function DraftsPage() {
  const user = await requireStaffUser();
  const drafts = await listFirmDrafts(user.id);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Unposted Drafts</h1>
        <Link href="/dashboard" className="text-sm text-slate-600 hover:underline">
          ← Back to dashboard
        </Link>
      </div>
      <p className="mt-1 text-sm text-slate-600">
        Entries started but not yet posted, across every client — {drafts.length} total.
      </p>

      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Book</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Ref #</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {drafts.map((d) => (
              <tr key={d.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link href={`/clients/${d.clientId}`} className="font-medium text-slate-900 hover:underline">
                    {d.clientName}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-700">{BOOK_LABELS[d.book]}</td>
                <td className="px-4 py-3 text-slate-700">{d.entryDate}</td>
                <td className="px-4 py-3">
                  <Link href={`/clients/${d.clientId}/transactions/${d.id}`} className="text-slate-900 hover:underline">
                    {d.description}
                  </Link>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-600">{d.referenceNo ?? "—"}</td>
              </tr>
            ))}
            {drafts.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  No drafts pending — everything started has been posted.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
