ALTER TABLE "ab_test_results" ADD COLUMN "decision" varchar(32) DEFAULT 'auto_send' NOT NULL;--> statement-breakpoint
ALTER TABLE "ab_test_results" ADD COLUMN "decision_reason" varchar(500);