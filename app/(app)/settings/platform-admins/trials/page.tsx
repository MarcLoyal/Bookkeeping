import { AlertTriangle } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/auth/current-user";
import { listExpiredTrialFirms } from "@/lib/data/platform-billing";
import { StatCard } from "@/app/(app)/dashboard/stat-card";
import { ExpiredTrialRow } from "./expired-trial-row";

// Same categorical accent platform-admins/page.tsx and the dashboard's own
// stat row draw from (dataviz skill palette) — a warning-toned card here,
// since every firm on this page needs the platform admin's attention.
const ACCENT_RED = "#d03b3b";

export default async function ExpiredTrialsPage() {
  const admin = await requirePlatformAdmin();
  const firms = await listExpiredTrialFirms(admin.id);

  return (
    <div>
      <h2 className="text-lg font-semibold">Expired Trials</h2>
      <p className="mt-1 text-sm text-slate-500">
        Firms flagged by the day-8 trial check. Billing isn&apos;t automated yet — nothing here happens on its own; pick an
        action per firm below.
      </p>

      <div className="mt-4 max-w-xs">
        <StatCard label="Awaiting Review" stat={firms.length} icon={AlertTriangle} accent={ACCENT_RED} warnWhenPositive />
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <ul className="divide-y divide-slate-100">
          {firms.map((firm) => (
            <ExpiredTrialRow key={firm.id} firm={firm} />
          ))}
          {firms.length === 0 && <li className="px-4 py-8 text-center text-sm text-slate-500">No expired trials right now.</li>}
        </ul>
      </div>
    </div>
  );
}
