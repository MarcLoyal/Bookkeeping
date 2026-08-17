CREATE TYPE "public"."account_type" AS ENUM('asset', 'liability', 'equity', 'income', 'expense');--> statement-breakpoint
CREATE TYPE "public"."accounting_method" AS ENUM('accrual', 'cash');--> statement-breakpoint
CREATE TYPE "public"."books_type" AS ENUM('manual', 'loose_leaf', 'cas');--> statement-breakpoint
CREATE TYPE "public"."client_status" AS ENUM('onboarding', 'active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."contact_type" AS ENUM('customer', 'supplier', 'both', 'employee');--> statement-breakpoint
CREATE TYPE "public"."entry_status" AS ENUM('draft', 'posted', 'reversed');--> statement-breakpoint
CREATE TYPE "public"."filing_frequency" AS ENUM('monthly', 'quarterly', 'annual');--> statement-breakpoint
CREATE TYPE "public"."income_tax_regime" AS ENUM('graduated_itemized', 'graduated_osd', 'eight_percent', 'rcit', 'mcit_applicable');--> statement-breakpoint
CREATE TYPE "public"."invoice_type" AS ENUM('invoice', 'official_receipt');--> statement-breakpoint
CREATE TYPE "public"."journal_book" AS ENUM('GJ', 'CRB', 'CDB', 'SJ', 'PJ');--> statement-breakpoint
CREATE TYPE "public"."normal_balance" AS ENUM('debit', 'credit');--> statement-breakpoint
CREATE TYPE "public"."purchase_classification" AS ENUM('capital_goods', 'goods_other_than_capital', 'services', 'domestic_purchase_not_qualified', 'importation');--> statement-breakpoint
CREATE TYPE "public"."sales_status" AS ENUM('billed', 'collected', 'partially_collected', 'uncollected');--> statement-breakpoint
CREATE TYPE "public"."taxpayer_type" AS ENUM('individual', 'corporation', 'partnership', 'sole_prop', 'professional');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('firm_admin', 'bookkeeper', 'reviewer', 'client_user');--> statement-breakpoint
CREATE TYPE "public"."vat_status" AS ENUM('vat', 'non_vat', 'vat_exempt');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "firms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_client_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid,
	"client_id" uuid,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" "user_role" NOT NULL,
	"password_hash" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "client_tax_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"form_code" text NOT NULL,
	"filing_frequency" "filing_frequency" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"registered_name" text NOT NULL,
	"trade_name" text,
	"tin" text NOT NULL,
	"rdo_code" text NOT NULL,
	"taxpayer_type" "taxpayer_type" NOT NULL,
	"vat_status" "vat_status" NOT NULL,
	"income_tax_regime" "income_tax_regime" NOT NULL,
	"fiscal_year_end_month" smallint DEFAULT 12 NOT NULL,
	"accounting_method" "accounting_method" DEFAULT 'accrual' NOT NULL,
	"books_type" "books_type" DEFAULT 'loose_leaf' NOT NULL,
	"ptu_number" text,
	"ptu_date" date,
	"orus_registration_ref" text,
	"withholding_agent" boolean DEFAULT false NOT NULL,
	"top_withholding_agent" boolean DEFAULT false NOT NULL,
	"address" text NOT NULL,
	"contact" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "client_status" DEFAULT 'onboarding' NOT NULL,
	"onboarded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tax_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"value" numeric(20, 8) NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"notes" text DEFAULT '' NOT NULL,
	"last_verified_at" timestamp with time zone,
	"last_verified_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"table_name" text NOT NULL,
	"record_id" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" "account_type" NOT NULL,
	"normal_balance" "normal_balance" NOT NULL,
	"parent_id" uuid,
	"is_postable" boolean DEFAULT true NOT NULL,
	"fs_line_mapping" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"type" "contact_type" NOT NULL,
	"registered_name" text NOT NULL,
	"tin" text,
	"address" text,
	"vat_status" "vat_status",
	"default_account_id" uuid,
	"default_ewt_code" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "client_counters" (
	"client_id" uuid NOT NULL,
	"counter_name" text NOT NULL,
	"next_value" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "client_counters_client_id_counter_name_pk" PRIMARY KEY("client_id","counter_name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"entry_no" integer,
	"entry_date" date NOT NULL,
	"book" "journal_book" NOT NULL,
	"reference_no" text,
	"description" text NOT NULL,
	"source_document_id" uuid,
	"status" "entry_status" DEFAULT 'draft' NOT NULL,
	"posted_by" uuid,
	"posted_at" timestamp with time zone,
	"reversal_of_entry_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "journal_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"line_no" smallint NOT NULL,
	"account_id" uuid NOT NULL,
	"debit_centavos" bigint DEFAULT 0 NOT NULL,
	"credit_centavos" bigint DEFAULT 0 NOT NULL,
	"memo" text,
	"contact_id" uuid,
	"tax_code" text,
	CONSTRAINT "journal_lines_nonnegative_chk" CHECK ("journal_lines"."debit_centavos" >= 0 AND "journal_lines"."credit_centavos" >= 0),
	CONSTRAINT "journal_lines_one_sided_chk" CHECK (("journal_lines"."debit_centavos" = 0 OR "journal_lines"."credit_centavos" = 0)),
	CONSTRAINT "journal_lines_nonzero_chk" CHECK (("journal_lines"."debit_centavos" > 0 OR "journal_lines"."credit_centavos" > 0))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cash_disbursement_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cash_disbursement_id" uuid NOT NULL,
	"line_no" smallint NOT NULL,
	"allocation_account_id" uuid NOT NULL,
	"amount_centavos" bigint NOT NULL,
	"memo" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cash_disbursements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"disbursement_date" date NOT NULL,
	"contact_id" uuid,
	"particulars" text NOT NULL,
	"bank_cash_account_id" uuid NOT NULL,
	"reference_no" text,
	"total_centavos" bigint NOT NULL,
	"journal_entry_id" uuid
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cash_receipt_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cash_receipt_id" uuid NOT NULL,
	"line_no" smallint NOT NULL,
	"allocation_account_id" uuid NOT NULL,
	"amount_centavos" bigint NOT NULL,
	"memo" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cash_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"receipt_date" date NOT NULL,
	"contact_id" uuid,
	"particulars" text NOT NULL,
	"bank_cash_account_id" uuid NOT NULL,
	"reference_no" text,
	"total_centavos" bigint NOT NULL,
	"journal_entry_id" uuid
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"supplier_invoice_no" text NOT NULL,
	"invoice_date" date NOT NULL,
	"purchase_classification" "purchase_classification" NOT NULL,
	"vatable_purchase_centavos" bigint DEFAULT 0 NOT NULL,
	"input_vat_centavos" bigint DEFAULT 0 NOT NULL,
	"exempt_purchase_centavos" bigint DEFAULT 0 NOT NULL,
	"zero_rated_purchase_centavos" bigint DEFAULT 0 NOT NULL,
	"ewt_applicable" text DEFAULT 'no' NOT NULL,
	"ewt_code" text,
	"ewt_amount_centavos" bigint DEFAULT 0 NOT NULL,
	"total_centavos" bigint NOT NULL,
	"journal_entry_id" uuid
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sales_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"invoice_no" text NOT NULL,
	"invoice_date" date NOT NULL,
	"invoice_type" "invoice_type" DEFAULT 'invoice' NOT NULL,
	"vatable_sales_centavos" bigint DEFAULT 0 NOT NULL,
	"zero_rated_sales_centavos" bigint DEFAULT 0 NOT NULL,
	"exempt_sales_centavos" bigint DEFAULT 0 NOT NULL,
	"output_vat_centavos" bigint DEFAULT 0 NOT NULL,
	"ewt_withheld_by_customer_centavos" bigint DEFAULT 0 NOT NULL,
	"total_centavos" bigint NOT NULL,
	"status" "sales_status" DEFAULT 'billed' NOT NULL,
	"collection_date" date,
	"journal_entry_id" uuid
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "period_locks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"locked_by" uuid NOT NULL,
	"locked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unlocked_by" uuid,
	"unlocked_at" timestamp with time zone,
	"unlock_reason" text
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_client_assignments" ADD CONSTRAINT "user_client_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_client_assignments" ADD CONSTRAINT "user_client_assignments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "client_tax_types" ADD CONSTRAINT "client_tax_types_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "clients" ADD CONSTRAINT "clients_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "accounts" ADD CONSTRAINT "accounts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "accounts" ADD CONSTRAINT "accounts_parent_id_accounts_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contacts" ADD CONSTRAINT "contacts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contacts" ADD CONSTRAINT "contacts_default_account_id_accounts_id_fk" FOREIGN KEY ("default_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "client_counters" ADD CONSTRAINT "client_counters_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_posted_by_users_id_fk" FOREIGN KEY ("posted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_reversal_of_entry_id_journal_entries_id_fk" FOREIGN KEY ("reversal_of_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_entry_id_journal_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cash_disbursement_lines" ADD CONSTRAINT "cash_disbursement_lines_cash_disbursement_id_cash_disbursements_id_fk" FOREIGN KEY ("cash_disbursement_id") REFERENCES "public"."cash_disbursements"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cash_disbursement_lines" ADD CONSTRAINT "cash_disbursement_lines_allocation_account_id_accounts_id_fk" FOREIGN KEY ("allocation_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cash_disbursements" ADD CONSTRAINT "cash_disbursements_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cash_disbursements" ADD CONSTRAINT "cash_disbursements_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cash_disbursements" ADD CONSTRAINT "cash_disbursements_bank_cash_account_id_accounts_id_fk" FOREIGN KEY ("bank_cash_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cash_disbursements" ADD CONSTRAINT "cash_disbursements_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cash_receipt_lines" ADD CONSTRAINT "cash_receipt_lines_cash_receipt_id_cash_receipts_id_fk" FOREIGN KEY ("cash_receipt_id") REFERENCES "public"."cash_receipts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cash_receipt_lines" ADD CONSTRAINT "cash_receipt_lines_allocation_account_id_accounts_id_fk" FOREIGN KEY ("allocation_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cash_receipts" ADD CONSTRAINT "cash_receipts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cash_receipts" ADD CONSTRAINT "cash_receipts_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cash_receipts" ADD CONSTRAINT "cash_receipts_bank_cash_account_id_accounts_id_fk" FOREIGN KEY ("bank_cash_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cash_receipts" ADD CONSTRAINT "cash_receipts_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchases" ADD CONSTRAINT "purchases_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchases" ADD CONSTRAINT "purchases_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchases" ADD CONSTRAINT "purchases_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "period_locks" ADD CONSTRAINT "period_locks_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "period_locks" ADD CONSTRAINT "period_locks_locked_by_users_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "period_locks" ADD CONSTRAINT "period_locks_unlocked_by_users_id_fk" FOREIGN KEY ("unlocked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_client_assignments_user_client_idx" ON "user_client_assignments" USING btree ("user_id","client_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_client_assignments_client_id_idx" ON "user_client_assignments" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_firm_id_idx" ON "users" USING btree ("firm_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_client_id_idx" ON "users" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "client_tax_types_client_id_idx" ON "client_tax_types" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "clients_firm_id_idx" ON "clients" USING btree ("firm_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_table_record_idx" ON "audit_log" USING btree ("table_name","record_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_actor_idx" ON "audit_log" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "accounts_client_id_idx" ON "accounts" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "accounts_client_code_idx" ON "accounts" USING btree ("client_id","code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_client_id_idx" ON "contacts" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "journal_entries_client_id_idx" ON "journal_entries" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "journal_entries_client_date_idx" ON "journal_entries" USING btree ("client_id","entry_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "journal_entries_status_idx" ON "journal_entries" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "journal_entries_book_idx" ON "journal_entries" USING btree ("client_id","book");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "journal_entries_client_entry_no_idx" ON "journal_entries" USING btree ("client_id","entry_no");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "journal_lines_entry_id_idx" ON "journal_lines" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "journal_lines_account_id_idx" ON "journal_lines" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cash_disbursement_lines_disbursement_id_idx" ON "cash_disbursement_lines" USING btree ("cash_disbursement_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cash_disbursements_client_id_idx" ON "cash_disbursements" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cash_disbursements_client_date_idx" ON "cash_disbursements" USING btree ("client_id","disbursement_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cash_receipt_lines_receipt_id_idx" ON "cash_receipt_lines" USING btree ("cash_receipt_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cash_receipts_client_id_idx" ON "cash_receipts" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cash_receipts_client_date_idx" ON "cash_receipts" USING btree ("client_id","receipt_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchases_client_id_idx" ON "purchases" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchases_client_date_idx" ON "purchases" USING btree ("client_id","invoice_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_invoices_client_id_idx" ON "sales_invoices" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_invoices_client_date_idx" ON "sales_invoices" USING btree ("client_id","invoice_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_invoices_contact_id_idx" ON "sales_invoices" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "period_locks_client_id_idx" ON "period_locks" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "period_locks_client_range_idx" ON "period_locks" USING btree ("client_id","period_start","period_end");
