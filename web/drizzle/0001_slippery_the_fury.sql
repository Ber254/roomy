ALTER TABLE "payments" ADD COLUMN "origin_symbol" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "refund_to" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "quote" jsonb;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "deadline" timestamp;