"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Edit/Delete for a draft, shown only when the caller already has that
 * permission (checked server-side on the detail page before this even
 * renders) — RLS is the real backstop either way (journal_entries_update/
 * _delete, 009_team_roles_rls.sql), so a stale button click still can't
 * mutate anything this session isn't actually allowed to.
 */
export function DraftActions({
  clientId,
  entryId,
  canEdit,
}: {
  clientId: string;
  entryId: string;
  /** Delete is available to everyone this renders for; Edit is General-Journal-only (see the edit page's own doc comment) — false here for a draft on any other book. */
  canEdit: boolean;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!window.confirm("Delete this draft? This cannot be undone.")) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/transactions/${entryId}/delete`, {
        method: "POST",
        credentials: "same-origin",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        setError(data.error ?? `Request failed (${res.status}).`);
        setDeleting(false);
        return;
      }
      router.push(`/clients/${clientId}/transactions`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete entry.");
      setDeleting(false);
    }
  }

  return (
    <div>
      <div className="flex gap-2">
        {canEdit && (
          <Link
            href={`/clients/${clientId}/transactions/${entryId}/edit`}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-100"
          >
            Edit
          </Link>
        )}
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          {deleting ? "Deleting..." : "Delete"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
