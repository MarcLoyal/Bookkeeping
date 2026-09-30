CREATE TYPE "public"."firm_plan" AS ENUM('trial', 'free', 'basic', 'premium', 'enterprise');--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN "plan" "firm_plan" DEFAULT 'trial' NOT NULL;--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN "max_clients" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN "max_users" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN "per_client_assignment_allowed" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN "trial_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN "trial_expired_flagged_at" timestamp with time zone;