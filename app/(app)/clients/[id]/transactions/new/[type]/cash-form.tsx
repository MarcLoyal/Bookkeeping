"use client";

import { useMemo, useState } from "react";
import { useJsonPost } from "@/lib/use-json-post";

type Contact = { id: string; registeredName: string; type: string };
type Account = { id: string; code: string; name: string; type: string };

const inputClass =
  "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500";
const labelClass = "block text-sm font-medium text-slate-700";

type AllocRow = { accountCode: string; amount: string; memo: string };

export function CashForm({
  mode,
  clientId,
  contacts,
  accounts,
}: {
  mode: "receipt" | "disbursement";
  clientId: string;
  contacts: Contact[];
  accounts: Account[];
}) {
  const endpoint = mode === "receipt" ? "cash-receipts" : "cash-disbursements";
  const { submit, error, pending } = useJsonPost<Record<string, unknown>>(
    `/api/clients/${clientId}/transactions/${endpoint}`,
    () => `/clients/${clientId}/transactions`
  );
  const [rows, setRows] = useState<AllocRow[]>([{ accountCode: "", amount: "", memo: "" }]);

  const bankAccounts = accounts.filter((a) => a.code === "1010" || a.code === "1020");
  const allocationAccounts = accounts.filter((a) => a.code !== "1010" && a.code !== "1020");

  const total = useMemo(() => rows.reduce((s, r) => s + (Number(r.amount) || 0), 0), [rows]);

  function updateRow(i: number, field: keyof AllocRow, value: string) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  }
  function addRow() {
    setRows((prev) => [...prev, { accountCode: "", amount: "", memo: "" }]);
  }
  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const fields = Object.fromEntries(formData) as Record<string, string>;
    submit({
      contactId: fields.contactId || undefined,
      date: fields.date,
      particulars: fields.particulars,
      bankCashAccountCode: fields.bankCashAccountCode,
      referenceNo: fields.referenceNo || undefined,
      allocations: rows
        .filter((r) => r.accountCode && r.amount)
        .map((r) => ({ accountCode: r.accountCode, amount: r.amount, memo: r.memo || undefined })),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Contact (optional)</label>
          <select name="contactId" className={inputClass} defaultValue="">
            <option value="">—</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.registeredName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Date</label>
          <input type="date" name="date" required className={inputClass} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass}>Particulars</label>
          <input name="particulars" required className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Bank / Cash Account</label>
          <select name="bankCashAccountCode" required className={inputClass}>
            <option value="">Select...</option>
            {bankAccounts.map((a) => (
              <option key={a.id} value={a.code}>
                {a.code} — {a.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Reference No. (optional)</label>
          <input name="referenceNo" className={inputClass} />
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className={labelClass}>
            Allocation ({mode === "receipt" ? "credited" : "debited"} accounts)
          </label>
          <button type="button" onClick={addRow} className="text-xs font-medium text-slate-600 hover:underline">
            + Add line
          </button>
        </div>
        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={i} className="grid grid-cols-12 gap-2">
              <select
                className={`${inputClass} col-span-5 mt-0`}
                value={row.accountCode}
                onChange={(e) => updateRow(i, "accountCode", e.target.value)}
                required
              >
                <option value="">Account...</option>
                {allocationAccounts.map((a) => (
                  <option key={a.id} value={a.code}>
                    {a.code} — {a.name}
                  </option>
                ))}
              </select>
              <input
                className={`${inputClass} col-span-3 mt-0`}
                inputMode="decimal"
                placeholder="Amount"
                value={row.amount}
                onChange={(e) => updateRow(i, "amount", e.target.value)}
                required
              />
              <input
                className={`${inputClass} col-span-3 mt-0`}
                placeholder="Memo (optional)"
                value={row.memo}
                onChange={(e) => updateRow(i, "memo", e.target.value)}
              />
              <button
                type="button"
                onClick={() => removeRow(i)}
                className="col-span-1 text-xs text-slate-400 hover:text-red-600"
              >
                ✕
              </button>
            </div>
          ))}
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
        {pending ? "Posting..." : mode === "receipt" ? "Post Cash Receipt" : "Post Cash Disbursement"}
      </button>
    </form>
  );
}
