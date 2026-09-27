import Link from "next/link";
import type { UpcomingDeadline } from "@/lib/data/deadlines";

type DeadlineStatus = "overdue" | "urgent" | "upcoming";

function statusFor(dueDateIso: string, today: Date): DeadlineStatus {
  const due = new Date(`${dueDateIso}T00:00:00Z`);
  const diffDays = (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays < 0) return "overdue";
  if (diffDays <= 7) return "urgent";
  return "upcoming";
}

const STATUS_STYLES: Record<DeadlineStatus, { row: string; badge: string; label: string }> = {
  overdue: { row: "bg-red-50", badge: "bg-red-100 text-red-800", label: "Overdue" },
  urgent: { row: "bg-amber-50", badge: "bg-amber-100 text-amber-800", label: "Due soon" },
  upcoming: { row: "", badge: "bg-slate-100 text-slate-600", label: "Upcoming" },
};

/**
 * Calendar due dates derived from each client's tax profile (see
 * lib/tax/bir-deadlines.ts) -- NOT a record of what's actually been filed.
 * This app has no filing-status tracking anywhere, so "overdue" here means
 * "the calendar date has passed," not "confirmed not filed."
 */
export function DeadlinesWidget({ deadlines }: { deadlines: UpcomingDeadline[] }) {
  const today = new Date();
  const visible = deadlines.slice(0, 10);
  const overdueCount = deadlines.filter((d) => statusFor(d.dueDateIso, today) === "overdue").length;

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Upcoming BIR Deadlines</h2>
        {overdueCount > 0 && (
          <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
            {overdueCount} overdue
          </span>
        )}
      </div>
      <table className="min-w-full divide-y divide-slate-100 text-sm">
        <tbody className="divide-y divide-slate-100">
          {visible.map((d, i) => {
            const status = statusFor(d.dueDateIso, today);
            const styles = STATUS_STYLES[status];
            return (
              <tr key={`${d.clientId}-${d.formCode}-${i}`} className={styles.row}>
                <td className="px-4 py-2.5">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${styles.badge}`}>
                    {styles.label}
                  </span>
                </td>
                <td className="px-4 py-2.5 font-medium text-slate-900">
                  <Link href={`/clients/${d.clientId}`} className="hover:underline">
                    {d.clientName}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-slate-700">
                  {d.formCode} <span className="text-slate-400">— {d.formLabel}</span>
                </td>
                <td className="px-4 py-2.5 text-xs text-slate-500">{d.periodLabel}</td>
                <td className="px-4 py-2.5 text-right text-xs font-medium text-slate-700">{d.dueDateIso}</td>
              </tr>
            );
          })}
          {deadlines.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                No active clients with a tax profile set yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {deadlines.length > visible.length && (
        <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">
          Showing the {visible.length} soonest of {deadlines.length} total.
        </p>
      )}
    </div>
  );
}
