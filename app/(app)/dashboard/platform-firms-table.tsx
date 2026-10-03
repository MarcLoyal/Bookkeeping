"use client";

import { Fragment, useMemo, useState } from "react";
import type { FirmDashboardRow } from "@/lib/data/platform-dashboard";
import { ActivityBadge } from "@/components/activity-badge";
import { formatDateTimePH } from "@/lib/format-datetime";

const SIGNUP_METHOD_LABELS: Record<string, string> = { email: "Email", google: "Google" };

function formatDate(d: Date | string): string {
  return new Date(d).toISOString().slice(0, 10);
}

export function PlatformFirmsTable({ rows }: { rows: FirmDashboardRow[] }) {
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q) || (r.ownerEmail ?? "").toLowerCase().includes(q));
  }, [rows, query]);

  return (
    <div>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by firm name or owner email..."
        className="mb-3 w-full max-w-sm rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
      />

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">Firm</th>
              <th className="px-4 py-2">Owner</th>
              <th className="px-4 py-2">Signed up</th>
              <th className="px-4 py-2">Method</th>
              <th className="px-4 py-2">Clients</th>
              <th className="px-4 py-2">Last active</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((firm) => (
              <Fragment key={firm.id}>
                <tr
                  onClick={() => setExpandedId(expandedId === firm.id ? null : firm.id)}
                  className="cursor-pointer hover:bg-slate-50"
                >
                  <td className="px-4 py-2 font-medium text-slate-900">{firm.name}</td>
                  <td className="px-4 py-2">
                    {firm.ownerName ?? <span className="text-slate-400">—</span>}
                    {firm.ownerEmail && <div className="text-xs text-slate-400">{firm.ownerEmail}</div>}
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-500">{formatDate(firm.createdAt)}</td>
                  <td className="px-4 py-2">
                    {firm.signupMethod ? (
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                        {SIGNUP_METHOD_LABELS[firm.signupMethod] ?? firm.signupMethod}
                      </span>
                    ) : (
                      <span className="text-slate-400">Unknown</span>
                    )}
                  </td>
                  <td className="px-4 py-2">{firm.clientCount}</td>
                  <td className="px-4 py-2 text-xs text-slate-500">
                    {firm.lastActiveAt ? formatDate(firm.lastActiveAt) : <span className="text-slate-400">Never</span>}
                  </td>
                  <td className="px-4 py-2">
                    <ActivityBadge lastActiveAt={firm.lastActiveAt} />
                  </td>
                </tr>
                {expandedId === firm.id && (
                  <tr key={`${firm.id}-detail`} className="bg-slate-50">
                    <td colSpan={7} className="px-4 py-3 text-xs text-slate-600">
                      <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
                        <div>
                          <span className="font-medium text-slate-500">Firm ID</span>
                          <div className="font-mono">{firm.id}</div>
                        </div>
                        <div>
                          <span className="font-medium text-slate-500">Owner email</span>
                          <div>{firm.ownerEmail ?? "—"}</div>
                        </div>
                        <div>
                          <span className="font-medium text-slate-500">Signed up</span>
                          <div>{formatDateTimePH(firm.createdAt)}</div>
                        </div>
                        <div>
                          <span className="font-medium text-slate-500">Last active</span>
                          <div>{firm.lastActiveAt ? formatDateTimePH(firm.lastActiveAt) : "Never"}</div>
                        </div>
                      </div>
                      <p className="mt-2 text-slate-400">Deeper per-firm activity history is coming in a later update.</p>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                  {rows.length === 0 ? "No firms signed up yet." : "No firms match your search."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
