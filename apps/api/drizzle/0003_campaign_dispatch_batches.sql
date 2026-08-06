-- Ledger of batch-sender jobs a dispatch has already enqueued.
-- Makes campaign-splitter and ab-winner idempotent: a BullMQ retry that runs
-- after addBulk already succeeded finds the batches recorded and skips them,
-- instead of enqueuing a second full set and sending the campaign twice.

CREATE TABLE IF NOT EXISTS "campaign_dispatch_batches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "campaign_id" uuid NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "dispatch_id" varchar(128) NOT NULL,
  "batch_key" varchar(128) NOT NULL,
  "enqueued_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "campaign_dispatch_batches_uidx"
  ON "campaign_dispatch_batches" ("dispatch_id", "batch_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaign_dispatch_batches_campaign_idx"
  ON "campaign_dispatch_batches" ("campaign_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaign_dispatch_batches_org_idx"
  ON "campaign_dispatch_batches" ("org_id");
