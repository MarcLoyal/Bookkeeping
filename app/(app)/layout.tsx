import Link from "next/link";
import { LayoutDashboard, ShieldCheck } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { logoutAction } from "./logout-action";

const ROLE_LABELS: Record<string, string> = {
  firm_admin: "Firm Admin",
  bookkeeper: "Bookkeeper",
  reviewer: "Reviewer",
  client_user: "Client",
  platform_admin: "Platform Admin",
};

const PLATFORM_ADMIN_NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/settings/platform-admins", label: "Platform Admins", icon: ShieldCheck },
];

function SignOutButton() {
  return (
    <form action={logoutAction}>
      <button type="submit" className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-100">
        Sign out
      </button>
    </form>
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
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  // Platform admins get their own sidebar+topbar shell — this is a
  // dedicated app-within-the-app for the two platform_admin-only routes
  // (/dashboard, /settings/platform-admins), kept separate from the
  // firm-facing top-nav below rather than merged into one nav that has to
  // branch on every link.
  if (user?.role === "platform_admin") {
    return (
      <div className="flex min-h-screen">
        <aside className="no-print flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-4">
            <Link href="/dashboard" prefetch={false} className="text-lg font-bold tracking-tight">
              Keep.Books
            </Link>
          </div>
          <nav className="flex-1 space-y-0.5 px-2 py-3">
            {PLATFORM_ADMIN_NAV.map(({ href, label, icon: Icon }) => (
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
          <main className="flex-1 px-6 py-6">{children}</main>
        </div>
      </div>
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
              {user && user.role !== "client_user" && (
                <Link href="/clients" prefetch={false} className="hover:text-slate-900">
                  Clients
                </Link>
              )}
              {user?.role === "firm_admin" && (
                <Link href="/settings/tax-rules" prefetch={false} className="hover:text-slate-900">
                  Tax Rules
                </Link>
              )}
              {user?.role === "firm_admin" && (
                <Link href="/settings/audit-log" prefetch={false} className="hover:text-slate-900">
                  Audit Log
                </Link>
              )}
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
