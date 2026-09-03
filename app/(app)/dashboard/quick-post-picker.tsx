"use client";

import { useRouter } from "next/navigation";

export function QuickPostPicker({ clients }: { clients: { id: string; registeredName: string }[] }) {
  const router = useRouter();

  return (
    <select
      defaultValue=""
      onChange={(e) => {
        if (e.target.value) router.push(`/clients/${e.target.value}/transactions`);
      }}
      className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
    >
      <option value="" disabled>
        + New Entry -- pick a client…
      </option>
      {clients.map((c) => (
        <option key={c.id} value={c.id}>
          {c.registeredName}
        </option>
      ))}
    </select>
  );
}
