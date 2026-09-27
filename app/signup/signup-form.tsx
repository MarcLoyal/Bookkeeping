"use client";

import { useActionState } from "react";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { signupAction, type SignupActionState } from "./actions";

const initialState: SignupActionState = { error: null, needsEmailConfirmation: false };

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signupAction, initialState);

  if (state.needsEmailConfirmation) {
    return (
      <p className="text-sm text-slate-600">
        Check your email to confirm your account, then sign in.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <GoogleSignInButton />
      <div className="relative py-2 text-center text-xs text-slate-400">
        <span className="relative bg-white px-2">or sign up with email</span>
        <div className="absolute inset-x-0 top-1/2 -z-10 border-t border-slate-200" />
      </div>
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
            autoComplete="name"
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
        </div>
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-slate-700">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-slate-700">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            pattern="(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{8,}"
            title="At least 8 characters, including one uppercase letter and one special character."
            autoComplete="new-password"
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-slate-500">
            <li>At least 8 characters</li>
            <li>At least one uppercase letter</li>
            <li>At least one special character</li>
          </ul>
        </div>
        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700">
            Confirm password
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            required
            autoComplete="new-password"
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
        </div>
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? "Creating your workspace..." : "Create your firm"}
        </button>
      </form>
    </div>
  );
}
