"use client";

import { useState } from "react";
import { useJsonPost } from "@/lib/use-json-post";

export function DateOperationsCommencedField({ clientId, value }: { clientId: string; value: string | null }) {
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(value ?? "");
  const { submit, error, pending } = useJsonPost<{ dateOperationsCommenced: string }>(
    `/api/clients/${clientId}/date-operations-commenced`,
    () => `/clients/${clientId}`
  );

  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)} className="text-left hover:underline">
        {value ?? <span className="text-amber-600">Not set — click to set</span>}
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit({ dateOperationsCommenced: date });
      }}
      className="flex items-center gap-1"
    >
      <input
        type="date"
        required
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="rounded-md border border-slate-300 px-1 py-0.5 text-xs"
      />
      <button type="submit" disabled={pending} className="text-xs font-medium text-slate-700 hover:underline disabled:opacity-50">
        {pending ? "Saving..." : "Save"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </form>
  );
}
