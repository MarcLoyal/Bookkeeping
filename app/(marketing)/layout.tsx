import Link from "next/link";
import { isAuthenticated } from "@/lib/auth/is-authenticated";

/**
 * Shared header/footer for the public marketing site (Home, Features,
 * Pricing, Security, FAQ, Contact, Terms, Privacy) — login/signup stay as
 * single-card pages with no nav of their own (see app/login/page.tsx).
 * Reuses the same "Keep.Books" wordmark + slate palette app/(app)/
 * layout.tsx's authenticated shell already uses, rather than inventing a
 * new visual language.
 *
 * Uses isAuthenticated() (an auth-only check, no Postgres query), not
 * getCurrentUser() — see that file's doc comment. These pages are where
 * anonymous ad/referral traffic lands, so they stay fast and don't touch
 * the app database at all.
 */
export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const signedIn = await isAuthenticated();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
            Keep.Books
            <span className="rounded-full bg-slate-900/5 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Beta</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex">
            <Link href="/features" className="hover:text-slate-900">
              Features
            </Link>
            <Link href="/pricing" className="hover:text-slate-900">
              Pricing
            </Link>
            <Link href="/security" className="hover:text-slate-900">
              Security
            </Link>
            <Link href="/faq" className="hover:text-slate-900">
              FAQ
            </Link>
          </nav>
          <div className="flex items-center gap-3 text-sm font-medium text-slate-600">
            {signedIn ? (
              <Link href="/dashboard" prefetch={false} className="rounded-md bg-slate-900 px-3 py-1.5 text-white hover:bg-slate-800">
                Go to Dashboard
              </Link>
            ) : (
              <>
                <Link href="/login" prefetch={false} className="hover:text-slate-900">
                  Log in
                </Link>
                <Link href="/signup" prefetch={false} className="rounded-md bg-slate-900 px-3 py-1.5 text-white hover:bg-slate-800">
                  Start free trial
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main>{children}</main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
          <p className="text-sm text-slate-500">© {new Date().getFullYear()} Keep.Books. Bookkeeping for the Philippine market.</p>
          <nav className="flex flex-wrap items-center justify-center gap-5 text-sm text-slate-500">
            <Link href="/features" className="hover:text-slate-900">
              Features
            </Link>
            <Link href="/pricing" className="hover:text-slate-900">
              Pricing
            </Link>
            <Link href="/security" className="hover:text-slate-900">
              Security
            </Link>
            <Link href="/faq" className="hover:text-slate-900">
              FAQ
            </Link>
            <Link href="/contact" className="hover:text-slate-900">
              Contact
            </Link>
            <Link href="/terms" className="hover:text-slate-900">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-slate-900">
              Privacy
            </Link>
            {signedIn ? (
              <Link href="/dashboard" prefetch={false} className="hover:text-slate-900">
                Go to Dashboard
              </Link>
            ) : (
              <>
                <Link href="/login" prefetch={false} className="hover:text-slate-900">
                  Log in
                </Link>
                <Link href="/signup" prefetch={false} className="hover:text-slate-900">
                  Create your firm
                </Link>
              </>
            )}
          </nav>
        </div>
      </footer>
    </div>
  );
}
