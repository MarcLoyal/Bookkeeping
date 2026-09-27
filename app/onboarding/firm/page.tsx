import { redirect } from "next/navigation";
import { getPendingGoogleSignup } from "@/lib/auth/current-user";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingFirmPage() {
  // getPendingGoogleSignup() returns null both for "not signed in" and
  // "already has a firm" — either way there's nothing to onboard here.
  const pending = await getPendingGoogleSignup();
  if (!pending) redirect("/login");

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 px-4">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_-10%,rgba(15,23,42,0.09),transparent)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(15,23,42,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.035)_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,black,transparent)]"
      />
      <div className="relative w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-lg shadow-slate-900/5">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-sm font-bold text-white">
            K
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Welcome to Keep.Books</h1>
          <p className="mt-1 text-sm text-slate-500">Signed in as {pending.email} — one more step to set up your workspace.</p>
        </div>
        <OnboardingForm defaultName={pending.name} />
      </div>
    </div>
  );
}
