"use client";

import { useRouter } from "next/navigation";

/** Same shape as EncoderClientPicker, but jumps to the AI receipt-capture flow instead of a blank draft form — this is meant to be Encoder's primary, one-tap mobile entry point for "add receipt," not just reachable via the transactions list's own button. */
export function EncoderReceiptPicker({ clients }: { clients: { id: string; registeredName: string }[] }) {
  const router = useRouter();

  return (
    <select
      defaultValue=""
      onChange={(e) => {
        if (e.target.value) router.push(`/clients/${e.target.value}/transactions/new/receipt`);
      }}
      className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
    >
      <option value="" disabled>
        + Add Receipt — pick a client…
      </option>
      {clients.map((c) => (
        <option key={c.id} value={c.id}>
          {c.registeredName}
        </option>
      ))}
    </select>
  );
}
