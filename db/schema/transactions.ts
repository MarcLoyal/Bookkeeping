import { bigint, date, index, pgTable, smallint, text, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { invoiceTypeEnum, purchaseClassificationEnum, salesStatusEnum } from "./enums";
import { clients } from "./clients";
import { contacts } from "./contacts";
import { journalEntries } from "./journal";
import { accounts } from "./accounts";

export const salesInvoices = pgTable(
  "sales_invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "restrict" }),
    invoiceNo: text("invoice_no").notNull(),
    invoiceDate: date("invoice_date").notNull(),
    // EOPT (RA 11976): "Invoice" is the standard document. official_receipt kept only for legacy pre-2024 records.
    invoiceType: invoiceTypeEnum("invoice_type").notNull().default("invoice"),
    vatableSalesCentavos: bigint("vatable_sales_centavos", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    zeroRatedSalesCentavos: bigint("zero_rated_sales_centavos", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    exemptSalesCentavos: bigint("exempt_sales_centavos", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    outputVatCentavos: bigint("output_vat_centavos", { mode: "bigint" }).notNull().default(sql`0`),
    ewtWithheldByCustomerCentavos: bigint("ewt_withheld_by_customer_centavos", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    totalCentavos: bigint("total_centavos", { mode: "bigint" }).notNull(),
    status: salesStatusEnum("status").notNull().default("billed"),
    collectionDate: date("collection_date"),
    journalEntryId: uuid("journal_entry_id").references(() => journalEntries.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    index("sales_invoices_client_id_idx").on(t.clientId),
    index("sales_invoices_client_date_idx").on(t.clientId, t.invoiceDate),
    index("sales_invoices_contact_id_idx").on(t.contactId),
  ]
);

export const purchases = pgTable(
  "purchases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "restrict" }),
    supplierInvoiceNo: text("supplier_invoice_no").notNull(),
    invoiceDate: date("invoice_date").notNull(),
    purchaseClassification: purchaseClassificationEnum("purchase_classification").notNull(),
    vatablePurchaseCentavos: bigint("vatable_purchase_centavos", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    inputVatCentavos: bigint("input_vat_centavos", { mode: "bigint" }).notNull().default(sql`0`),
    exemptPurchaseCentavos: bigint("exempt_purchase_centavos", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    zeroRatedPurchaseCentavos: bigint("zero_rated_purchase_centavos", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    ewtApplicable: text("ewt_applicable").notNull().default("no"), // "yes" | "no" — kept as text to avoid a throwaway boolean-vs-tri-state debate pre-Phase-3
    ewtCode: text("ewt_code"),
    ewtAmountCentavos: bigint("ewt_amount_centavos", { mode: "bigint" }).notNull().default(sql`0`),
    totalCentavos: bigint("total_centavos", { mode: "bigint" }).notNull(),
    journalEntryId: uuid("journal_entry_id").references(() => journalEntries.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    index("purchases_client_id_idx").on(t.clientId),
    index("purchases_client_date_idx").on(t.clientId, t.invoiceDate),
    index("purchases_contact_id_idx").on(t.contactId),
  ]
);

export const cashReceipts = pgTable(
  "cash_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    receiptDate: date("receipt_date").notNull(),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    particulars: text("particulars").notNull(),
    bankCashAccountId: uuid("bank_cash_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    referenceNo: text("reference_no"),
    totalCentavos: bigint("total_centavos", { mode: "bigint" }).notNull(),
    journalEntryId: uuid("journal_entry_id").references(() => journalEntries.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    index("cash_receipts_client_id_idx").on(t.clientId),
    index("cash_receipts_client_date_idx").on(t.clientId, t.receiptDate),
  ]
);

export const cashReceiptLines = pgTable(
  "cash_receipt_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cashReceiptId: uuid("cash_receipt_id")
      .notNull()
      .references(() => cashReceipts.id, { onDelete: "cascade" }),
    lineNo: smallint("line_no").notNull(),
    allocationAccountId: uuid("allocation_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    amountCentavos: bigint("amount_centavos", { mode: "bigint" }).notNull(),
    memo: text("memo"),
  },
  (t) => [index("cash_receipt_lines_receipt_id_idx").on(t.cashReceiptId)]
);

export const cashDisbursements = pgTable(
  "cash_disbursements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    disbursementDate: date("disbursement_date").notNull(),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    particulars: text("particulars").notNull(),
    bankCashAccountId: uuid("bank_cash_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    referenceNo: text("reference_no"),
    totalCentavos: bigint("total_centavos", { mode: "bigint" }).notNull(),
    journalEntryId: uuid("journal_entry_id").references(() => journalEntries.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    index("cash_disbursements_client_id_idx").on(t.clientId),
    index("cash_disbursements_client_date_idx").on(t.clientId, t.disbursementDate),
  ]
);

export const cashDisbursementLines = pgTable(
  "cash_disbursement_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cashDisbursementId: uuid("cash_disbursement_id")
      .notNull()
      .references(() => cashDisbursements.id, { onDelete: "cascade" }),
    lineNo: smallint("line_no").notNull(),
    allocationAccountId: uuid("allocation_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    amountCentavos: bigint("amount_centavos", { mode: "bigint" }).notNull(),
    memo: text("memo"),
  },
  (t) => [index("cash_disbursement_lines_disbursement_id_idx").on(t.cashDisbursementId)]
);
