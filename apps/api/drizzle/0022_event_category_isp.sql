-- Category + ISP dimensions for SendGrid-parity Category Stats & ISP (mailbox
-- provider) deliverability stats.
ALTER TABLE "email_events" ADD COLUMN IF NOT EXISTS "category" varchar(128);
ALTER TABLE "email_events" ADD COLUMN IF NOT EXISTS "isp" varchar(32);
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "category" varchar(128);

CREATE INDEX IF NOT EXISTS "email_events_org_category_idx" ON "email_events" ("org_id", "category");
CREATE INDEX IF NOT EXISTS "email_events_org_isp_idx" ON "email_events" ("org_id", "isp");
