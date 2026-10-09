import Link from "next/link";
import { CURRENT_PRIVACY_VERSION, LEGAL_EFFECTIVE_DATE } from "@/lib/legal/versions";

export const metadata = {
  title: "Privacy Policy — Keep.Books",
  description: "How Keep.Books collects, uses, and protects personal data.",
};

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-10 text-xl font-bold tracking-tight text-slate-900">{children}</h2>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-sm leading-relaxed text-slate-700">{children}</p>;
}

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Privacy Policy</h1>
      <p className="mt-2 text-sm text-slate-500">
        Version {CURRENT_PRIVACY_VERSION} · Effective {LEGAL_EFFECTIVE_DATE}
      </p>

      <H2>1. Who we are</H2>
      <P>
        This policy is issued by Keep.Books, operated by Marc. Our contact email, and the contact for our Data Protection Officer, is{" "}
        <a href="mailto:mrcabanador@gmail.com" className="font-medium text-slate-900 hover:underline">
          mrcabanador@gmail.com
        </a>
        .
      </P>

      <H2>2. Our two roles</H2>
      <P>
        For account data belonging to a bookkeeping firm and its staff — names, emails, sign-in records, and similar — Keep.Books acts as the{" "}
        <strong>personal information controller</strong> under the Data Privacy Act of 2012 (RA 10173): we decide why and how that data is
        processed, and we're directly responsible to you for it.
      </P>
      <P>
        For the records a firm's own staff enter about their clients — business names, TINs, addresses, transactions, uploaded documents, and
        payroll data — Keep.Books acts only as a <strong>personal information processor</strong>, processing that data solely on the firm's
        instructions, as the tool the firm chose to run its own practice. If you're the subject of a client record held in Keep.Books (for
        example, you're a client of a bookkeeping firm that uses Keep.Books, or an employee whose payroll a firm processes here), any request
        about that record should go to the bookkeeping firm itself, not to us — they control that data, we just host it on their behalf.
      </P>

      <H2>3. What we collect</H2>
      <P>
        <strong>Account data</strong>, collected directly from the person signing up or invited: full name, email address, the firm's name, and,
        for Google sign-in, the name and email Google provides during authentication. We do not receive your Google password.
      </P>
      <P>
        <strong>Client records entered by bookkeepers</strong>, on the firm's own instructions, as part of running the service: business names,
        trade names, Tax Identification Numbers (TINs), RDO codes, addresses, VAT/tax status, and other registration details; transaction records
        (sales invoices, purchases, cash receipts and disbursements, general journal entries); customer/supplier/employee contact records,
        including their own TINs and addresses where entered; and, on the Premium plan, payroll data (SSS, PhilHealth, and Pag-IBIG numbers, pay
        rates, and computed payslip figures).
      </P>
      <P>
        <strong>Uploaded documents</strong>: this app is built to support attaching a photo or scan of a receipt or invoice to a transaction. At
        the time of this policy, that feature is not yet available to users — no document upload is currently reachable in the product. This
        policy will be updated, and the subprocessor list in Section 5 extended, before that feature goes live.
      </P>
      <P>
        <strong>Security and activity data</strong>: sign-in history (including failed sign-in attempts) and an activity log recording actions
        taken in the product — such as creating or changing a record, signing in, or a role change — each tied to the user who performed it and
        when.
      </P>
      <P>
        <strong>Payment records for our own billing</strong>: Keep.Books currently manages subscription billing manually, outside this
        application — there is no in-app payment or checkout feature, and no payment card or billing data is stored in Keep.Books' own database.
        Any invoice or payment record for a firm's subscription is kept separately as part of that manual process.
      </P>

      <H2>4. Why we collect it</H2>
      <P>
        To provide the service itself (running the product a firm signed up for), to keep accounts secure (sign-in verification, detecting
        suspicious activity), to provide support when something goes wrong, to bill for paid plans, and to meet our own legal obligations. We do
        not sell personal data, and we do not use it for advertising — there is no advertising or ad-targeting functionality anywhere in
        Keep.Books.
      </P>

      <H2>5. Who else handles it</H2>
      <P>Keep.Books itself doesn't run its own servers — the following outside providers process data on our behalf to make the service work:</P>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-slate-700">
        <li>
          <strong>Supabase</strong> — our database, authentication, and file-storage provider. Account data, client records, and activity logs
          are stored in a Supabase-hosted Postgres database; Supabase also handles sign-in (including Google sign-in) and sends account-related
          emails (such as password resets) on our behalf. Hosted in the <strong>ap-south-1 (Mumbai, India)</strong> AWS region.
        </li>
        <li>
          <strong>Vercel</strong> — hosts and runs the Keep.Books application itself (the web pages and server logic you interact with). Vercel
          hosts the application on servers located outside the Philippines.
        </li>
        <li>
          <strong>Google</strong> — if you choose "Continue with Google," Google verifies your identity and shares your name and email with us;
          we never see or store your Google password.
        </li>
        <li>
          <strong>Our email delivery provider</strong> — account emails, such as password resets, are sent through an email delivery service
          located outside the Philippines.
        </li>
      </ul>
      <P>
        Because Supabase, Vercel, and Google all operate outside the Philippines, personal data processed through Keep.Books is stored and
        processed outside the Philippines.
      </P>

      <H2>6. Retention</H2>
      <P>
        We keep data for as long as a firm's account is active. After an account closes, the firm has 30 days to export its data; all of it,
        including backups, is deleted within 60 days of closure. Our own billing records (see Section 3) are kept as long as Philippine tax law
        requires. Bookkeepers remain responsible for retaining their own clients' records for BIR purposes independently of Keep.Books — this
        service is not a substitute for a firm's own record-keeping obligations.
      </P>
      <P>
        At the time of this policy, Keep.Books does not yet have a self-serve "export all my data" or "close my account" feature in the product —
        a firm's own books and reports can be exported individually today, but closing an account and exporting everything at once is currently a
        manual request handled directly with us (see Section 1 for contact details), not an automated in-app process.
      </P>

      <H2>7. Security</H2>
      <P>
        Connections to Keep.Books are encrypted in transit. Each firm's data is isolated from every other firm's at the database level: every
        query is scoped by database-enforced row-level security tied to the firm the signed-in user belongs to, not just application-level
        filtering — so even a bug in the application code can't make one firm's data visible to another firm's query. Staff within a firm get
        role-based access (Owner, Bookkeeper, Reviewer, Encoder, Viewer, each with different read/write scope), every change to a record is
        logged to an activity trail, and our database provider maintains regular backups.
      </P>

      <H2>8. Your rights under the Data Privacy Act</H2>
      <P>
        If you're a Philippine data subject, the Data Privacy Act of 2012 gives you the right to be informed about how your data is processed; to
        access it; to correct it if it's inaccurate; to have it erased or blocked in certain circumstances; to object to processing; to data
        portability; and to file a complaint with the{" "}
        <a href="https://www.privacy.gov.ph" target="_blank" rel="noreferrer" className="font-medium text-slate-900 hover:underline">
          National Privacy Commission
        </a>
        . To make a request, email{" "}
        <a href="mailto:mrcabanador@gmail.com" className="font-medium text-slate-900 hover:underline">
          mrcabanador@gmail.com
        </a>
        . We'll respond within 30 days. If your request concerns a client record rather than your own account (see Section 2), we'll direct you
        to the bookkeeping firm responsible for that record.
      </P>

      <H2>9. Data breaches</H2>
      <P>
        If we confirm a personal data breach, we notify the affected firm(s) within 24 hours of that confirmation. Where the Data Privacy Act
        requires it, we also notify the National Privacy Commission and the affected individuals directly.
      </P>

      <H2>10. Changes to this policy</H2>
      <P>
        We'll notify users by email and in the app before any material change to this policy takes effect, and this page will always show its
        current version number and effective date at the top.
      </P>

      <p className="mt-10 text-sm text-slate-500">
        See also our{" "}
        <Link href="/terms" className="font-medium text-slate-900 hover:underline">
          Terms of Service
        </Link>
        .
      </p>
    </div>
  );
}
