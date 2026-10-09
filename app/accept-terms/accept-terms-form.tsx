"use client";

import { useActionState } from "react";
import { LegalConsentCheckbox } from "@/components/auth/legal-consent-checkbox";
import { acceptTermsAction, type AcceptTermsActionState } from "./actions";

const initialState: AcceptTermsActionState = { error: null };

export function AcceptTermsForm() {
  const [state, formAction, pending] = useActionState(acceptTermsAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <LegalConsentCheckbox />
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {pending ? "Continuing..." : "Continue"}
      </button>
    </form>
  );
}
