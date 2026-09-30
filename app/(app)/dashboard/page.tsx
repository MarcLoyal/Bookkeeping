import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, Building2, CalendarClock, CalendarPlus, FileEdit, UserPlus, Users } from "lucide-react";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { getClientAttentionStat, getClientLastActivity, getFirmDashboardStats, listFirmDrafts } from "@/lib/data/dashboard";
import { listClients } from "@/lib/data/clients";
import { listRecentAuditLog } from "@/lib/data/audit-log";
import { listUpcomingDeadlines } from "@/lib/data/deadlines";
import {
  getCumulativeFirmsByWeek,
  getFirmSignupsByWeek,
  getPlatformStats,
  listFirmsForDashboard,
} from "@/lib/data/platform-dashboard";
import { ActivityBadge } from "@/components/activity-badge";
import { QuickPostPicker } from "./quick-post-picker";
import { EncoderClientPicker } from "./encoder-client-picker";
import { EncoderReceiptPicker } from "./encoder-receipt-picker";
import { EncoderTransactionsPicker } from "./encoder-transactions-picker";
import { PlatformFirmsTable } from "./platform-firms-table";
import { PlatformGrowthChart } from "./platform-growth-chart";
import { OverviewSparklineCard } from "./overview-sparkline-card";
import { StatCard, type PeriodStat } from "./stat-card";
import { DeadlinesWidget } from "./deadlines-widget";

// Dataviz skill's categorical palette (references/palette.md), fixed slot
// order 1-4 — one accent per stat card, not a magnitude ramp.
const ACCENT_BLUE = "#2a78d6";
const ACCENT_ORANGE = "#eb6834";
const ACCENT_AQUA = "#1baf7a";
const ACCENT_YELLOW = "#eda100";

const VAT_LABELS: Record<string, string> = { vat: "VAT", non_vat: "Non-VAT", vat_exempt: "VAT-Exempt" };

