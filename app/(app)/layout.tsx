import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, History, LayoutDashboard, Percent, ShieldCheck, UserPlus, Users } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import type { Role } from "@/lib/auth/current-user";
import { getRecentClientsForUser, type RecentClientRow } from "@/lib/data/clients";
import { getFirmPlanStatus, type FirmPlanStatus } from "@/lib/data/firm-plan-status";
import { logoutAction } from "./logout-action";
import { PlanStatusBanner } from "./plan-status-banner";

const ROLE_LABELS: Record<string, string> = {
  firm_admin: "Owner",
  bookkeeper: "Bookkeeper",
  reviewer: "Reviewer",
  client_user: "Client",
  platform_admin: "Platform Admin",
  encoder: "Encoder",
  viewer: "Viewer",
};

type NavItem = { href: string; label: string; icon: LucideIcon };

const PLATFORM_ADMIN_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/settings/platform-admins", label: "Platform Admins", icon: ShieldCheck },
  { href: "/settings/platform-admins/trials", label: "Expired Trials", icon: AlertTriangle },
];

/**
 * firm_admin/bookkeeper/reviewer/viewer nav — Tax Rules/Audit Log stay
 * firm_admin-only. Encoder gets its own minimal nav (just Dashboard — no
 * Clients link; their home page's own client picker covers "which client
 * am I encoding for," and they have no reason to browse the general
 * client list, which reviewer/viewer/bookkeeper use for its
 * activity/status view, not a task encoder does at all).
 */
function staffNav(role: Role): NavItem[] {
  if (role === "encoder") {
    return [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }];
  }
  const items: NavItem[] = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/clients", label: "Clients", icon: Users },
  ];
  if (role === "firm_admin" || role === "bookkeeper") {
    items.push({ href: "/settings/team", label: "Team", icon: UserPlus });
  }
  if (role === "firm_admin") {
    items.push({ href: "/settings/tax-rules", label: "Tax Rules", icon: Percent }, { href: "/settings/audit-log", label: "Audit Log", icon: History });
  }
  return items;
}

function SignOutButton() {
  return (
    <form action={logoutAction}>
      <button type="submit" className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-100">
        Sign out
      </button>
    </form>
  );
}

/** Shared by platform_admin and firm-staff roles — only the nav item list differs. client_user keeps the original top-nav below (it never had sidebar-worthy nav to begin with). */
function SidebarShell({
  user,
  navItems,
  recentClients,
  planStatus,
  children,
}: {
  user: { name: string; role: Role };
  navItems: NavItem[];
  /** Every firm-staff role (not platform_admin, which has no per-client "clients" in this sense) — see getRecentClientsForUser's own doc comment for what "recent" means here. Undefined/empty just renders no section at all. */
  recentClients?: RecentClientRow[];
  /** Owner (firm_admin) only — see AppLayout below. undefined for every other role, which PlanStatusBanner renders as nothing. */
  planStatus?: FirmPlanStatus | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <aside className="no-print flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-4">
          <Link href="/dashboard" prefetch={false} className="text-lg font-bold tracking-tight">
            Keep.Books
          </Link>
        </div>
        <nav className="flex-1 space-y-0.5 px-2 py-3">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              prefetch={false}
              className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </Link>
          ))}
          {recentClients && recentClients.length > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-3">
              <p className="px-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Recent clients</p>
              <div className="mt-1 space-y-0.5">
                {recentClients.map((c) => (
                  <Link
                    key={c.id}
                    href={`/clients/${c.id}/transactions`}
                    prefetch={false}
                    className="block truncate rounded-md px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    title={c.name}
                  >
                    {c.name}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </nav>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="no-print border-b border-slate-200 bg-white">
          <div className="flex items-center justify-between px-6 py-3">
            <span className="text-sm text-slate-500">
              Welcome, <span className="font-medium text-slate-700">{user.name}</span> ·{" "}
              <span className="font-medium text-slate-700">{ROLE_LABELS[user.role]}</span>
            </span>
            <SignOutButton />
          </div>
        </header>
        <main className="flex-1 px-6 py-6">
          {planStatus !== undefined && <PlanStatusBanner status={planStatus} />}
          {children}
        </main>
      </div>
    </div>
  );
}

/**
 * Deliberately does NOT call requireCurrentUser() (which redirects on a
 * missing session). middleware.ts already enforces auth at the edge before
 * any request reaches here, and every page additionally calls
 * requireCurrentUser()/requireStaffUser() itself. Layouts persist across a
 * Server Action's internal re-render pass, where — in this Next.js version —
 * a redirect() thrown from a layout's cookies() read incorrectly bounces an
 * authenticated mutation to /login. Falling back to a degraded (but present)
 * shell instead of throwing keeps that pass harmless.
 */
const SIDEBAR_ROLES = new Set<Role>(["platform_admin", "firm_admin", "bookkeeper", "reviewer", "encoder", "viewer"]);

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  // platform_admin and every firm-staff role get the same sidebar+topbar
  // shell, just with a different nav item list — one shared component
  // (SidebarShell above) rather than near-duplicate JSX per role.
  // client_user keeps the original top-nav below: it never had
  // sidebar-worthy nav (no Clients/Tax Rules/Audit Log access), and its
  // one real page (/clients/[id]) is reached via an immediate redirect
  // from /dashboard, not by using this nav at all.
  if (user && SIDEBAR_ROLES.has(user.role)) {
    const navItems = user.role === "platform_admin" ? PLATFORM_ADMIN_NAV : staffNav(user.role);
    // Every firm-staff role gets Recent Clients — platform_admin's "clients"
    // (the platform firms table) aren't per-client pages this layout ever
    // wraps, so there's nothing for getRecentClientsForUser() to reflect.
    //
    // Caught rather than left to throw: this section failing to load is
    // not a reason to fail the whole page (same reasoning as every other
    // best-effort read in this app).
    let recentClients: RecentClientRow[] | undefined;
    if (user.role !== "platform_admin") {
      try {
        recentClients = await getRecentClientsForUser(user.id);
      } catch (err) {
        const pgErr = err as { code?: string; message?: string; detail?: string; hint?: string };
        console.error("[AppLayout] getRecentClientsForUser failed", {
          userId: user.id,
          role: user.role,
          code: pgErr?.code,
          message: pgErr?.message,
          detail: pgErr?.detail,
          hint: pgErr?.hint,
        });
        recentClients = undefined;
      }
    }

    // Owner only — "Banner shown to the Owner" (see PlanStatusBanner's own
    // doc comment). Best-effort, same reasoning as recentClients above:
    // this notice failing to load is never a reason to fail the page.
    let planStatus: FirmPlanStatus | null | undefined;
    if (user.role === "firm_admin") {
      try {
        planStatus = await getFirmPlanStatus(user.id);
      } catch (err) {
        console.error("[AppLayout] getFirmPlanStatus failed", { userId: user.id, err });
        planStatus = undefined;
      }
    }

    return (
      <SidebarShell user={user} navItems={navItems} recentClients={recentClients} planStatus={planStatus}>
        {children}
      </SidebarShell>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="no-print border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" prefetch={false} className="text-lg font-bold tracking-tight">
              Keep.Books
            </Link>
            <nav className="flex gap-4 text-sm text-slate-600">
              <Link href="/dashboard" prefetch={false} className="hover:text-slate-900">
                Dashboard
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            {user && (
              <span className="text-slate-500">
                {user.name} · <span className="font-medium text-slate-700">{ROLE_LABELS[user.role]}</span>
              </span>
            )}
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
