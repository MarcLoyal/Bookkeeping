import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getClient } from "@/lib/data/clients";

const TABS = [
  { href: "", label: "Overview" },
  { href: "/accounts", label: "Chart of Accounts" },
  { href: "/contacts", label: "Contacts" },
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
      {children}
    </div>
  );
}
