import "server-only";
import { and, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { withUserContext, type Db } from "@/db/client";
import {
  accounts,
  cashDisbursementLines,
  cashDisbursements,
  cashReceiptLines,
  cashReceipts,
  journalEntries,
  journalLines,
  periodLocks,
  purchases,
  salesInvoices,
} from "@/db/schema";
import {
  buildCashDisbursementLines,
  buildCashReceiptLines,
  buildGeneralJournalLines,
  buildPurchaseLines,
  buildReversalLines,
  buildSalesInvoiceLines,
  isDateLocked,
  type LineDraft,
} from "@/lib/accounting/posting";

export class PeriodLockedError extends Error {
  constructor(date: string) {
    super(`The period containing ${date} is locked for this client.`);
    this.name = "PeriodLockedError";
  }
}

async function getAccountIdByCode(tx: Db, clientId: string, code: string): Promise<string> {
  const [row] = await tx
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.clientId, clientId), eq(accounts.code, code)))
    .limit(1);
  if (!row) throw new Error(`Account code ${code} not found for client ${clientId}`);
  return row.id;
}

async function assertNotLocked(tx: Db, clientId: string, entryDate: string) {
  const locks = await tx
    .select({
      periodStart: periodLocks.periodStart,
      periodEnd: periodLocks.periodEnd,
      unlockedAt: periodLocks.unlockedAt,
    })
    .from(periodLocks)
    .where(eq(periodLocks.clientId, clientId));
  const normalized = locks.map((l) => ({
    periodStart: l.periodStart,
    periodEnd: l.periodEnd,
    unlockedAt: l.unlockedAt ? l.unlockedAt.toISOString() : null,
  }));
  if (isDateLocked(entryDate, normalized)) {
    throw new PeriodLockedError(entryDate);
  }
}

/** Inserts a draft entry + lines, then posts it (assigns gapless entry_no, flips status). The DB triggers re-verify balance/lock/immutability regardless. */
async function postEntry(
  tx: Db,
  params: {
    clientId: string;
    book: "GJ" | "CRB" | "CDB" | "SJ" | "PJ";
    entryDate: string;
    description: string;
    referenceNo?: string;
    lines: LineDraft[];
    postedBy: string;
    reversalOfEntryId?: string;
  }
): Promise<string> {
  await assertNotLocked(tx, params.clientId, params.entryDate);

  // Generate the id ourselves and skip `.returning()` — see the comment on
  // createClient() in lib/data/clients.ts for why RETURNING fails under RLS here.
  const entryId = crypto.randomUUID();
  await tx.insert(journalEntries).values({
    id: entryId,
    clientId: params.clientId,
    book: params.book,
    entryDate: params.entryDate,
    description: params.description,
    referenceNo: params.referenceNo,
    status: "draft",
    createdBy: params.postedBy,
    reversalOfEntryId: params.reversalOfEntryId,
  });

  await tx.insert(journalLines).values(
    params.lines.map((l, i) => ({
      entryId,
      lineNo: i + 1,
      accountId: l.accountId,
      debitCentavos: l.debitCentavos,
      creditCentavos: l.creditCentavos,
      memo: l.memo,
      contactId: l.contactId,
    }))
  );

  const [{ next }] = (await tx.execute(
    sql`select assign_client_entry_no(${params.clientId}) as next`
  )) as unknown as { next: number }[];

  await tx
    .update(journalEntries)
    .set({ status: "posted", entryNo: next, postedBy: params.postedBy, postedAt: new Date() })
    .where(eq(journalEntries.id, entryId));

  return entryId;
}

export type SalesInvoiceInput = {
  clientId: string;
  contactId: string;
  invoiceNo: string;
  invoiceDate: string;
  vatableSalesCentavos: bigint;
  zeroRatedSalesCentavos: bigint;
  exemptSalesCentavos: bigint;
  outputVatCentavos: bigint;
  totalCentavos: bigint;
};

