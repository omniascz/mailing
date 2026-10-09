DROP INDEX "suppressions_org_email_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "suppressions_org_email_reason_idx" ON "suppressions" USING btree ("org_id","email","reason");