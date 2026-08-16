"use client";

import { useMemo, useState } from "react";
import { useJsonPost } from "@/lib/use-json-post";

type Contact = { id: string; registeredName: string; type: string };

const inputClass =
  "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500";
const labelClass = "block text-sm font-medium text-slate-700";

export function SalesInvoiceForm({
  clientId,
  contacts,
  vatRate,
}: {
  clientId: string;
  contacts: Contact[];
  vatRate: string;
}) {
  const { submit, error, pending } = useJsonPost<Record<string, string>>(
    `/api/clients/${clientId}/transactions/sales-invoices`,
    () => `/clients/${clientId}/transactions`
  );
  const [vatableSales, setVatableSales] = useState("");
  const [zeroRated, setZeroRated] = useState("0");
  const [exempt, setExempt] = useState("0");
  const [outputVat, setOutputVat] = useState("");

  const suggestedVat = useMemo(() => {
    const n = Number(vatableSales) || 0;
    const rate = Number(vatRate) || 0;
    return (n * rate).toFixed(2);
  }, [vatableSales, vatRate]);

  const total =
    (Number(vatableSales) || 0) + (Number(zeroRated) || 0) + (Number(exempt) || 0) + (Number(outputVat) || 0);

  const customers = contacts.filter((c) => c.type === "customer" || c.type === "both");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    submit(Object.fromEntries(formData) as Record<string, string>);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Customer</label>
          <select name="contactId" required className={inputClass}>
            <option value="">Select...</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.registeredName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Invoice No.</label>
          <input name="invoiceNo" required className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Invoice Date</label>
          <input type="date" name="invoiceDate" required className={inputClass} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <label className={labelClass}>Vatable Sales</label>
          <input
            name="vatableSales"
            inputMode="decimal"
            value={vatableSales}
            onChange={(e) => {
              setVatableSales(e.target.value);
            }}
            onBlur={() => {
              if (vatableSales && !outputVat) setOutputVat(suggestedVat);
            }}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Zero-Rated Sales</label>
          <input
            name="zeroRatedSales"
            inputMode="decimal"
            value={zeroRated}
            onChange={(e) => setZeroRated(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Exempt Sales</label>
          <input
            name="exemptSales"
            inputMode="decimal"
            value={exempt}
            onChange={(e) => setExempt(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Output VAT</label>
          <input
            name="outputVat"
            inputMode="decimal"
            value={outputVat}
            onChange={(e) => setOutputVat(e.target.value)}
            className={inputClass}
          />
          <p className="mt-1 text-xs text-slate-400">Suggested: {suggestedVat} (current tax_rules VAT rate)</p>
        </div>
      </div>

      <div className="rounded-md bg-slate-50 px-4 py-2 text-sm">
        Total: <span className="font-semibold">{total.toFixed(2)}</span>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {pending ? "Posting..." : "Post Sales Invoice"}
      </button>
    </form>
  );
}
