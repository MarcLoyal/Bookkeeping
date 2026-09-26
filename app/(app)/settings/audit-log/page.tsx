import { requireFirmAdmin } from "@/lib/auth/current-user";
import { listRecentAuditLog } from "@/lib/data/audit-log";

export default async function AuditLogPage() {
  const user = await requireFirmAdmin();
  const rows = await listRecentAuditLog(user.id);

  return (
    <div>
      <h2 className="text-lg font-semibold">Audit Log</h2>
      <p className="mt-1 text-sm text-slate-500">
        Every sign-in and data change across the firm — actor, timestamp, and what happened (rule #4). Data changes
        are populated by a database trigger and sign-in events by the login flow itself, so neither can be skipped by
        forgetting to call a logging helper. Visible to firm admins and reviewers only, and only for this firm. Most
        recent {rows.length} entries.
      </p>

      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">When</th>
              <th className="px-4 py-2">Actor</th>
              <th className="px-4 py-2">What happened</th>
              <th className="px-4 py-2">Table</th>
              <th className="px-4 py-2">Record</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id} className={r.action === "LOGIN_FAILED" ? "bg-amber-50" : undefined}>
                <td className="px-4 py-2 text-xs text-slate-500">{r.createdAt.toISOString().replace("T", " ").slice(0, 19)}</td>
                <td className="px-4 py-2">
                  {r.actorName}
                  <span className="ml-1 text-xs text-slate-400">{r.actorEmail}</span>
                </td>
                <td className={`px-4 py-2 ${r.action === "LOGIN_FAILED" ? "font-medium text-amber-800" : ""}`}>{r.description}</td>
                <td className="px-4 py-2 font-mono text-xs text-slate-500">{r.tableName}</td>
                <td className="px-4 py-2 font-mono text-xs text-slate-500">{r.recordId.slice(0, 8)}…</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  No activity logged yet — sign-ins and actions taken through the app will show up here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
