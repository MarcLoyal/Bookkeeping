import { requireCurrentUser } from "@/lib/auth/current-user";
import { listContacts } from "@/lib/data/contacts";

const TYPE_LABELS: Record<string, string> = {
  customer: "Customer",
  supplier: "Supplier",
  both: "Customer & Supplier",
  employee: "Employee",
};

export default async function ContactsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCurrentUser();
  const { id } = await params;
  const contacts = await listContacts(user.id, id);

  return (
    <div>
      <h2 className="text-lg font-semibold">Contacts</h2>
      <p className="mt-1 text-sm text-slate-500">{contacts.length} customers &amp; suppliers.</p>

      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">TIN</th>
              <th className="px-4 py-3">Address</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {contacts.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">{c.registeredName}</td>
                <td className="px-4 py-3 text-slate-600">{TYPE_LABELS[c.type]}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-600">
                  {c.tin || <span className="text-amber-600">missing — required for SLSP</span>}
                </td>
                <td className="px-4 py-3 text-slate-600">{c.address}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
