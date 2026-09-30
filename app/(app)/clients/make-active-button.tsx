"use client";

import { useActionState } from "react";
import { swapActiveClientAction, type SwapActiveClientActionState } from "./actions";

// Defined here, not in actions.ts: a "use server" file may only export
// async functions — a plain const object export crashes at runtime
// ("A 'use server' file can only export async functions, found object").
const initialSwapState: SwapActiveClientActionState = { error: null, success: false, deactivatedClientName: null };

/**
 * The Owner-facing side of "auto-pick, Owner can swap after" — see
 * lib/billing/swap-active-client.ts. Shown per read-only (inactive)
 * client row, Owner-only (gated in clients/page.tsx, not here, matching
 * how ArchiveClientButton's own page gates its rendering rather than the
 * button re-checking role).
 *
 * A plain window.confirm(), not a preview like the platform admin
 * dashboard's downgrade button needs: swapActiveClient() always demotes
 * at most one client, so the blast radius is small and fixed regardless
 * of which client gets picked — a preview step would be overkill here.
 * The client that actually got demoted is named in the success message
 * instead, straight from the function's own return value.
 */
export function MakeActiveButton({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [state, formAction, pending] = useActionState(swapActiveClientAction, initialSwapState);

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm(`Make ${clientName} active? Whichever active client has gone longest without a view will become read-only instead.`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="activateClientId" value={clientId} />
      <button type="submit" disabled={pending} className="text-xs font-medium text-slate-700 hover:underline disabled:opacity-50">
        {pending ? "Working..." : "Make active"}
      </button>
      {state.error && <p className="mt-0.5 text-[11px] text-red-600">{state.error}</p>}
      {state.success && <p className="mt-0.5 text-[11px] text-emerald-700">Active{state.deactivatedClientName ? ` — ${state.deactivatedClientName} is now read-only` : ""}.</p>}
    </form>
  );
}
