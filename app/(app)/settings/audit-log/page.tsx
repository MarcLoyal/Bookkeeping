import { requireFirmAdmin } from "@/lib/auth/current-user";
import { listRecentAuditLog } from "@/lib/data/audit-log";

export default async function AuditLogPage() {
  const user = await requireFirmAdmin();
  const rows = await listRecentAuditLog(user.id);

  return (
    <div>
      <h2 className="text-lg font-semibold">Audit Log</h2>
      <p className="mt-1 text-sm text-slate-500">
        Every mutation across the firm — actor, timestamp, table, and record id (rule #4). Populated by a database
        trigger, so it cannot be skipped by application code. Most recent {rows.length} entries.
      </p>

      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">When</th>
              <th className="px-4 py-2">Actor</th>
              <th className="px-4 py-2">Action</th>
              <th className="px-4 py-2">Table</th>
              <th className="px-4 py-2">Record</th>
              <th className="px-4 py-2">Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2 text-xs text-slate-500">{r.createdAt.toISOString().replace("T", " ").slice(0, 19)}</td>
                <td className="px-4 py-2">
                  {r.actorName}
                  <span className="ml-1 text-xs text-slate-400">{r.actorEmail}</span>
                </td>
                <td className="px-4 py-2 font-mono text-xs uppercase">{r.action}</td>
                <td className="px-4 py-2 font-mono text-xs">{r.tableName}</td>
                <td className="px-4 py-2 font-mono text-xs text-slate-500">{r.recordId.slice(0, 8)}…</td>
                <td className="px-4 py-2 text-xs text-slate-500">{r.reason ?? "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  No mutations logged yet — actions taken through the app will show up here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