export async function postSalesInvoice(userId: string, input: SalesInvoiceInput): Promise<string> {
  return withUserContext(userId, async (tx) => {
    const [arId, vatableId, zeroId, exemptId, outputVatId] = await Promise.all([
      getAccountIdByCode(tx, input.clientId, "1030"),
      getAccountIdByCode(tx, input.clientId, "4010"),
      getAccountIdByCode(tx, input.clientId, "4020"),
      getAccountIdByCode(tx, input.clientId, "4030"),
      getAccountIdByCode(tx, input.clientId, "2020"),
    ]);

    const lines = buildSalesInvoiceLines({
      contactId: input.contactId,
      arAccountId: arId,
      vatableSalesAccountId: vatableId,
      zeroRatedSalesAccountId: zeroId,
      exemptSalesAccountId: exemptId,
      outputVatAccountId: outputVatId,
      totalCentavos: input.totalCentavos,
      vatableSalesCentavos: input.vatableSalesCentavos,
      zeroRatedSalesCentavos: input.zeroRatedSalesCentavos,
      exemptSalesCentavos: input.exemptSalesCentavos,
      outputVatCentavos: input.outputVatCentavos,
      memo: `Sales Invoice ${input.invoiceNo}`,
    });

    const invoiceId = crypto.randomUUID();
    await tx.insert(salesInvoices).values({
      id: invoiceId,
      clientId: input.clientId,
      contactId: input.contactId,
      invoiceNo: input.invoiceNo,
      invoiceDate: input.invoiceDate,
      invoiceType: "invoice",
      vatableSalesCentavos: input.vatableSalesCentavos,
      zeroRatedSalesCentavos: input.zeroRatedSalesCentavos,
      exemptSalesCentavos: input.exemptSalesCentavos,
      outputVatCentavos: input.outputVatCentavos,
      totalCentavos: input.totalCentavos,
      status: "billed",
    });

    const entryId = await postEntry(tx, {
      clientId: input.clientId,
      book: "SJ",
      entryDate: input.invoiceDate,
      description: `Sales Invoice ${input.invoiceNo}`,
      referenceNo: input.invoiceNo,
      lines,
      postedBy: userId,
    });

    await tx.update(salesInvoices).set({ journalEntryId: entryId }).where(eq(salesInvoices.id, invoiceId));
    return entryId;
  });
}

export type PurchaseInput = {
  clientId: string;
  contactId: string;
  supplierInvoiceNo: string;
  invoiceDate: string;
  purchaseClassification: "capital_goods" | "goods_other_than_capital" | "services" | "domestic_purchase_not_qualified" | "importation";
  expenseAccountCode: string;
  vatablePurchaseCentavos: bigint;
  exemptPurchaseCentavos: bigint;
  zeroRatedPurchaseCentavos: bigint;
  inputVatCentavos: bigint;
  ewtAmountCentavos: bigint;
  ewtCode?: string;
  totalCentavos: bigint;
};

export async function postPurchase(userId: string, input: PurchaseInput): Promise<string> {
  return withUserContext(userId, async (tx) => {
    const [expenseId, inputVatId, apId, ewtPayableId] = await Promise.all([
      getAccountIdByCode(tx, input.clientId, input.expenseAccountCode),
      getAccountIdByCode(tx, input.clientId, "1050"),
      getAccountIdByCode(tx, input.clientId, "2010"),
      getAccountIdByCode(tx, input.clientId, "2050"),
    ]);

    const lines = buildPurchaseLines({
      contactId: input.contactId,
      expenseAccountId: expenseId,
      inputVatAccountId: inputVatId,
      apAccountId: apId,
      ewtPayableAccountId: ewtPayableId,
      totalCentavos: input.totalCentavos,
      vatablePurchaseCentavos: input.vatablePurchaseCentavos,
      exemptPurchaseCentavos: input.exemptPurchaseCentavos,
      zeroRatedPurchaseCentavos: input.zeroRatedPurchaseCentavos,
      inputVatCentavos: input.inputVatCentavos,
      ewtAmountCentavos: input.ewtAmountCentavos,
      memo: `Purchase ${input.supplierInvoiceNo}`,
    });

    const purchaseId = crypto.randomUUID();
    await tx.insert(purchases).values({
      id: purchaseId,
      clientId: input.clientId,
      contactId: input.contactId,
      supplierInvoiceNo: input.supplierInvoiceNo,
      invoiceDate: input.invoiceDate,
      purchaseClassification: input.purchaseClassification,
      vatablePurchaseCentavos: input.vatablePurchaseCentavos,
      exemptPurchaseCentavos: input.exemptPurchaseCentavos,
      zeroRatedPurchaseCentavos: input.zeroRatedPurchaseCentavos,
      inputVatCentavos: input.inputVatCentavos,
      ewtApplicable: input.ewtAmountCentavos > 0n ? "yes" : "no",
      ewtCode: input.ewtCode,
      ewtAmountCentavos: input.ewtAmountCentavos,
      totalCentavos: input.totalCentavos,
    });

    const entryId = await postEntry(tx, {
      clientId: input.clientId,
      book: "PJ",
      entryDate: input.invoiceDate,
      description: `Purchase ${input.supplierInvoiceNo}`,
      referenceNo: input.supplierInvoiceNo,
      lines,
      postedBy: userId,
    });

    await tx.update(purchases).set({ journalEntryId: entryId }).where(eq(purchases.id, purchaseId));
    return entryId;
  });
}

