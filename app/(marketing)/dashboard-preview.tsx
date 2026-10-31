import { Building2, CalendarClock, FileEdit, Users } from "lucide-react";

/**
 * A static illustration of the real authenticated dashboard
 * (app/(app)/dashboard/page.tsx), built from the same card styling and
 * accent colors — NOT a live screenshot. This environment has no
 * Supabase project to sign in to and capture one from, and every number
 * below is a clearly fictitious, labeled example, never a real firm's
 * data (no production screenshot is embedded anywhere on this site).
 */
const ACCENT_BLUE = "#2a78d6";
const ACCENT_ORANGE = "#eb6834";
const ACCENT_AQUA = "#1baf7a";

const DEMO_CLIENTS = [
  { name: "Dela Cruz Sari-Sari Store", status: "Active", lastActivity: "2 hours ago" },
  { name: "Santos Construction Supply", status: "Active", lastActivity: "Yesterday" },
  { name: "Reyes Family Bakery", status: "Needs review", lastActivity: "3 days ago" },
];

function StatTile({ icon: Icon, label, value, accent }: { icon: typeof Users; label: string; value: string; accent: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
        <Icon className="h-4 w-4" style={{ color: accent }} aria-hidden="true" />
        {label}
      </div>
      <p className="mt-2 text-xl font-bold tracking-tight text-slate-900">{value}</p>
    </div>
  );
}

export function DashboardPreview() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-lg shadow-slate-900/10" aria-hidden="true">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-900">Firm Dashboard</p>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">Demo data</span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <StatTile icon={Building2} label="Active clients" value="12" accent={ACCENT_BLUE} />
        <StatTile icon={FileEdit} label="Open drafts" value="4" accent={ACCENT_ORANGE} />
        <StatTile icon={CalendarClock} label="Deadlines this week" value="2" accent={ACCENT_AQUA} />
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-slate-100">
        <div className="divide-y divide-slate-100">
          {DEMO_CLIENTS.map((client) => (
            <div key={client.name} className="flex items-center justify-between px-3 py-2.5 text-sm">
              <span className="font-medium text-slate-700">{client.name}</span>
              <span className="flex items-center gap-3 text-xs text-slate-400">
                <span className={client.status === "Active" ? "text-emerald-600" : "text-amber-600"}>{client.status}</span>
                {client.lastActivity}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
