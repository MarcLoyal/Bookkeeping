"use client";

import { useRouter } from "next/navigation";

/** Jumps straight to the draft-entry form for the chosen client — unlike QuickPostPicker (which lands on the client's full transaction ledger), Encoder never sees that list (RLS would only show their own entries there anyway, but the ledger view itself carries running-balance context that's out of scope for this role). */
export function EncoderClientPicker({ clients }: { clients: { id: string; registeredName: string }[] }) {
  const router = useRouter();

  return (
    <select
      defaultValue=""
      onChange={(e) => {
        if (e.target.value) router.push(`/clients/${e.target.value}/transactions/new/general_journal`);
      }}
      className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
    >
      <option value="" disabled>
        + Add Entry — pick a client…
      </option>
      {clients.map((c) => (
        <option key={c.id} value={c.id}>
          {c.registeredName}
        </option>
      ))}
    </select>
  );
}
