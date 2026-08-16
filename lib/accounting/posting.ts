import { sumCentavos, type Centavos } from "../money";

/**
 * Pure, DB-free accounting logic (spec §13: "no framework or DB imports").
 * Route handlers/server actions resolve account codes to account ids, then
 * call these builders and persist the result inside a single DB transaction
 * (insert entry as draft -> insert lines -> flip status to posted), where the
 * DB triggers in db/sql/001_functions_triggers_rls.sql re-verify balance,
 * immutability, and period locks regardless of what this code computed.
 */

export type LineDraft = {
  accountId: string;
  debitCentavos: Centavos;
  creditCentavos: Centavos;
  memo?: string;
  contactId?: string;
};

export class UnbalancedEntryError extends Error {
  constructor(debit: Centavos, credit: Centavos) {
    super(`Journal lines do not balance: debit=${debit} credit=${credit}`);
    this.name = "UnbalancedEntryError";
  }
}

/** Throws UnbalancedEntryError unless every line's debit/credit sums are equal and nonzero. */
export function assertBalanced(lines: LineDraft[]): void {
  const debit = sumCentavos(lines.map((l) => l.debitCentavos));
  const credit = sumCentavos(lines.map((l) => l.creditCentavos));
  if (debit !== credit) throw new UnbalancedEntryError(debit, credit);
  if (debit === 0n) throw new UnbalancedEntryError(debit, credit);
}

/** Drops zero-amount lines — callers may pass e.g. a zero zero-rated-sales bucket for a fully-vatable invoice. */
function nonZero(lines: LineDraft[]): LineDraft[] {
  return lines.filter((l) => l.debitCentavos !== 0n || l.creditCentavos !== 0n);
}

function debit(accountId: string, amount: Centavos, memo?: string, contactId?: string): LineDraft {
  return { accountId, debitCentavos: amount, creditCentavos: 0n, memo, contactId };
}
function credit(accountId: string, amount: Centavos, memo?: string, contactId?: string): LineDraft {
  return { accountId, debitCentavos: 0n, creditCentavos: amount, memo, contactId };
}

/**
 * Sales Invoice, billed at invoice date (EOPT accrual — spec §6 M7). The
 * customer's EWT withheld is recorded on the invoice for reference/SLSP
 * purposes only; it is not journalized here. It's realized as an allocation
 * line on the Cash Receipt recorded when the invoice is actually collected.
 */
export function buildSalesInvoiceLines(input: {
  contactId: string;
  arAccountId: string;
  vatableSalesAccountId: string;
  zeroRatedSalesAccountId: string;
  exemptSalesAccountId: string;
  outputVatAccountId: string;
  totalCentavos: Centavos;
  vatableSalesCentavos: Centavos;
  zeroRatedSalesCentavos: Centavos;
  exemptSalesCentavos: Centavos;
  outputVatCentavos: Centavos;
  memo?: string;
}): LineDraft[] {
  const lines = nonZero([
    debit(input.arAccountId, input.totalCentavos, input.memo, input.contactId),
    credit(input.vatableSalesAccountId, input.vatableSalesCentavos, input.memo, input.contactId),
    credit(input.zeroRatedSalesAccountId, input.zeroRatedSalesCentavos, input.memo, input.contactId),
    credit(input.exemptSalesAccountId, input.exemptSalesCentavos, input.memo, input.contactId),
    credit(input.outputVatAccountId, input.outputVatCentavos, input.memo, input.contactId),
  ]);
  assertBalanced(lines);
  return lines;
}

/**
 * Purchase invoice. `expenseAccountId` is chosen by the bookkeeper on the
 * form (spec §5.3 stores purchase_classification for tax computation, not as
 * a hardcoded account mapping). EWT withheld reduces the payable to the
 * supplier and creates a liability to remit to the BIR.
 */
export function buildPurchaseLines(input: {
  contactId: string;
  expenseAccountId: string;
  inputVatAccountId: string;
  apAccountId: string;
  ewtPayableAccountId: string;
  totalCentavos: Centavos;
  vatablePurchaseCentavos: Centavos;
  exemptPurchaseCentavos: Centavos;
  zeroRatedPurchaseCentavos: Centavos;
  inputVatCentavos: Centavos;
  ewtAmountCentavos: Centavos;
  memo?: string;
}): LineDraft[] {
  const netExpense = sumCentavos([
    input.vatablePurchaseCentavos,
    input.exemptPurchaseCentavos,
    input.zeroRatedPurchaseCentavos,
  ]);
  const payable = input.totalCentavos - input.ewtAmountCentavos;
  const lines = nonZero([
    debit(input.expenseAccountId, netExpense, input.memo, input.contactId),
    debit(input.inputVatAccountId, input.inputVatCentavos, input.memo, input.contactId),
    credit(input.apAccountId, payable, input.memo, input.contactId),
    credit(input.ewtPayableAccountId, input.ewtAmountCentavos, input.memo, input.contactId),
  ]);
  assertBalanced(lines);
  return lines;
}

/** Cash Receipt: Dr bank/cash, Cr each allocation line. */
export function buildCashReceiptLines(input: {
  contactId?: string;
  bankCashAccountId: string;
  totalCentavos: Centavos;
  allocations: { accountId: string; amountCentavos: Centavos; memo?: string }[];
  memo?: string;
}): LineDraft[] {
  const lines = nonZero([
    debit(input.bankCashAccountId, input.totalCentavos, input.memo, input.contactId),
    ...input.allocations.map((a) => credit(a.accountId, a.amountCentavos, a.memo, input.contactId)),
  ]);
  assertBalanced(lines);
  return lines;
}

/** Cash Disbursement: Dr each allocation line, Cr bank/cash. */
export function buildCashDisbursementLines(input: {
  contactId?: string;
  bankCashAccountId: string;
  totalCentavos: Centavos;
  allocations: { accountId: string; amountCentavos: Centavos; memo?: string }[];
  memo?: string;
}): LineDraft[] {
  const lines = nonZero([
    ...input.allocations.map((a) => debit(a.accountId, a.amountCentavos, a.memo, input.contactId)),
    credit(input.bankCashAccountId, input.totalCentavos, input.memo, input.contactId),
  ]);
  assertBalanced(lines);
  return lines;
}

/** General Journal: lines are entered directly by the bookkeeper — just validated. */
export function buildGeneralJournalLines(lines: LineDraft[]): LineDraft[] {
  const cleaned = nonZero(lines);
  assertBalanced(cleaned);
  return cleaned;
}

/**
 * Reversal: mirrors every line (debit<->credit swapped), same accounts,
 * dated as given (normally today, or period-end if the original period is
 * closed off but still open for adjustment — the caller decides).
 */
export function buildReversalLines(originalLines: LineDraft[]): LineDraft[] {
  return originalLines.map((l) => ({
    accountId: l.accountId,
    debitCentavos: l.creditCentavos,
    creditCentavos: l.debitCentavos,
    memo: l.memo ? `Reversal: ${l.memo}` : "Reversal",
    contactId: l.contactId,
  }));
}

export type PeriodLockRange = { periodStart: string; periodEnd: string; unlockedAt: string | null };

/** Pure date-range check mirroring the DB trigger in enforce_period_lock() — used for a fast pre-flight UI error before hitting the DB. */
export function isDateLocked(entryDateIso: string, locks: PeriodLockRange[]): boolean {
  return locks.some(
    (l) => l.unlockedAt === null && entryDateIso >= l.periodStart && entryDateIso <= l.periodEnd
  );
}