export type AllocationInput = { accountCode: string; amountCentavos: bigint; memo?: string };

export type CashReceiptInput = {
  clientId: string;
  contactId?: string;
  receiptDate: string;
  particulars: string;
  bankCashAccountCode: string;
  referenceNo?: string;
  totalCentavos: bigint;
  allocations: AllocationInput[];
};

export async function postCashReceipt(userId: string, input: CashReceiptInput): Promise<string> {
  return withUserContext(userId, async (tx) => {
    const bankId = await getAccountIdByCode(tx, input.clientId, input.bankCashAccountCode);
    const allocations = await Promise.all(
      input.allocations.map(async (a) => ({
        accountId: await getAccountIdByCode(tx, input.clientId, a.accountCode),
        amountCentavos: a.amountCentavos,
        memo: a.memo,
      }))
    );

    const lines = buildCashReceiptLines({
      contactId: input.contactId,
      bankCashAccountId: bankId,
      totalCentavos: input.totalCentavos,
      allocations,
      memo: input.particulars,
    });

    const receiptId = crypto.randomUUID();
    await tx.insert(cashReceipts).values({
      id: receiptId,
      clientId: input.clientId,
      receiptDate: input.receiptDate,
      contactId: input.contactId,
      particulars: input.particulars,
      bankCashAccountId: bankId,
      referenceNo: input.referenceNo,
      totalCentavos: input.totalCentavos,
    });

    await tx.insert(cashReceiptLines).values(
      allocations.map((a, i) => ({
        cashReceiptId: receiptId,
        lineNo: i + 1,
        allocationAccountId: a.accountId,
        amountCentavos: a.amountCentavos,
        memo: a.memo,
      }))
    );

    const entryId = await postEntry(tx, {
      clientId: input.clientId,
      book: "CRB",
      entryDate: input.receiptDate,
      description: input.particulars,
      referenceNo: input.referenceNo,
      lines,
      postedBy: userId,
    });

    await tx.update(cashReceipts).set({ journalEntryId: entryId }).where(eq(cashReceipts.id, receiptId));
    return entryId;
  });
}

export type CashDisbursementInput = {
  clientId: string;
  contactId?: string;
  disbursementDate: string;
  particulars: string;
  bankCashAccountCode: string;
  referenceNo?: string;
  totalCentavos: bigint;
  allocations: AllocationInput[];
};

