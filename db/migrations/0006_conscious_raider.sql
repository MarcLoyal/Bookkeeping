CREATE TYPE "public"."signup_method" AS ENUM('email', 'google');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "signup_method" "signup_method";