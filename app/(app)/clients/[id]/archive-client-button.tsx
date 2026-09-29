"use client";

import { useActionState } from "react";
import { setClientArchivedAction, type SetClientArchivedActionState } from "./actions";

const initialState: SetClientArchivedActionState = { error: null, success: false };

export function ArchiveClientButton({ clientId, archived, clientName }: { clientId: string; archived: boolean; clientName: string }) {
  const [state, formAction, pending] = useActionState(setClientArchivedAction, initialState);

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        const confirmMessage = archived
          ? `Reactivate ${clientName}?`
          : `Archive ${clientName}? Their records stay intact and can be viewed anytime, but they'll drop out of the active client list.`;
        if (!window.confirm(confirmMessage)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="archived" value={archived ? "false" : "true"} />
      <button
        type="submit"
        disabled={pending}
        className={`text-left text-sm hover:underline disabled:opacity-50 ${archived ? "text-emerald-700" : "text-red-700"}`}
      >
        {pending ? "Working..." : archived ? "Reactivate this client" : "Archive this client"}
      </button>
      {state.error && <p className="mt-1 text-xs text-red-600">{state.error}</p>}
    </form>
  );
}
