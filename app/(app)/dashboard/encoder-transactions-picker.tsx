"use client";

import { useRouter } from "next/navigation";

/** Same shape as EncoderClientPicker, but lands on the client's transaction list (now readable by an Encoder — every entry on the client, not just their own, since 014_encoder_read_all_client_entries.sql) instead of jumping straight to the add-entry form. */
export function EncoderTransactionsPicker({ clients }: { clients: { id: string; registeredName: string }[] }) {
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
        View transactions — pick a client…
      </option>
      {clients.map((c) => (
        <option key={c.id} value={c.id}>
          {c.registeredName}
        </option>
      ))}
    </select>
  );
}
