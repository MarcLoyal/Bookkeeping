"use client";

import { useActionState } from "react";
import { LegalConsentCheckbox } from "@/components/auth/legal-consent-checkbox";
import { completeOnboardingAction, type OnboardingActionState } from "./actions";

const initialState: OnboardingActionState = { error: null };

export function OnboardingForm({ defaultName }: { defaultName: string }) {
  const [state, formAction, pending] = useActionState(completeOnboardingAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="firmName" className="block text-sm font-medium text-slate-700">
          Firm name
        </label>
        <input
          id="firmName"
          name="firmName"
          type="text"
          required
          autoComplete="organization"
          autoFocus
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
      </div>
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-slate-700">
          Your name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          defaultValue={defaultName}
          autoComplete="name"
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
      </div>
      <LegalConsentCheckbox />
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {pending ? "Creating your workspace..." : "Create your firm"}
      </button>
    </form>
  );
}
