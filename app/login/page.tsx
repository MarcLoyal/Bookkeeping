import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, getPendingGoogleSignup } from "@/lib/auth/current-user";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string; oauth_error?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  // A Google identity that authenticated but never finished naming a firm
  // has a real Supabase session (getCurrentUser() above returns null for
  // it, since there's no profile row yet) — send them back to resume
  // instead of showing a login form for someone who's already signed in.
  const pending = await getPendingGoogleSignup();
  if (pending) redirect("/onboarding/firm");

  const { reset, oauth_error: oauthError } = await searchParams;

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
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Keep.Books</h1>
          <p className="mt-1 text-sm text-slate-500">Sign in to your firm workspace</p>
        </div>
        {reset && (
          <p className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Your password has been reset. Sign in with your new password.
          </p>
        )}
        {oauthError === "inactive" && (
          <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            This account has been deactivated. Contact your firm admin for access.
          </p>
        )}
        {oauthError === "1" && (
          <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            Something went wrong signing in with Google. Please try again.
          </p>
        )}
        <LoginForm />
        <p className="mt-6 text-center text-sm text-slate-500">
          Don&apos;t have an account?{" "}
          <Link href="/signup" prefetch={false} className="font-medium text-slate-900 hover:underline">
            Create your firm
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
