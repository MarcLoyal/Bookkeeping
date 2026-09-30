import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, getPendingGoogleSignup } from "@/lib/auth/current-user";
import { SignupForm } from "./signup-form";

export default async function SignupPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  // Same reasoning as app/login/page.tsx: a Google identity mid-onboarding
  // has a real session but getCurrentUser() returns null for it — resume
  // where they left off instead of showing a fresh "create your firm" form.
  const pending = await getPendingGoogleSignup();
  if (pending) redirect("/onboarding/firm");

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
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Create your firm</h1>
          <p className="mt-1 text-sm text-slate-500">Set up a new Keep.Books workspace</p>
        </div>
        <SignupForm />
        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an account?{" "}
          <Link href="/login" prefetch={false} className="font-medium text-slate-900 hover:underline">
            Sign in
          </Link>
        </p>
        <p className="mt-4 text-center text-xs text-slate-400">
          <Link href="/pricing" prefetch={false} className="hover:text-slate-600 hover:underline">
            Pricing
          </Link>
          {" · "}
          <Link href="/faq" prefetch={false} className="hover:text-slate-600 hover:underline">
            FAQ
          </Link>
        </p>
      </div>
    </div>
  );
}
