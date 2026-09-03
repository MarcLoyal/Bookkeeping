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

export function NewClientForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [tin, setTin] = useState("");
  const { submit, error, field, pending } = useJsonPost<Record<string, string>>(
    "/api/clients",
    (data) => `/clients/${data.id}`
  );

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    submit(Object.fromEntries(formData) as Record<string, string>);
  }

  // Renders the server's error message right under the field it's actually
  // about, instead of one undifferentiated line at the bottom of the form.
  function fieldError(name: string) {
    if (field !== name) return null;
    return <p className="mt-1 text-xs text-red-600">{error}</p>;
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-5 rounded-lg border border-slate-200 bg-white p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="registeredName">Registered Name{requiredMark}</label>
          <input
            id="registeredName"
            name="registeredName"
            required
            className={field === "registeredName" ? errorInputClass : inputClass}
          />
          {fieldError("registeredName")}
        </div>
        <div>
          <label className={labelClass} htmlFor="tradeName">Trade Name (optional)</label>
          <input id="tradeName" name="tradeName" className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="tin">TIN{requiredMark}</label>
          <input
            id="tin"
            name="tin"
            value={tin}
            onChange={(e) => setTin(formatTin(e.target.value))}
            placeholder="000-000-000-00000"
            pattern="\d{3}-\d{3}-\d{3}-\d{5}"
            title="Format: 000-000-000-00000 (9-digit TIN + 5-digit branch code, dashes included)"
            inputMode="numeric"
            required
            className={field === "tin" ? errorInputClass : inputClass}
          />
          {fieldError("tin")}
        </div>
        <div>
          <label className={labelClass} htmlFor="rdoCode">RDO Code{requiredMark}</label>
          <input
            id="rdoCode"
            name="rdoCode"
            required
            className={field === "rdoCode" ? errorInputClass : inputClass}
          />
          {fieldError("rdoCode")}
        </div>
        <div>
          <label className={labelClass} htmlFor="taxpayerType">Taxpayer Type{requiredMark}</label>
          <select id="taxpayerType" name="taxpayerType" required className={inputClass} defaultValue="corporation">
            <option value="individual">Individual</option>
            <option value="corporation">Corporation</option>
            <option value="partnership">Partnership</option>
            <option value="sole_prop">Sole Proprietorship</option>
            <option value="professional">Professional</option>
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="vatStatus">VAT Status{requiredMark}</label>
          <select id="vatStatus" name="vatStatus" required className={inputClass} defaultValue="vat">
            <option value="vat">VAT-Registered</option>
            <option value="non_vat">Non-VAT (Percentage Tax)</option>
            <option value="vat_exempt">VAT-Exempt</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="incomeTaxRegime">Income Tax Regime{requiredMark}</label>
          <select id="incomeTaxRegime" name="incomeTaxRegime" required className={inputClass} defaultValue="rcit">
            <option value="graduated_itemized">Graduated Rates — Itemized Deductions</option>
            <option value="graduated_osd">Graduated Rates — Optional Standard Deduction</option>
            <option value="eight_percent">8% Flat Rate on Gross Sales/Receipts</option>
            <option value="rcit">Regular Corporate Income Tax (RCIT)</option>
            <option value="mcit_applicable">Minimum Corporate Income Tax (MCIT) Applicable</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="address">Registered Address{requiredMark}</label>
          <input
            id="address"
            name="address"
            required
            className={field === "address" ? errorInputClass : inputClass}
          />
          {fieldError("address")}
        </div>
      </div>

      <p className="text-xs text-slate-500">
        The full onboarding wizard (books type, PTU details, withholding-agent flags, opening balance import) is
        deferred to a later phase — see DECISIONS.md. This creates the client and seeds the standard PH SME chart
        of accounts.
      </p>

      {error && !field && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {pending ? "Creating..." : "Create Client"}
      </button>
    </form>
  );
}
