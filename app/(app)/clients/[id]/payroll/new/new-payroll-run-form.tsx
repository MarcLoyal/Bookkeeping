"use client";

import { useState } from "react";
import { useJsonPost } from "@/lib/use-json-post";

const inputClass =
  "block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500";
const labelClass = "block text-sm font-medium text-slate-700";

type EmployeeOption = {
  id: string;
  registeredName: string;
  payFrequency: string;
};

type RowState = {
  included: boolean;
  overtimePay: string;
  otherTaxableEarnings: string;
  deMinimis: string;
  thirteenthMonthPay: string;
};

function emptyRow(): RowState {
  return { included: false, overtimePay: "", otherTaxableEarnings: "", deMinimis: "", thirteenthMonthPay: "" };
}

export function NewPayrollRunForm({ clientId, employees }: { clientId: string; employees: EmployeeOption[] }) {
  const [runType, setRunType] = useState<"regular" | "thirteenth_month">("regular");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [payDate, setPayDate] = useState("");
  const [rows, setRows] = useState<Record<string, RowState>>(() => Object.fromEntries(employees.map((e) => [e.id, emptyRow()])));

  type PayrollRunEntry = { employeeId: string; overtimePay: string; otherTaxableEarnings: string; deMinimis: string; thirteenthMonthPay: string };
  type PayrollRunBody = { runType: string; periodStart: string; periodEnd: string; payDate: string; entries: PayrollRunEntry[] };
  const { submit, error, pending } = useJsonPost<PayrollRunBody>(
    `/api/clients/${clientId}/payroll`,
    (data) => `/clients/${clientId}/payroll/${data.runId}`
  );

  function updateRow(employeeId: string, patch: Partial<RowState>) {
    setRows((prev) => ({ ...prev, [employeeId]: { ...prev[employeeId], ...patch } }));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const entries = employees
      .filter((emp) => rows[emp.id]?.included)
      .map((emp) => ({
        employeeId: emp.id,
        overtimePay: rows[emp.id].overtimePay,
        otherTaxableEarnings: rows[emp.id].otherTaxableEarnings,
        deMinimis: rows[emp.id].deMinimis,
        thirteenthMonthPay: rows[emp.id].thirteenthMonthPay,
      }));
    submit({ runType, periodStart, periodEnd, payDate, entries });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 rounded-lg border border-slate-200 bg-white p-6 sm:grid-cols-4">
        <div>
          <label className={labelClass} htmlFor="runType">Run Type</label>
          <select
            id="runType"
            value={runType}
            onChange={(e) => setRunType(e.target.value as "regular" | "thirteenth_month")}
            className={inputClass}
          >
            <option value="regular">Regular</option>
            <option value="thirteenth_month">13th Month Pay</option>
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="periodStart">Period Start</label>
          <input id="periodStart" type="date" required value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="periodEnd">Period End</label>
          <input id="periodEnd" type="date" required value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="payDate">Pay Date</label>
          <input id="payDate" type="date" required value={payDate} onChange={(e) => setPayDate(e.target.value)} className={inputClass} />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Include</th>
              <th className="px-3 py-2">Employee</th>
              {runType === "regular" ? (
                <>
                  <th className="px-3 py-2">Overtime Pay</th>
                  <th className="px-3 py-2">Other Taxable Earnings</th>
                  <th className="px-3 py-2">De Minimis</th>
                </>
              ) : (
                <th className="px-3 py-2">13th Month Pay</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {employees.map((emp) => {
              const row = rows[emp.id];
              return (
                <tr key={emp.id}>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={row.included}
                      onChange={(e) => updateRow(emp.id, { included: e.target.checked })}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-900">{emp.registeredName}</td>
                  {runType === "regular" ? (
                    <>
                      <td className="px-3 py-2">
                        <input
                          inputMode="decimal"
                          placeholder="0.00"
                          value={row.overtimePay}
                          onChange={(e) => updateRow(emp.id, { overtimePay: e.target.value })}
                          className={inputClass}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          inputMode="decimal"
                          placeholder="0.00"
                          value={row.otherTaxableEarnings}
                          onChange={(e) => updateRow(emp.id, { otherTaxableEarnings: e.target.value })}
                          className={inputClass}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          inputMode="decimal"
                          placeholder="0.00"
                          value={row.deMinimis}
                          onChange={(e) => updateRow(emp.id, { deMinimis: e.target.value })}
                          className={inputClass}
                        />
                      </td>
                    </>
                  ) : (
                    <td className="px-3 py-2">
                      <input
                        inputMode="decimal"
                        placeholder="0.00"
                        value={row.thirteenthMonthPay}
                        onChange={(e) => updateRow(emp.id, { thirteenthMonthPay: e.target.value })}
                        className={inputClass}
                      />
                    </td>
                  )}
                </tr>
              );
            })}
            {employees.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  No employees yet — add one first.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {runType === "thirteenth_month" && (
        <p className="text-xs text-slate-500">
          13th month pay is typically 1/12 of this employee&apos;s total basic pay actually paid during the calendar
          year — enter the computed amount per employee; this app doesn&apos;t sum it automatically.
        </p>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {pending ? "Posting..." : "Compute & Post Payroll Run"}
      </button>
    </form>
  );
}
