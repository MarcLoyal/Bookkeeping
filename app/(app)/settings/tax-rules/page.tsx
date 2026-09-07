import { requireFirmAdmin } from "@/lib/auth/current-user";
import { listTaxRules } from "@/lib/data/tax-rules";
import { listSssBrackets } from "@/lib/data/payroll";
import { formatCentavos } from "@/lib/money";
import { AddTaxRuleForm } from "./add-tax-rule-form";
import { AddSssBracketForm } from "./add-sss-bracket-form";

export default async function TaxRulesPage() {
  const user = await requireFirmAdmin();
  const [rules, sssBrackets] = await Promise.all([listTaxRules(user.id), listSssBrackets(user.id)]);

  return (
    <div>
      <h2 className="text-lg font-semibold">Tax Rules</h2>
      <p className="mt-1 text-sm text-slate-500">
        Rates and thresholds live here, never as a literal in application code (rule #6). Seeded values are a
        starting point requiring CPA verification before real filing use — see DECISIONS.md. A new value is always
        added as a new row (with its own Effective From date) rather than editing history.
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
        <div className="border-t border-slate-200 bg-slate-50 p-4">
          <AddTaxRuleForm />
        </div>
      </div>

      <h2 className="mt-8 text-lg font-semibold">SSS Contribution Brackets</h2>
      <p className="mt-1 text-sm text-slate-500">
        SSS publishes its schedule as an exact peso amount per salary bracket, not a flat rate — this app doesn&apos;t
        seed it (no verified current source available; see DECISIONS.md &quot;Payroll subsystem&quot;). Enter the
        current schedule here before running payroll. PhilHealth and Pag-IBIG use plain Tax Rules keys instead
        (<code className="font-mono text-xs">philhealth_rate</code>, <code className="font-mono text-xs">philhealth_salary_floor</code>,{" "}
        <code className="font-mono text-xs">philhealth_salary_ceiling</code>, <code className="font-mono text-xs">pagibig_rate_ee</code>,{" "}
        <code className="font-mono text-xs">pagibig_rate_er</code>, <code className="font-mono text-xs">pagibig_salary_cap</code>) — add
        them above.
      </p>

      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 text-right">Min Salary</th>
              <th className="px-4 py-2 text-right">Max Salary</th>
              <th className="px-4 py-2 text-right">Employee Share</th>
              <th className="px-4 py-2 text-right">Employer Share</th>
              <th className="px-4 py-2 text-right">EC (Employer)</th>
              <th className="px-4 py-2">Effective From</th>
              <th className="px-4 py-2">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sssBrackets.map((b) => (
              <tr key={b.id}>
                <td className="px-4 py-2 text-right font-mono">{formatCentavos(b.minSalaryCentavos)}</td>
                <td className="px-4 py-2 text-right font-mono">{b.maxSalaryCentavos !== null ? formatCentavos(b.maxSalaryCentavos) : "No cap"}</td>
                <td className="px-4 py-2 text-right font-mono">{formatCentavos(b.employeeShareCentavos)}</td>
                <td className="px-4 py-2 text-right font-mono">{formatCentavos(b.employerShareCentavos)}</td>
                <td className="px-4 py-2 text-right font-mono">{formatCentavos(b.ecEmployerShareCentavos)}</td>
                <td className="px-4 py-2 text-xs text-slate-500">{b.effectiveFrom}</td>
                <td className="px-4 py-2 text-xs text-slate-500">{b.notes}</td>
              </tr>
            ))}
            {sssBrackets.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                  No SSS brackets yet — payroll runs will fail until at least one covers the pay date.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="border-t border-slate-200 bg-slate-50 p-4">
          <AddSssBracketForm />
        </div>
      </div>
    </div>
  );
}
