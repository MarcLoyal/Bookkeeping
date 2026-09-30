import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/current-user";

/**
 * Shared header/footer for the public marketing pages (Pricing, FAQ).
 * There's no pre-existing "main site" nav to hook into — app/page.tsx
 * redirects straight to /login or /dashboard, and login/signup are
 * single-card pages with no nav of their own (see app/login/page.tsx) —
 * so this is a small, self-contained public shell reusing the same
 * "Keep.Books" wordmark + slate palette those pages and app/(app)/
 * layout.tsx's authenticated shell already use, rather than inventing a
 * new visual language for just two pages.
 */
export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="text-lg font-bold tracking-tight text-slate-900">
            Keep.Books
          </Link>
          <nav className="flex items-center gap-6 text-sm font-medium text-slate-600">
            <Link href="/pricing" className="hover:text-slate-900">
              Pricing
            </Link>
            <Link href="/faq" className="hover:text-slate-900">
              FAQ
            </Link>
            {user ? (
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
          </nav>
        </div>
      </header>

      <main>{children}</main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
          <p className="text-sm text-slate-500">© {new Date().getFullYear()} Keep.Books. Bookkeeping for the Philippine market.</p>
          <nav className="flex items-center gap-5 text-sm text-slate-500">
            <Link href="/pricing" className="hover:text-slate-900">
              Pricing
            </Link>
            <Link href="/faq" className="hover:text-slate-900">
              FAQ
            </Link>
            {user ? (
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