export async function postCashDisbursement(userId: string, input: CashDisbursementInput): Promise<string> {
  return withUserContext(userId, async (tx) => {
    const bankId = await getAccountIdByCode(tx, input.clientId, input.bankCashAccountCode);
    const allocations = await Promise.all(
      input.allocations.map(async (a) => ({
        accountId: await getAccountIdByCode(tx, input.clientId, a.accountCode),
        amountCentavos: a.amountCentavos,
        memo: a.memo,
      }))
    );

    const lines = buildCashDisbursementLines({
      contactId: input.contactId,
      bankCashAccountId: bankId,
      totalCentavos: input.totalCentavos,
      allocations,
      memo: input.particulars,
    });

    const disbursementId = crypto.randomUUID();
    await tx.insert(cashDisbursements).values({
      id: disbursementId,
      clientId: input.clientId,
      disbursementDate: input.disbursementDate,
      contactId: input.contactId,
      particulars: input.particulars,
      bankCashAccountId: bankId,
      referenceNo: input.referenceNo,
      totalCentavos: input.totalCentavos,
    });

    await tx.insert(cashDisbursementLines).values(
      allocations.map((a, i) => ({
        cashDisbursementId: disbursementId,
        lineNo: i + 1,
        allocationAccountId: a.accountId,
        amountCentavos: a.amountCentavos,
        memo: a.memo,
      }))
    );

    const entryId = await postEntry(tx, {
      clientId: input.clientId,
      book: "CDB",
      entryDate: input.disbursementDate,
      description: input.particulars,
      referenceNo: input.referenceNo,
      lines,
      postedBy: userId,
    });

    await tx
      .update(cashDisbursements)
      .set({ journalEntryId: entryId })
      .where(eq(cashDisbursements.id, disbursementId));
    return entryId;
  });
}

export type GeneralJournalLineInput = { accountCode: string; debitCentavos: bigint; creditCentavos: bigint; memo?: string };

export type GeneralJournalInput = {
  clientId: string;
  entryDate: string;
  description: string;
  referenceNo?: string;
  lines: GeneralJournalLineInput[];
};

export async function postGeneralJournal(userId: string, input: GeneralJournalInput): Promise<string> {
  return withUserContext(userId, async (tx) => {
    const resolved = await Promise.all(
      input.lines.map(async (l) => ({
        accountId: await getAccountIdByCode(tx, input.clientId, l.accountCode),
        debitCentavos: l.debitCentavos,
        creditCentavos: l.creditCentavos,
        memo: l.memo,
      }))
    );
    const lines = buildGeneralJournalLines(resolved);

    return postEntry(tx, {
      clientId: input.clientId,
      book: "GJ",
      entryDate: input.entryDate,
      description: input.description,
      referenceNo: input.referenceNo,
      lines,
      postedBy: userId,
    });
  });
}

/** Records a reversing entry for `entryId`, dated `reversalDate`. The original stays posted; its status flips to 'reversed' (the one mutation the immutability trigger allows). */
export async function reverseJournalEntry(
  userId: string,
  clientId: string,
  entryId: string,
  reversalDate: string,
  reason: string
): Promise<string> {
  return withUserContext(userId, async (tx) => {
    const [original] = await tx
      .select()
      .from(journalEntries)
      .where(and(eq(journalEntries.id, entryId), eq(journalEntries.clientId, clientId)))
      .limit(1);
    if (!original) throw new Error("Journal entry not found");
    if (original.status !== "posted") throw new Error(`Only a posted entry can be reversed (current status: ${original.status})`);

    const originalLines = await tx.select().from(journalLines).where(eq(journalLines.entryId, entryId));
    const reversalLines = buildReversalLines(
      originalLines.map((l) => ({
        accountId: l.accountId,
        debitCentavos: l.debitCentavos,
        creditCentavos: l.creditCentavos,
        memo: l.memo ?? undefined,
        contactId: l.contactId ?? undefined,
      }))
    );

    const reversalEntryId = await postEntry(tx, {
      clientId,
      book: original.book,
      entryDate: reversalDate,
      description: `Reversal of ${original.description} — ${reason}`,
      referenceNo: original.referenceNo ?? undefined,
      lines: reversalLines,
      postedBy: userId,
      reversalOfEntryId: entryId,
    });

    // The ONLY mutation immutability allows on a posted entry: flipping to
    // 'reversed'. reversal_of_entry_id lives on the NEW entry (pointing back
    // at this one), never edited here.
    await tx.update(journalEntries).set({ status: "reversed" }).where(eq(journalEntries.id, entryId));

    return reversalEntryId;
  });
}
