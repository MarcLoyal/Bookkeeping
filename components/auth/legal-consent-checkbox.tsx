import Link from "next/link";

/** Shared by signup, Google onboarding, and /accept-terms — one place to change the wording/links for all three. */
export function LegalConsentCheckbox({ name = "acceptedTerms" }: { name?: string }) {
  return (
    <label className="flex items-start gap-2 text-sm text-slate-600">
      <input
        type="checkbox"
        name={name}
        value="true"
        required
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-slate-900 focus:ring-1 focus:ring-slate-500"
      />
      <span>
        I agree to the{" "}
        <Link href="/terms" target="_blank" className="font-medium text-slate-900 hover:underline">
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link href="/privacy" target="_blank" className="font-medium text-slate-900 hover:underline">
          Privacy Policy
        </Link>
        .
      </span>
    </label>
  );
}