export default async function DashboardPage() {
  const user = await requireCurrentUser();
  if (user.role === "client_user") {
    if (!user.clientId) redirect("/login");
    redirect(`/clients/${user.clientId}`);
  }

  // Not scoped to any firm (firmId is NULL) — the firm-scoped queries below
  // would just return empty for them, so this is a genuinely separate view
  // rather than reusing the firm dashboard's queries.
  if (user.role === "platform_admin") {
    const [stats, firmRows, weeklySignups, cumulativeFirms] = await Promise.all([
      getPlatformStats(user.id),
      listFirmsForDashboard(user.id),
      getFirmSignupsByWeek(user.id, 10),
      getCumulativeFirmsByWeek(user.id, 10),
    ]);

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Platform Admin</h1>
          <Link href="/settings/platform-admins" className="text-sm text-slate-600 hover:underline">
            Manage platform admins →
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total Firms" stat={stats.totalFirms} icon={Building2} accent={ACCENT_BLUE} deltaCaption="vs last week" />
          <StatCard
            label="Active Users (All Firms)"
            stat={stats.totalActiveUsers}
            icon={Users}
            accent={ACCENT_ORANGE}
            deltaCaption="vs last week (approx.)"
          />
          <StatCard
            label="New Firms This Week"
            stat={stats.newFirmsThisWeek}
            icon={UserPlus}
            accent={ACCENT_AQUA}
            deltaCaption="vs last week"
          />
          <StatCard
            label="New Firms This Month"
            stat={stats.newFirmsThisMonth}
            icon={CalendarPlus}
            accent={ACCENT_YELLOW}
            deltaCaption="vs last month"
          />
        </div>

        <div>
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Overview</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <PlatformGrowthChart data={weeklySignups} />
            <OverviewSparklineCard
              label="Total Firms (cumulative)"
              data={cumulativeFirms.map((d) => ({ weekStart: d.weekStart, value: d.total }))}
              accent={ACCENT_BLUE}
            />
          </div>
        </div>

        {stats.signupMethodBreakdown.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <span className="font-medium text-slate-700">Signups by method:</span>
            {stats.signupMethodBreakdown.map(({ method, count }) => (
              <span key={method} className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                {method === "email" ? "Email" : method === "google" ? "Google" : "Unknown"}: {count}
              </span>
            ))}
          </div>
        )}

        <div>
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Firms &amp; Bookkeepers</h2>
          <PlatformFirmsTable rows={firmRows} />
        </div>
      </div>
    );
  }

  // Encoder's home page is deliberately minimal, per Team & Roles' spec:
  // their own drafts and an add-entry button — no totals, no reports, no
  // dashboard aggregates. Kept as its own branch rather than folded into
  // the firm-facing one below, which fetches exactly the kind of firm-wide
  // aggregate data (client counts, attention stats, deadlines) this role
  // should never even request — requireReportAccess() backstops this
  // server-side everywhere else (reports, the firm dashboard's own stat
  // row), but this branch just never calls that data in the first place.
  //
  // `listFirmDrafts(user.id)` needs no createdBy filter here — every draft
  // on a client this Encoder can access, not just their own, which is what
  // this page's title actually shows since 014_encoder_read_all_client_
  // entries.sql widened Encoder's read scope past "only entries I created."
  // Editing/deleting an existing draft has full UI now (the entry detail
  // page's Edit/Delete, RLS-backed exactly as tested in
  // db/__tests__/team-roles-rls.test.ts) — reached via a draft's own link
  // below, not duplicated on this page.
  if (user.role === "encoder") {
    const [drafts, clientRows] = await Promise.all([listFirmDrafts(user.id), listClients(user.id)]);
    const clientOptions = clientRows.map((c) => ({ id: c.id, registeredName: c.registeredName }));

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight">My Drafts</h1>
          <div className="flex flex-wrap items-center gap-2">
            <EncoderReceiptPicker clients={clientOptions} />
            <EncoderTransactionsPicker clients={clientOptions} />
            <EncoderClientPicker clients={clientOptions} />
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <ul className="divide-y divide-slate-100">
            {drafts.map((d) => (
              <li key={d.id} className="px-4 py-3 text-sm">
                <Link href={`/clients/${d.clientId}/transactions/${d.id}`} className="font-medium text-slate-900 hover:underline">
                  {d.description}
                </Link>
                <div className="mt-0.5 text-xs text-slate-600">
                  {d.clientName} · <span className="text-amber-700">Draft</span> · {d.entryDate}
                </div>
              </li>
            ))}
            {drafts.length === 0 && (
              <li className="px-4 py-10 text-center text-sm text-slate-500">No drafts yet — pick a client above to add one.</li>
            )}
          </ul>
        </div>
      </div>
    );
  }

  const [{ clients, draftCount }, recentActivity, clientLastActivity, drafts, upcomingDeadlines] = await Promise.all([
    getFirmDashboardStats(user.id),
    user.role === "firm_admin" ? listRecentAuditLog(user.id, 8) : Promise.resolve([]),
    getClientLastActivity(user.id),
    listFirmDrafts(user.id),
    listUpcomingDeadlines(user.id),
  ]);
  const needsAttention = drafts.slice(0, 6);
  const activeClientIds = clients.filter((c) => c.status === "active").map((c) => c.id);
  // Depends on `clients` and `clientLastActivity` above (reuses them rather
  // than re-fetching), so it can't join the initial Promise.all — only the
  // one genuinely new query (last activity 7 days ago) runs here.
  const clientAttention = await getClientAttentionStat(user.id, activeClientIds, clientLastActivity);

  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setUTCDate(weekAgo.getUTCDate() - 7);
  const totalClients: PeriodStat = {
    current: clients.length,
    previous: clients.filter((c) => new Date(c.createdAt) <= weekAgo).length,
  };

  // "Due in the next 30 days" — includes anything already overdue too
  // (an overdue due date is trivially <= today+30), which is the right
  // read for a card that's meant to flag what needs action soon.
  const in30Days = new Date(now);
  in30Days.setUTCDate(in30Days.getUTCDate() + 30);
  const in30DaysIso = in30Days.toISOString().slice(0, 10);
  const upcomingDeadlineCount = upcomingDeadlines.filter((d) => d.dueDateIso <= in30DaysIso).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Firm Dashboard</h1>
        {(user.role === "firm_admin" || user.role === "bookkeeper") && (
          <div className="flex items-center gap-2">
            <QuickPostPicker clients={clients.map((c) => ({ id: c.id, registeredName: c.registeredName }))} />
            <Link
              href="/clients/new"
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              + Add Client
            </Link>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Clients" stat={totalClients} icon={Building2} accent={ACCENT_BLUE} deltaCaption="vs last week" />
        <StatCard
          label="Clients Needing Attention"
          stat={clientAttention}
          icon={AlertTriangle}
          accent={ACCENT_ORANGE}
          deltaCaption="vs last week"
          goodDirection="down"
        />
        <StatCard label="Unposted Drafts" stat={draftCount} icon={FileEdit} accent={ACCENT_AQUA} href="/drafts" warnWhenPositive />
        <StatCard label="Upcoming Deadlines" stat={upcomingDeadlineCount} icon={CalendarClock} accent={ACCENT_YELLOW} caption="Next 30 days" />
      </div>

      <DeadlinesWidget deadlines={upcomingDeadlines} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Recent Clients</h2>
            <Link href="/clients" className="text-sm text-slate-600 hover:underline">
              View all →
            </Link>
          </div>
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <tbody className="divide-y divide-slate-100">
                {clients.slice(0, 8).map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/clients/${c.id}`} className="font-medium text-slate-900 hover:underline">
                        {c.registeredName}
                      </Link>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium capitalize text-slate-700">
                          {c.taxpayerType.replace("_", " ")}
                        </span>
                        <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                          {VAT_LABELS[c.vatStatus]}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{c.tin}</td>
                    <td className="px-4 py-3 capitalize text-slate-700">{c.status}</td>
                    <td className="px-4 py-3">
                      <ActivityBadge lastActiveAt={clientLastActivity.get(c.id) ?? null} />
                    </td>
                  </tr>
                ))}
                {clients.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                      No clients yet. <Link href="/clients/new" className="underline">Create one</Link>.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Needs Attention</h2>
              <Link href="/drafts" className="text-sm text-slate-600 hover:underline">
                View all →
              </Link>
            </div>
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <ul className="divide-y divide-slate-100">
                {needsAttention.map((d) => (
                  <li key={d.id} className="px-4 py-3 text-sm">
                    <Link href={`/clients/${d.clientId}/transactions/${d.id}`} className="font-medium text-slate-900 hover:underline">
                      {d.description}
                    </Link>
                    <div className="mt-0.5 text-xs text-slate-600">
                      {d.clientName} · <span className="text-amber-700">Draft</span> · {d.entryDate}
                    </div>
                  </li>
                ))}
                {needsAttention.length === 0 && (
                  <li className="px-4 py-8 text-center text-sm text-slate-500">Nothing unposted — you're caught up.</li>
                )}
              </ul>
            </div>
          </div>

          {user.role === "firm_admin" && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">Recent Activity</h2>
                <Link href="/settings/audit-log" className="text-sm text-slate-600 hover:underline">
                  View all →
                </Link>
              </div>
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <ul className="divide-y divide-slate-100">
                  {recentActivity.map((a) => (
                    <li key={a.id} className="px-4 py-3 text-sm">
                      <div className={a.action === "LOGIN_FAILED" ? "font-medium text-amber-800" : "text-slate-900"}>{a.description}</div>
                      <div className="mt-0.5 text-xs text-slate-600">
                        {a.actorName} · {a.createdAt.toISOString().replace("T", " ").slice(0, 16)}
                      </div>
                    </li>
                  ))}
                  {recentActivity.length === 0 && (
                    <li className="px-4 py-8 text-center text-sm text-slate-500">No activity logged yet.</li>
                  )}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
