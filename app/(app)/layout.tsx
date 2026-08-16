import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/current-user";
import { logoutAction } from "./logout-action";

const ROLE_LABELS: Record<string, string> = {
  firm_admin: "Firm Admin",
  bookkeeper: "Bookkeeper",
  reviewer: "Reviewer",
  client_user: "Client",
};

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
            <form action={logoutAction}>
              <button type="submit" className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-100">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
