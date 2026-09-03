"use client";

import { useRef, useState } from "react";
import { useJsonPost } from "@/lib/use-json-post";
import { formatTin } from "@/lib/tin-format";

const inputClass =
  "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500";
const errorInputClass =
  "mt-1 block w-full rounded-md border border-red-400 px-3 py-2 text-sm shadow-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500";
const labelClass = "block text-sm font-medium text-slate-700";
const requiredMark = <span className="text-red-600"> *</span>;

export function NewContactForm({ clientId }: { clientId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [tin, setTin] = useState("");
  const { submit, error, field, pending } = useJsonPost<Record<string, string>>(
    `/api/clients/${clientId}/contacts`,
    () => `/clients/${clientId}/contacts`
  );

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    submit(Object.fromEntries(formData) as Record<string, string>);
  }

  function fieldError(name: string) {
    if (field !== name) return null;
    return <p className="mt-1 text-xs text-red-600">{error}</p>;
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="registeredName">Name{requiredMark}</label>
          <input
            id="registeredName"
            name="registeredName"
            required
            className={field === "registeredName" ? errorInputClass : inputClass}
          />
          {fieldError("registeredName")}
        </div>
        <div>
          <label className={labelClass} htmlFor="type">Type{requiredMark}</label>
          <select id="type" name="type" required className={inputClass} defaultValue="customer">
            <option value="customer">Customer</option>
            <option value="supplier">Supplier</option>
            <option value="both">Customer &amp; Supplier</option>
            <option value="employee">Employee</option>
          </select>
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
          <p className="mt-1 text-xs text-amber-600">Required before this contact can appear on the SLSP.</p>
        </div>
        <div>
          <label className={labelClass} htmlFor="vatStatus">VAT Status (optional)</label>
          <select id="vatStatus" name="vatStatus" className={inputClass} defaultValue="">
            <option value="">Unknown / not set</option>
            <option value="vat">VAT-Registered</option>
            <option value="non_vat">Non-VAT (Percentage Tax)</option>
            <option value="vat_exempt">VAT-Exempt</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="address">Address (optional)</label>
          <input
            id="address"
            name="address"
            className={field === "address" ? errorInputClass : inputClass}
          />
          {fieldError("address")}
        </div>
      </div>

      {error && !field && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {pending ? "Creating..." : "Create Contact"}
      </button>
    </form>
  );
}
