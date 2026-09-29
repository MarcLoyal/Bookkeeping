import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getClient, recordClientView } from "@/lib/data/clients";

const TABS = [
  { href: "", label: "Overview" },
  { href: "/accounts", label: "Chart of Accounts" },
  { href: "/contacts", label: "Contacts" },
  { href: "/employees", label: "Employees" },
  { href: "/payroll", label: "Payroll" },
  { href: "/transactions", label: "Transactions" },
  { href: "/books/GJ", label: "Books" },
  { href: "/reports/trial-balance", label: "Reports" },
];

/**
 * Deliberately does NOT redirect/404 on a missing session or client here —
 * see app/(app)/layout.tsx for why: this layout persists across a Server
 * Action's internal re-render pass, where a redirect()/notFound() thrown
 * from a layout's cookies() read can incorrectly hijack an authenticated
 * mutation. Real enforcement happens in each page (which reliably sees the
 * session in that same pass) via requireCurrentUser() + getClient()'s RLS
 * scoping; this layout only renders the tab chrome when it can.
 */
export default async function ClientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  const { id } = await params;
  const client = user ? await getClient(user.id, id) : null;

  if (!client) {
    return <div>{children}</div>;
  }

  // Best-effort, never blocks rendering: this is sidebar-navigation
  // metadata (see getRecentClientsForUser()), not something any page's
  // correctness depends on. `user` is guaranteed defined here — `client`
  // only resolved because `getClient(user.id, id)` was called above.
  //
  // Logged with a distinct, greppable prefix and every field a postgres.js
  // error actually carries (code/detail/hint, not just .message) — a
  // missing GRANT or a rejected RLS check both throw here, and "swallowed
  // silently" is exactly what made the real-project version of this bug
  // (016_user_client_views_grant.sql) invisible until someone went and
  // queried the table directly. Still never rethrown: a page that
  // otherwise loaded fine shouldn't 500 over navigation-history metadata.
  // Logs unconditionally, not just on failure: the only way to tell "this
  // code never ran" (stale deploy, a route not actually going through this
  // layout, etc.) apart from "it ran and failed silently" from the outside
  // is to have a log line for the attempt itself, not just the catch.
  console.log("[ClientLayout] recording client view", { userId: user!.id, clientId: id });
  try {
    await recordClientView(user!.id, id);
    console.log("[ClientLayout] client view recorded", { userId: user!.id, clientId: id });
  } catch (err) {
    const pgErr = err as { code?: string; detail?: string; hint?: string; message?: string };
    console.error("[recordClientView] failed to record a client view", {
      userId: user!.id,
      clientId: id,
      code: pgErr?.code,
      message: pgErr?.message,
      detail: pgErr?.detail,
      hint: pgErr?.hint,
    });
  }

  // Encoder's only legitimate pages under a client are the draft-entry
  // form and viewing their own draft — Accounts/Contacts/Employees/
  // Payroll/Books/Reports are all things this role has no reason to
  // browse (several are exactly the "no reports/balances" the role spec
  // rules out), so the tab bar itself is skipped rather than shown and
  // relying on each destination to turn them away.
  const showTabs = user?.role !== "encoder";

  return (
    <div>
      <nav className="no-print mb-2 flex items-center gap-1.5 text-sm text-slate-500" aria-label="Breadcrumb">
        <Link href="/dashboard" className="hover:text-slate-900 hover:underline">
          Dashboard
        </Link>
        <span aria-hidden="true">/</span>
        <Link href="/clients" className="hover:text-slate-900 hover:underline">
          Clients
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-slate-700">{client.registeredName}</span>
      </nav>
      <div className="no-print mb-4">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{client.registeredName}</h1>
          <span className="text-sm text-slate-600">{client.tin}</span>
        </div>
        {client.tradeName && <p className="text-sm text-slate-600">{client.tradeName}</p>}
      </div>
      {showTabs && (
        <nav className="no-print mb-6 flex gap-1 border-b border-slate-200">
          {TABS.map((tab) => (
            <Link
              key={tab.href}
              href={`/clients/${id}${tab.href}`}
              className="rounded-t-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      )}
      {children}
    </div>
  );
}
