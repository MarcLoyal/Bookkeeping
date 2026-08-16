import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import {
  accountingMethodEnum,
  booksTypeEnum,
  clientStatusEnum,
  filingFrequencyEnum,
  incomeTaxRegimeEnum,
  taxpayerTypeEnum,
  vatStatusEnum,
} from "./enums";
import { firms } from "./firms";

export const clients = pgTable(
  "clients",
  {
  id: uuid("id").primaryKey().defaultRandom(),
  firmId: uuid("firm_id")
    .notNull()
    .references(() => firms.id, { onDelete: "cascade" }),
  registeredName: text("registered_name").notNull(),
  tradeName: text("trade_name"),
  tin: text("tin").notNull(), // format 000-000-000-00000
  rdoCode: text("rdo_code").notNull(),
  taxpayerType: taxpayerTypeEnum("taxpayer_type").notNull(),
  vatStatus: vatStatusEnum("vat_status").notNull(),
  incomeTaxRegime: incomeTaxRegimeEnum("income_tax_regime").notNull(),
  fiscalYearEndMonth: smallint("fiscal_year_end_month").notNull().default(12),
  accountingMethod: accountingMethodEnum("accounting_method").notNull().default("accrual"),
  booksType: booksTypeEnum("books_type").notNull().default("loose_leaf"),
  ptuNumber: text("ptu_number"),
  ptuDate: date("ptu_date"),
  orusRegistrationRef: text("orus_registration_ref"),
  withholdingAgent: boolean("withholding_agent").notNull().default(false),
  topWithholdingAgent: boolean("top_withholding_agent").notNull().default(false),
  address: text("address").notNull(),
  contact: jsonb("contact").notNull().default({}),
  status: clientStatusEnum("status").notNull().default("onboarding"),
  onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("clients_firm_id_idx").on(t.firmId)]
);

// Which returns this client is liable for, at what frequency. Drives the compliance calendar (Phase 3+).
export const clientTaxTypes = pgTable(
  "client_tax_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    formCode: text("form_code").notNull(), // e.g. "2550Q", "2551Q", "1601-C"
    filingFrequency: filingFrequencyEnum("filing_frequency").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("client_tax_types_client_id_idx").on(t.clientId)]
);
