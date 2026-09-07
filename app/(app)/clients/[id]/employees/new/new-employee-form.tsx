"use client";

import { useState } from "react";
import { useJsonPost } from "@/lib/use-json-post";
import { formatTin } from "@/lib/tin-format";
import { PhAddressCascade } from "@/components/ph-address-cascade";

const inputClass =
  "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500";
const errorInputClass =
  "mt-1 block w-full rounded-md border border-red-400 px-3 py-2 text-sm shadow-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500";
const labelClass = "block text-sm font-medium text-slate-700";
const requiredMark = <span className="text-red-600"> *</span>;

export function NewEmployeeForm({ clientId }: { clientId: string }) {
  const [tin, setTin] = useState("");
  const [address, setAddress] = useState("");
  const { submit, error, field, pending } = useJsonPost<Record<string, string>>(
    `/api/clients/${clientId}/employees`,
    () => `/clients/${clientId}/employees`
  );

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const body = Object.fromEntries(formData) as Record<string, string>;
    body.isMinimumWageEarner = formData.get("isMinimumWageEarner") ? "yes" : "no";
    submit(body);
  }

  function fieldError(name: string) {
    if (field !== name) return null;
    return <p className="mt-1 text-xs text-red-600">{error}</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="registeredName">Name{requiredMark}</label>
          <input id="registeredName" name="registeredName" required className={field === "registeredName" ? errorInputClass : inputClass} />
          {fieldError("registeredName")}
        </div>
        <div>
          <label className={labelClass} htmlFor="position">Position (optional)</label>
          <input id="position" name="position" className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="employeeNo">Employee No. (optional)</label>
          <input id="employeeNo" name="employeeNo" className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="tin">TIN (optional)</label>
          <input
            id="tin"
            name="tin"
            value={tin}
            onChange={(e) => setTin(formatTin(e.target.value))}
            placeholder="000-000-000-00000"
            pattern="\d{3}-\d{3}-\d{3}-\d{5}"
            title="Format: 000-000-000-00000 (9-digit TIN + 5-digit branch code, dashes included)"
            inputMode="numeric"
            className={field === "tin" ? errorInputClass : inputClass}
          />
          {fieldError("tin")}
        </div>
        <div>
          <label className={labelClass} htmlFor="sssNo">SSS No. (optional)</label>
          <input id="sssNo" name="sssNo" className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="philhealthNo">PhilHealth No. (optional)</label>
          <input id="philhealthNo" name="philhealthNo" className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="pagibigNo">Pag-IBIG No. (optional)</label>
          <input id="pagibigNo" name="pagibigNo" className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="payFrequency">Pay Frequency{requiredMark}</label>
          <select id="payFrequency" name="payFrequency" required className={inputClass} defaultValue="monthly">
            <option value="monthly">Monthly</option>
            <option value="semi_monthly">Semi-Monthly</option>
          </select>
          <p className="mt-1 text-xs text-slate-500">Daily/weekly aren&apos;t supported — no attendance tracking in this app.</p>
        </div>
        <div>
          <label className={labelClass} htmlFor="basicPay">Basic Pay per Payslip{requiredMark}</label>
          <input
            id="basicPay"
            name="basicPay"
            required
            inputMode="decimal"
            placeholder="0.00"
            className={field === "basicPay" ? errorInputClass : inputClass}
          />
          {fieldError("basicPay")}
          <p className="mt-1 text-xs text-slate-500">The amount paid per regular payslip at the frequency above, not a monthly-equivalent rate.</p>
        </div>
        <div>
          <label className={labelClass} htmlFor="dateHired">Date Hired{requiredMark}</label>
          <input id="dateHired" name="dateHired" type="date" required className={field === "dateHired" ? errorInputClass : inputClass} />
          {fieldError("dateHired")}
        </div>
        <div className="flex items-center gap-2 sm:col-span-2">
          <input id="isMinimumWageEarner" name="isMinimumWageEarner" type="checkbox" className="h-4 w-4 rounded border-slate-300" />
          <label htmlFor="isMinimumWageEarner" className="text-sm text-slate-700">
            Minimum Wage Earner (fully exempt from withholding tax)
          </label>
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass}>Address (optional)</label>
          <input type="hidden" name="address" value={address} />
          <PhAddressCascade onChange={setAddress} />
        </div>
      </div>

      {error && !field && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {pending ? "Creating..." : "Create Employee"}
      </button>
    </form>
  );
}
