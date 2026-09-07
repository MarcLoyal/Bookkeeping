import { notFound } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { getClient } from "@/lib/data/clients";
import { getContact } from "@/lib/data/contacts";
import { getWithholdingCertificates } from "@/lib/data/withholding";
import { quarterLabelFor } from "@/lib/tax/quarter-label";
import { PrintButton } from "../../../reports/[report]/print-button";
import { Bir2307Certificate } from "./bir-2307-certificate";

function defaultQuarterRange(): { from: string; to: string } {
  const now = new Date();
  const quarterStartMonth = Math.floor(now.getUTCMonth() / 3) * 3;
  const from = new Date(Date.UTC(now.getUTCFullYear(), quarterStartMonth, 1)).toISOString().slice(0, 10);
  const to = new Date(Date.UTC(now.getUTCFullYear(), quarterStartMonth + 3, 0)).toISOString().slice(0, 10);
  return { from, to };
}

export default async function Bir2307Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; contactId: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const user = await requireCurrentUser();
  const { id, contactId } = await params;

  const [client, contact] = await Promise.all([getClient(user.id, id), getContact(user.id, id, contactId)]);
  if (!client || !contact) notFound();

  const range = await searchParams;
  const { from, to } = { from: range.from || defaultQuarterRange().from, to: range.to || defaultQuarterRange().to };

  const certificates = await getWithholdingCertificates(user.id, id, from, to);
  const payee = certificates.find((c) => c.contactId === contactId) ?? {
    contactId,
    contactName: contact.registeredName,
    contactTin: contact.tin,
    contactAddress: contact.address,
    rows: [],
    grandTotalTaxWithheldCentavos: 0n,
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">BIR Form 2307 — {contact.registeredName}</h2>
          <p className="mt-1 text-sm text-slate-500">{quarterLabelFor(from)} certificate of creditable tax withheld at source.</p>
        </div>
        <form className="no-print flex items-center gap-2 text-sm" action={`/clients/${id}/contacts/${contactId}/2307`}>
          <input type="date" name="from" defaultValue={from} className="rounded-md border border-slate-300 px-2 py-1 text-sm" />
          <span className="text-slate-400">to</span>
          <input type="date" name="to" defaultValue={to} className="rounded-md border border-slate-300 px-2 py-1 text-sm" />
          <button type="submit" className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium hover:bg-slate-100">
            Apply
          </button>
          <PrintButton />
        </form>
      </div>

      <div className="mb-4 mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
        <p className="font-semibold">Computation aid, not an official form.</p>
        <p className="mt-1">
          Figures come from this client&apos;s posted purchases where expanded withholding tax was flagged. This
          replica only fills in lines this app has real data for — verify against the current form and your own
          records before issuing.
        </p>
      </div>

      <Bir2307Certificate
        payee={payee}
        payor={{ registeredName: client.registeredName, tin: client.tin, address: client.address }}
        from={from}
        to={to}
      />
    </div>
  );
}
