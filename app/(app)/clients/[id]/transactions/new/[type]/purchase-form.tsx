"use client";

import { useMemo, useState } from "react";
import { useJsonPost } from "@/lib/use-json-post";

type Contact = { id: string; registeredName: string; type: string };
type Account = { id: string; code: string; name: string; type: string };

const inputClass =
  "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500";
const labelClass = "block text-sm font-medium text-slate-700";

export function PurchaseForm({
  clientId,
  contacts,
  accounts,
  vatRate,
}: {
  clientId: string;
  contacts: Contact[];
  accounts: Account[];
  vatRate: string;
}) {
  const { submit, error, pending } = useJsonPost<Record<string, string>>(
    `/api/clients/${clientId}/transactions/purchases`,
    () => `/clients/${clientId}/transactions`
  );
  const [vatable, setVatable] = useState("");
  const [zeroRated, setZeroRated] = useState("0");
  const [exempt, setExempt] = useState("0");
  const [inputVat, setInputVat] = useState("");
  const [ewtAmount, setEwtAmount] = useState("0");

  const suggestedVat = useMemo(() => {
    const n = Number(vatable) || 0;
    const rate = Number(vatRate) || 0;
    return (n * rate).toFixed(2);
  }, [vatable, vatRate]);

  const total =
    (Number(vatable) || 0) + (Number(zeroRated) || 0) + (Number(exempt) || 0) + (Number(inputVat) || 0);
  const netPayable = total - (Number(ewtAmount) || 0);

  const suppliers = contacts.filter((c) => c.type === "supplier" || c.type === "both");
  const expenseAccounts = accounts.filter((a) => a.type === "expense" || a.type === "asset");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    submit(Object.fromEntries(formData) as Record<string, string>);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Supplier</label>
          <select name="contactId" required className={inputClass}>
            <option value="">Select...</option>
            {suppliers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.registeredName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Supplier Invoice No.</label>
          <input name="supplierInvoiceNo" required className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Invoice Date</label>
          <input type="date" name="invoiceDate" required className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Classification</label>
          <select name="purchaseClassification" required className={inputClass} defaultValue="services">
            <option value="services">Services</option>
            <option value="goods_other_than_capital">Goods (Other than Capital)</option>
            <option value="capital_goods">Capital Goods</option>
            <option value="domestic_purchase_not_qualified">Domestic Purchase — Not Qualified for Input Tax</option>
            <option value="importation">Importation</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass}>Expense / Asset Account</label>
          <select name="expenseAccountCode" required className={inputClass}>
            <option value="">Select...</option>
            {expenseAccounts.map((a) => (
              <option key={a.id} value={a.code}>
                {a.code} — {a.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <label className={labelClass}>Vatable Purchase</label>
          <input
            name="vatablePurchase"
            inputMode="decimal"
            value={vatable}
            onChange={(e) => setVatable(e.target.value)}
            onBlur={() => {
              if (vatable && !inputVat) setInputVat(suggestedVat);
            }}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Zero-Rated</label>
          <input
            name="zeroRatedPurchase"
            inputMode="decimal"
            value={zeroRated}
            onChange={(e) => setZeroRated(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Exempt</label>
          <input
            name="exemptPurchase"
            inputMode="decimal"
            value={exempt}
            onChange={(e) => setExempt(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Input VAT</label>
          <input
            name="inputVat"
            inputMode="decimal"
            value={inputVat}
            onChange={(e) => setInputVat(e.target.value)}
            className={inputClass}
          />
          <p className="mt-1 text-xs text-slate-400">Suggested: {suggestedVat}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div>
          <label className={labelClass}>EWT Code (optional)</label>
          <input name="ewtCode" className={inputClass} placeholder="e.g. WC157" />
        </div>
        <div>
          <label className={labelClass}>EWT Amount Withheld</label>
          <input
            name="ewtAmount"
            inputMode="decimal"
            value={ewtAmount}
            onChange={(e) => setEwtAmount(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <div className="rounded-md bg-slate-50 px-4 py-2 text-sm">
        Total: <span className="font-semibold">{total.toFixed(2)}</span> · Net Payable to Supplier:{" "}
        <span className="font-semibold">{netPayable.toFixed(2)}</span>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {pending ? "Posting..." : "Post Purchase"}
      </button>
    </form>
  );
}
