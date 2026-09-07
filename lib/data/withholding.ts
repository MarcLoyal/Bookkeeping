import "server-only";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { withUserContext } from "@/db/client";
import { contacts, journalEntries, purchases } from "@/db/schema";
import { sumCentavos } from "@/lib/money";

/** One posted purchase with expanded withholding tax (creditable at source), for the period. */
type WithheldPurchaseRow = {
  invoiceDate: string;
  ewtCode: string | null;
  ewtAmountCentavos: bigint;
  vatablePurchaseCentavos: bigint;
  contactId: string;
  contactName: string;
  contactTin: string | null;
  contactAddress: string | null;
};

async function listWithheldPurchases(userId: string, clientId: string, from: string, to: string): Promise<WithheldPurchaseRow[]> {
  return withUserContext(userId, (tx) =>
    tx
      .select({
        invoiceDate: purchases.invoiceDate,
        ewtCode: purchases.ewtCode,
        ewtAmountCentavos: purchases.ewtAmountCentavos,
        vatablePurchaseCentavos: purchases.vatablePurchaseCentavos,
        contactId: contacts.id,
        contactName: contacts.registeredName,
        contactTin: contacts.tin,
        contactAddress: contacts.address,
      })
      .from(purchases)
      .innerJoin(journalEntries, eq(purchases.journalEntryId, journalEntries.id))
      .innerJoin(contacts, eq(purchases.contactId, contacts.id))
      .where(
        and(
          eq(purchases.clientId, clientId),
          eq(purchases.ewtApplicable, "yes"),
          eq(journalEntries.status, "posted"),
          gte(purchases.invoiceDate, from),
          lte(purchases.invoiceDate, to)
        )
      )
      .orderBy(asc(purchases.invoiceDate))
  );
}

export type AtcScheduleRow = {
  atcCode: string;
  taxBaseCentavos: bigint;
  taxWithheldCentavos: bigint;
};

/** Groups withheld purchases by ATC code — for BIR Form 1601-EQ's Part II schedule (Schedule of ATC, Tax Base, Tax Withheld). Rows with no code entered are grouped under "" (uncoded). */
export async function getWithholdingByAtcCode(userId: string, clientId: string, from: string, to: string): Promise<AtcScheduleRow[]> {
  const rows = await listWithheldPurchases(userId, clientId, from, to);
  const byCode = new Map<string, AtcScheduleRow>();
  for (const r of rows) {
    const code = (r.ewtCode ?? "").toUpperCase().trim();
    const existing = byCode.get(code) ?? { atcCode: code, taxBaseCentavos: 0n, taxWithheldCentavos: 0n };
    existing.taxBaseCentavos += r.vatablePurchaseCentavos;
    existing.taxWithheldCentavos += r.ewtAmountCentavos;
    byCode.set(code, existing);
  }
  return [...byCode.values()].sort((a, b) => a.atcCode.localeCompare(b.atcCode));
}

export type WithholdingCertificateRow = {
  atcCode: string;
  /** Income payment (tax base) bucketed by calendar month (1-12) within the requested period, for BIR Form 2307's "1st/2nd/3rd Month of the Quarter" columns. */
  monthlyIncomePaymentCentavos: Map<number, bigint>;
  totalIncomePaymentCentavos: bigint;
  totalTaxWithheldCentavos: bigint;
};

export type WithholdingCertificate = {
  contactId: string;
  contactName: string;
  contactTin: string | null;
  contactAddress: string | null;
  /** One row per ATC code paid to this contact in the period — the real form lists a separate line per income-payment category. */
  rows: WithholdingCertificateRow[];
  grandTotalTaxWithheldCentavos: bigint;
};

/** Per-payee withholding summary for BIR Form 2307 (Certificate of Creditable Tax Withheld at Source) — one certificate per contact per period, broken down by ATC code as the real form's Part III does. */
export async function getWithholdingCertificates(userId: string, clientId: string, from: string, to: string): Promise<WithholdingCertificate[]> {
  const rows = await listWithheldPurchases(userId, clientId, from, to);
  type ContactAccumulator = {
    contactName: string;
    contactTin: string | null;
    contactAddress: string | null;
    atcRows: Map<string, WithholdingCertificateRow>;
  };
  const byContact = new Map<string, ContactAccumulator>();
  for (const r of rows) {
    const contact = byContact.get(r.contactId) ?? {
      contactName: r.contactName,
      contactTin: r.contactTin,
      contactAddress: r.contactAddress,
      atcRows: new Map<string, WithholdingCertificateRow>(),
    };
    const code = (r.ewtCode ?? "").toUpperCase().trim();
    const existing = contact.atcRows.get(code) ?? {
      atcCode: code,
      monthlyIncomePaymentCentavos: new Map<number, bigint>(),
      totalIncomePaymentCentavos: 0n,
      totalTaxWithheldCentavos: 0n,
    };
    const month = Number(r.invoiceDate.slice(5, 7));
    existing.monthlyIncomePaymentCentavos.set(month, (existing.monthlyIncomePaymentCentavos.get(month) ?? 0n) + r.vatablePurchaseCentavos);
    existing.totalIncomePaymentCentavos += r.vatablePurchaseCentavos;
    existing.totalTaxWithheldCentavos += r.ewtAmountCentavos;
    contact.atcRows.set(code, existing);
    byContact.set(r.contactId, contact);
  }
  return [...byContact.entries()]
    .map(([contactId, contact]) => {
      const rowList = [...contact.atcRows.values()].sort((a, b) => a.atcCode.localeCompare(b.atcCode));
      return {
        contactId,
        contactName: contact.contactName,
        contactTin: contact.contactTin,
        contactAddress: contact.contactAddress,
        rows: rowList,
        grandTotalTaxWithheldCentavos: sumCentavos(rowList.map((r) => r.totalTaxWithheldCentavos)),
      };
    })
    .sort((a, b) => a.contactName.localeCompare(b.contactName));
}
