"use client";

import { useState } from "react";
import { useJsonPost } from "@/lib/use-json-post";

export function ReverseForm({ clientId, entryId }: { clientId: string; entryId: string }) {
  const [open, setOpen] = useState(false);
  const { submit, error, pending } = useJsonPost<Record<string, string>>(
    `/api/clients/${clientId}/transactions/${entryId}/reverse`,
    () => `/clients/${clientId}/transactions`
  );

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
      >
        Reverse Entry
      </button>
    );
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    submit(Object.fromEntries(formData) as Record<string, string>);
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-3 rounded-md border border-red-200 bg-red-50 p-4">
      <p className="text-sm text-red-800">
        Posted entries are immutable. This creates a new, mirrored entry that offsets this one — the original stays
        on the books, marked &ldquo;reversed&rdquo;.
      </p>
      <div>
        <label className="block text-xs font-medium text-slate-700">Reversal Date</label>
        <input
          type="date"
          name="reversalDate"
          required
          defaultValue={new Date().toISOString().slice(0, 10)}
          className="mt-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700">Reason (required, audit-logged)</label>
        <input
          type="text"
          name="reason"
          required
          className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
        />
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50"
        >
          {pending ? "Reversing..." : "Confirm Reversal"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-100"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
