"use client";

import { useMemo, useState } from "react";
import { useJsonPost } from "@/lib/use-json-post";

type Account = { id: string; code: string; name: string };

const inputClass =
  "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500";
const labelClass = "block text-sm font-medium text-slate-700";

type Row = { accountCode: string; debit: string; credit: string; memo: string };

export function GeneralJournalForm({ clientId, accounts }: { clientId: string; accounts: Account[] }) {
  const { submit, error, pending } = useJsonPost<Record<string, unknown>>(
    `/api/clients/${clientId}/transactions/general-journal`,
    () => `/clients/${clientId}/transactions`
  );
  const [rows, setRows] = useState<Row[]>([
    { accountCode: "", debit: "", credit: "", memo: "" },
    { accountCode: "", debit: "", credit: "", memo: "" },
  ]);

  const { totalDebit, totalCredit } = useMemo(() => {
    let d = 0;
    let c = 0;
    for (const r of rows) {
      d += Number(r.debit) || 0;
      c += Number(r.credit) || 0;
    }
    return { totalDebit: d, totalCredit: c };
  }, [rows]);
  const balanced = totalDebit === totalCredit && totalDebit > 0;

  function updateRow(i: number, field: keyof Row, value: string) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  }
  function addRow() {
    setRows((prev) => [...prev, { accountCode: "", debit: "", credit: "", memo: "" }]);
  }
  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const fields = Object.fromEntries(formData) as Record<string, string>;
    submit({
      entryDate: fields.entryDate,
      description: fields.description,
      referenceNo: fields.referenceNo || undefined,
      lines: rows
        .filter((r) => r.accountCode)
        .map((r) => ({ accountCode: r.accountCode, debit: r.debit, credit: r.credit, memo: r.memo || undefined })),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Date</label>
          <input type="date" name="entryDate" required className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Reference No. (optional)</label>
          <input name="referenceNo" className={inputClass} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass}>Description</label>
          <input name="description" required className={inputClass} />
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className={labelClass}>Lines</label>
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
              >
                <option value="">Account...</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.code}>
                    {a.code} — {a.name}
                  </option>
                ))}
              </select>
              <input
                className={`${inputClass} col-span-2 mt-0`}
                inputMode="decimal"
                placeholder="Debit"
                value={row.debit}
                onChange={(e) => updateRow(i, "debit", e.target.value)}
              />
              <input
                className={`${inputClass} col-span-2 mt-0`}
                inputMode="decimal"
                placeholder="Credit"
                value={row.credit}
                onChange={(e) => updateRow(i, "credit", e.target.value)}
              />
              <input
                className={`${inputClass} col-span-2 mt-0`}
                placeholder="Memo"
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

      <div
        className={`flex items-center justify-between rounded-md px-4 py-2 text-sm ${
          balanced ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"
        }`}
      >
        <span>
          Debit: <span className="font-semibold">{totalDebit.toFixed(2)}</span> · Credit:{" "}
          <span className="font-semibold">{totalCredit.toFixed(2)}</span>
        </span>
        <span className="font-semibold">{balanced ? "Balanced ✓" : "Out of balance"}</span>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={pending || !balanced}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {pending ? "Posting..." : "Post Journal Entry"}
      </button>
    </form>
  );
}
