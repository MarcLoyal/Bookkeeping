"use client";

import { useJsonPost } from "@/lib/use-json-post";

const inputClass =
  "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500";
const errorInputClass =
  "mt-1 block w-full rounded-md border border-red-400 px-3 py-2 text-sm shadow-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500";
const labelClass = "block text-xs font-medium text-slate-700";

export function AddSssBracketForm() {
  const { submit, error, field, pending } = useJsonPost<Record<string, string>>("/api/settings/sss-brackets", () => "/settings/tax-rules");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    submit(Object.fromEntries(formData) as Record<string, string>);
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
      <div>
        <label className={labelClass} htmlFor="sb-minSalary">Min Salary</label>
        <input id="sb-minSalary" name="minSalary" required placeholder="0.00" className={field === "minSalary" ? errorInputClass : inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="sb-maxSalary">Max Salary (blank = no cap)</label>
        <input id="sb-maxSalary" name="maxSalary" placeholder="10000.00" className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="sb-employeeShare">Employee Share</label>
        <input id="sb-employeeShare" name="employeeShare" required placeholder="0.00" className={field === "employeeShare" ? errorInputClass : inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="sb-employerShare">Employer Share</label>
        <input id="sb-employerShare" name="employerShare" required placeholder="0.00" className={field === "employerShare" ? errorInputClass : inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="sb-ecEmployerShare">EC (Employer, optional)</label>
        <input id="sb-ecEmployerShare" name="ecEmployerShare" placeholder="0.00" className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="sb-effectiveFrom">Effective From</label>
        <input id="sb-effectiveFrom" name="effectiveFrom" type="date" required className={inputClass} />
      </div>
      <div className="sm:col-span-2">
        <label className={labelClass} htmlFor="sb-notes">Notes</label>
        <input id="sb-notes" name="notes" className={inputClass} />
      </div>
      <div className="sm:col-span-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? "Adding..." : "Add Bracket"}
        </button>
      </div>
      {error && <p className="text-sm text-red-600 sm:col-span-4">{error}</p>}
    </form>
  );
}
