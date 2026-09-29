CREATE TYPE "public"."access_scope" AS ENUM('all', 'assigned');--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'encoder';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'viewer';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "access_scope" "access_scope" DEFAULT 'all' NOT NULL;