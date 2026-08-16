import { pgEnum } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", [
  "firm_admin",
  "bookkeeper",
  "reviewer",
  "client_user",
]);

export const taxpayerTypeEnum = pgEnum("taxpayer_type", [
  "individual",
  "corporation",
  "partnership",
  "sole_prop",
  "professional",
]);

export const vatStatusEnum = pgEnum("vat_status", ["vat", "non_vat", "vat_exempt"]);

export const incomeTaxRegimeEnum = pgEnum("income_tax_regime", [
  "graduated_itemized",
  "graduated_osd",
  "eight_percent",
  "rcit",
  "mcit_applicable",
]);

export const accountingMethodEnum = pgEnum("accounting_method", ["accrual", "cash"]);

export const booksTypeEnum = pgEnum("books_type", ["manual", "loose_leaf", "cas"]);

export const clientStatusEnum = pgEnum("client_status", ["onboarding", "active", "inactive"]);

export const accountTypeEnum = pgEnum("account_type", [
  "asset",
  "liability",
  "equity",
  "income",
  "expense",
]);

export const normalBalanceEnum = pgEnum("normal_balance", ["debit", "credit"]);

export const journalBookEnum = pgEnum("journal_book", ["GJ", "CRB", "CDB", "SJ", "PJ"]);

export const entryStatusEnum = pgEnum("entry_status", ["draft", "posted", "reversed"]);

export const contactTypeEnum = pgEnum("contact_type", [
  "customer",
  "supplier",
  "both",
  "employee",
]);

export const invoiceTypeEnum = pgEnum("invoice_type", ["invoice", "official_receipt"]);

export const salesStatusEnum = pgEnum("sales_status", [
  "billed",
  "collected",
  "partially_collected",
  "uncollected",
]);

export const purchaseClassificationEnum = pgEnum("purchase_classification", [
  "capital_goods",
  "goods_other_than_capital",
  "services",
  "domestic_purchase_not_qualified",
  "importation",
]);

export const filingFrequencyEnum = pgEnum("filing_frequency", ["monthly", "quarterly", "annual"]);
