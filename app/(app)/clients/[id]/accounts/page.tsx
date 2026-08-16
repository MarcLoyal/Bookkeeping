import { requireCurrentUser } from "@/lib/auth/current-user";
import { listAccounts } from "@/lib/data/accounts";

const TYPE_ORDER = ["asset", "liability", "equity", "income", "expense"] as const;
const TYPE_LABELS: Record<string, string> = {
  asset: "Assets",
  liability: "Liabilities",
  equity: "Equity",
  income: "Income",
  expense: "Expenses",
};

export default async function AccountsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCurrentUser();
  const { id } = await params;
  const accounts = await listAccounts(user.id, id);

  return (
    <div>
      <h2 className="text-lg font-semibold">Chart of Accounts</h2>
      <p className="mt-1 text-sm text-slate-500">{accounts.length} accounts, seeded from the PH SME template.</p>

      <div className="mt-4 space-y-6">
        {TYPE_ORDER.map((type) => {
          const group = accounts.filter((a) => a.type === type);
          if (group.length === 0) return null;
          return (
            <div key={type} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {TYPE_LABELS[type]}
              </div>
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <tbody className="divide-y divide-slate-100">
                  {group.map((a) => (
                    <tr key={a.id} className={!a.active ? "opacity-50" : ""}>
                      <td className="w-24 px-4 py-2 font-mono text-xs text-slate-500">{a.code}</td>
                      <td className="px-4 py-2">{a.name}</td>
                      <td className="px-4 py-2 text-right text-xs uppercase text-slate-400">{a.normalBalance}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </div>
  );
}
