import "server-only";
import { and, eq, gte, lte } from "drizzle-orm";
import { withUserContext } from "@/db/client";
import { journalEntries, purchases, salesInvoices } from "@/db/schema";

export type SalesTotals = {
  vatableSalesCentavos: bigint;
  zeroRatedSalesCentavos: bigint;
  exemptSalesCentavos: bigint;
  outputVatCentavos: bigint;
};

/** Sums posted sales invoices only (excludes drafts and reversed ones) for the period — the VAT-category breakdown Income Statement revenue doesn't carry. */
export async function getSalesTotals(userId: string, clientId: string, from: string, to: string): Promise<SalesTotals> {
  return withUserContext(userId, async (tx) => {
    const rows = await tx
      .select({
        vatableSalesCentavos: salesInvoices.vatableSalesCentavos,
        zeroRatedSalesCentavos: salesInvoices.zeroRatedSalesCentavos,
        exemptSalesCentavos: salesInvoices.exemptSalesCentavos,
        outputVatCentavos: salesInvoices.outputVatCentavos,
      })
      .from(salesInvoices)
      .innerJoin(journalEntries, eq(salesInvoices.journalEntryId, journalEntries.id))
      .where(
        and(
          eq(salesInvoices.clientId, clientId),
          eq(journalEntries.status, "posted"),
          gte(salesInvoices.invoiceDate, from),
          lte(salesInvoices.invoiceDate, to)
        )
      );
    return rows.reduce<SalesTotals>(
      (acc, r) => ({
        vatableSalesCentavos: acc.vatableSalesCentavos + r.vatableSalesCentavos,
        zeroRatedSalesCentavos: acc.zeroRatedSalesCentavos + r.zeroRatedSalesCentavos,
        exemptSalesCentavos: acc.exemptSalesCentavos + r.exemptSalesCentavos,
        outputVatCentavos: acc.outputVatCentavos + r.outputVatCentavos,
      }),
      { vatableSalesCentavos: 0n, zeroRatedSalesCentavos: 0n, exemptSalesCentavos: 0n, outputVatCentavos: 0n }
    );
  });
}

export type PurchaseTotals = {
  vatablePurchasesCentavos: bigint;
  inputVatCentavos: bigint;
};

/** Sums posted purchases only for the period. */
export async function getPurchaseTotals(userId: string, clientId: string, from: string, to: string): Promise<PurchaseTotals> {
  return withUserContext(userId, async (tx) => {
    const rows = await tx
      .select({
        vatablePurchaseCentavos: purchases.vatablePurchaseCentavos,
        inputVatCentavos: purchases.inputVatCentavos,
      })
      .from(purchases)
      .innerJoin(journalEntries, eq(purchases.journalEntryId, journalEntries.id))
      .where(
        and(
          eq(purchases.clientId, clientId),
          eq(journalEntries.status, "posted"),
          gte(purchases.invoiceDate, from),
          lte(purchases.invoiceDate, to)
        )
      );
    return rows.reduce<PurchaseTotals>(
      (acc, r) => ({
        vatablePurchasesCentavos: acc.vatablePurchasesCentavos + r.vatablePurchaseCentavos,
        inputVatCentavos: acc.inputVatCentavos + r.inputVatCentavos,
      }),
      { vatablePurchasesCentavos: 0n, inputVatCentavos: 0n }
    );
  });
}
