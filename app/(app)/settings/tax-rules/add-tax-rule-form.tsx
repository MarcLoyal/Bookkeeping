"use client";

import { useJsonPost } from "@/lib/use-json-post";

const inputClass =
  "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500";
const errorInputClass =
  "mt-1 block w-full rounded-md border border-red-400 px-3 py-2 text-sm shadow-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500";
const labelClass = "block text-xs font-medium text-slate-700";

export function AddTaxRuleForm() {
  const { submit, error, field, pending } = useJsonPost<Record<string, string>>("/api/settings/tax-rules", () => "/settings/tax-rules");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    submit(Object.fromEntries(formData) as Record<string, string>);
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-5 sm:items-end">
      <div>
        <label className={labelClass} htmlFor="tr-key">Key</label>
        <input id="tr-key" name="key" required placeholder="e.g. philhealth_rate" className={field === "key" ? errorInputClass : inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="tr-value">Value</label>
        <input id="tr-value" name="value" required placeholder="0.05" className={field === "value" ? errorInputClass : inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="tr-effectiveFrom">Effective From</label>
        <input id="tr-effectiveFrom" name="effectiveFrom" type="date" required className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="tr-notes">Notes</label>
        <input id="tr-notes" name="notes" className={inputClass} />
      </div>
      <div>
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? "Adding..." : "Add Rule"}
        </button>
      </div>
      {error && <p className="text-sm text-red-600 sm:col-span-5">{error}</p>}
    </form>
  );
}
