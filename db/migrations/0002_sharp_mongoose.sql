CREATE TYPE "public"."pay_frequency" AS ENUM('monthly', 'semi_monthly');--> statement-breakpoint
CREATE TYPE "public"."payroll_run_type" AS ENUM('regular', 'thirteenth_month');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"employee_no" text,
	"sss_no" text,
	"philhealth_no" text,
	"pagibig_no" text,
	"position" text,
	"pay_frequency" "pay_frequency" NOT NULL,
	"basic_pay_centavos" bigint NOT NULL,
	"is_minimum_wage_earner" text DEFAULT 'no' NOT NULL,
	"date_hired" date NOT NULL,
	"date_separated" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employees_contact_id_unique" UNIQUE("contact_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payroll_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"run_type" "payroll_run_type" DEFAULT 'regular' NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"pay_date" date NOT NULL,
	"journal_entry_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payslips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payroll_run_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"basic_pay_centavos" bigint DEFAULT 0 NOT NULL,
	"overtime_pay_centavos" bigint DEFAULT 0 NOT NULL,
	"other_taxable_earnings_centavos" bigint DEFAULT 0 NOT NULL,
	"de_minimis_centavos" bigint DEFAULT 0 NOT NULL,
	"thirteenth_month_pay_centavos" bigint DEFAULT 0 NOT NULL,
	"gross_taxable_income_centavos" bigint DEFAULT 0 NOT NULL,
	"sss_employee_centavos" bigint DEFAULT 0 NOT NULL,
	"sss_employer_centavos" bigint DEFAULT 0 NOT NULL,
	"philhealth_employee_centavos" bigint DEFAULT 0 NOT NULL,
	"philhealth_employer_centavos" bigint DEFAULT 0 NOT NULL,
	"pagibig_employee_centavos" bigint DEFAULT 0 NOT NULL,
	"pagibig_employer_centavos" bigint DEFAULT 0 NOT NULL,
	"withholding_tax_centavos" bigint DEFAULT 0 NOT NULL,
	"net_pay_centavos" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sss_contribution_brackets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"min_salary_centavos" bigint NOT NULL,
	"max_salary_centavos" bigint,
	"employee_share_centavos" bigint NOT NULL,
	"employer_share_centavos" bigint NOT NULL,
	"ec_employer_share_centavos" bigint DEFAULT 0 NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"notes" text DEFAULT '' NOT NULL,
	"last_verified_at" timestamp with time zone,
	"last_verified_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "withholding_tax_brackets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"min_annual_compensation_centavos" bigint NOT NULL,
	"max_annual_compensation_centavos" bigint,
	"base_tax_centavos" bigint NOT NULL,
	"excess_rate" numeric(20, 8) NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"notes" text DEFAULT '' NOT NULL,
	"last_verified_at" timestamp with time zone,
	"last_verified_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "employees" ADD CONSTRAINT "employees_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "employees" ADD CONSTRAINT "employees_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payslips" ADD CONSTRAINT "payslips_payroll_run_id_payroll_runs_id_fk" FOREIGN KEY ("payroll_run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payslips" ADD CONSTRAINT "payslips_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "employees_client_id_idx" ON "employees" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payroll_runs_client_id_idx" ON "payroll_runs" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payslips_payroll_run_id_idx" ON "payslips" USING btree ("payroll_run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payslips_employee_id_idx" ON "payslips" USING btree ("employee_id");