import Link from "next/link";
import { LegalDocBanner } from "../legal-doc-banner";
import { CURRENT_TERMS_VERSION, LEGAL_LAST_UPDATED } from "@/lib/legal/versions";

export const metadata = {
  title: "Terms of Service — Keep.Books",
  description: "The terms that apply to using Keep.Books.",
};

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-10 text-xl font-bold tracking-tight text-slate-900">{children}</h2>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-sm leading-relaxed text-slate-700">{children}</p>;
}

export default function TermsOfServicePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Terms of Service</h1>
      <LegalDocBanner version={CURRENT_TERMS_VERSION} lastUpdated={LEGAL_LAST_UPDATED} />

      <H2>1. Acceptance</H2>
      <P>
        By creating a Keep.Books account or using Keep.Books, you agree to these terms on behalf of yourself and, if you're signing up a firm,
        on behalf of that firm. Keep.Books is intended for businesses and professionals aged 18 or over — it is not directed at consumers or at
        anyone under 18.
      </P>

      <H2>2. Beta</H2>
      <P>
        Keep.Books is in beta. Features may change, break, or be removed without notice, and the service is provided "as is" and "as available,"
        without warranties of any kind, express or implied. You should export your data regularly rather than relying on Keep.Books as your only
        copy of your records.
      </P>

      <H2>3. Accounts</H2>
      <P>
        You're responsible for keeping your login credentials secure, for the accounts of any staff you invite to your firm's workspace, and for
        the accuracy of what's entered into Keep.Books — we don't independently verify the data a firm enters.
      </P>

      <H2>4. Plans and payment</H2>
      <P>
        Every new firm starts with a 7-day free trial. When the trial ends, your access may be limited or your firm moved to another plan at our
        discretion — your data is never deleted for this reason alone.
      </P>
      <P>
        Paid plans are billed annually or semi-annually at the prices shown on our{" "}
        <Link href="/pricing" className="font-medium text-slate-900 hover:underline">
          Pricing page
        </Link>
        , through the payment method we invoice you for — Keep.Books does not currently process payments within the product itself; billing is
        handled directly with us.
      </P>
      <P>
        Paying for a full year upfront grants 2 bonus client slots, permanently, once per account. Semi-annual payments do not qualify for this
        bonus.
      </P>
      <P>
        <strong>Refunds.</strong> If you request a refund within 14 days of payment, we'll refund it in full. After 14 days, we don't offer
        refunds, but your access continues for the rest of the period you already paid for.
      </P>
      <P>
        <strong>Late payment.</strong> If a payment is late, you get a 15-day grace period before your access may be limited. We do not delete
        your data for non-payment alone.
      </P>
      <P>
        <strong>Price changes.</strong> If we change a plan's price, it takes effect starting your next renewal, and we'll give you at least 30
        days' notice beforehand.
      </P>

      <H2>5. Fair use</H2>
      <P>
        One client means one registered taxpayer (one TIN). Branches registered under the same TIN count as a single client; a company with its
        own separate TIN is a separate client. One workspace is intended for one firm, and clients should not be split across multiple accounts
        just to stay within a plan's client limit. We enforce plan limits automatically by the number of active client records in a workspace;
        the TIN/branch grouping and one-workspace-per-firm expectations in this section are reviewed manually, not detected automatically.
      </P>

      <H2>6. Data processing terms</H2>
      <P>
        As between you and Keep.Books, your firm owns its data and its clients' data. We process it only to provide the service and on your
        firm's instructions, we keep it confidential, and we use only the subprocessors listed in our{" "}
        <Link href="/privacy" className="font-medium text-slate-900 hover:underline">
          Privacy Policy
        </Link>
        , with notice before we add a new one. If we confirm a data breach, we'll report it to your firm within 24 hours of that confirmation.
        We'll help your firm respond to a data subject's privacy request about records your firm controls. When your account ends, we return or
        delete your data on the same 30-day export / 60-day deletion schedule described in our Privacy Policy.
      </P>

      <H2>7. Not professional advice</H2>
      <P>
        Keep.Books is software — it is not accounting, tax, or legal advice. Every report and BIR form Keep.Books produces must be reviewed by
        the bookkeeper before filing. The bookkeeper, not Keep.Books, is responsible for the accuracy of filings and for compliance with BIR
        requirements. Keep.Books is not liable for any BIR penalty or assessment arising from a firm's use of the product.
      </P>

      <H2>8. Acceptable use</H2>
      <P>
        You may not use Keep.Books for anything unlawful, share a single login across more than one firm, attempt to access another firm's data,
        or test the system's security without our prior written permission.
      </P>

      <H2>9. Availability</H2>
      <P>
        We don't guarantee uptime during beta. Maintenance may cause downtime; where possible, we'll announce it in advance.
      </P>

      <H2>10. Termination</H2>
      <P>
        You may close your firm's account at any time. We may suspend an account for breach of these terms or for non-payment. In either case,
        the same export window and deletion schedule in Section 6 applies.
      </P>

      <H2>11. Limitation of liability</H2>
      <P>
        To the extent Philippine law allows, our total liability to you is capped at the fees your firm paid in the 12 months before the claim,
        and we are not liable for indirect or consequential losses.
      </P>

      <H2>12. Changes to these terms</H2>
      <P>We'll notify you by email and in the app before any material change to these terms takes effect.</P>

      <H2>13. Governing law</H2>
      <P>These terms are governed by the laws of the Philippines.</P>

      <p className="mt-10 text-sm text-slate-500">
        See also our{" "}
        <Link href="/privacy" className="font-medium text-slate-900 hover:underline">
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}
