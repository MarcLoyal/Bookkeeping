import { requireFirmAdmin } from "@/lib/auth/current-user";
import { listTaxRules } from "@/lib/data/tax-rules";

export default async function TaxRulesPage() {
  const user = await requireFirmAdmin();
  const rules = await listTaxRules(user.id);

  return (
    <div>
      <h2 className="text-lg font-semibold">Tax Rules</h2>
      <p className="mt-1 text-sm text-slate-500">
        Rates and thresholds live here, never as a literal in application code (rule #6). Seeded values are a
        starting point requiring CPA verification before real filing use — see DECISIONS.md.
      </p>

      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">Key</th>
              <th className="px-4 py-2 text-right">Value</th>
              <th className="px-4 py-2">Effective From</th>
              <th className="px-4 py-2">Effective To</th>
              <th className="px-4 py-2">Last Verified</th>
              <th className="px-4 py-2">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rules.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2 font-mono text-xs">{r.key}</td>
                <td className="px-4 py-2 text-right font-mono">{r.value}</td>
                <td className="px-4 py-2 text-xs text-slate-500">{r.effectiveFrom}</td>
                <td className="px-4 py-2 text-xs text-slate-500">{r.effectiveTo ?? "—"}</td>
                <td className="px-4 py-2 text-xs text-slate-500">
                  {r.lastVerifiedAt ? `${r.lastVerifiedAt.toISOString().slice(0, 10)} by ${r.lastVerifiedBy ?? "?"}` : "Not yet verified"}
                </td>
                <td className="px-4 py-2 text-xs text-slate-500">{r.notes}</td>
              </tr>
            ))}
            {rules.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  No tax rules yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
