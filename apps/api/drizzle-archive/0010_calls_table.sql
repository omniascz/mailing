-- Create call_status enum
CREATE TYPE "call_status" AS ENUM ('completed', 'no_answer', 'busy', 'voicemail', 'failed');

-- Create calls table
CREATE TABLE "calls" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "campaign_id" uuid REFERENCES "campaigns"("id") ON DELETE SET NULL,
  "contact_id" uuid NOT NULL REFERENCES "contacts"("id") ON DELETE CASCADE,
  "scenario_id" uuid,
  "status" "call_status" NOT NULL,
  "duration_seconds" integer NOT NULL DEFAULT 0,
  "recording_url" varchar(1024),
  "transcript" text,
  "ai_summary" text,
  "outcome" jsonb,
  "cost" numeric(10, 4) NOT NULL DEFAULT '0.00',
  "twilio_call_sid" varchar(255),
  "twilio_recording_sid" varchar(255),
  "created_at" timestamp with time zone NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX "calls_org_id_idx" ON "calls"("org_id");
CREATE INDEX "calls_contact_id_idx" ON "calls"("contact_id");
CREATE INDEX "calls_campaign_id_idx" ON "calls"("campaign_id");
CREATE INDEX "calls_status_idx" ON "calls"("status");
CREATE INDEX "calls_created_at_idx" ON "calls"("created_at");
CREATE INDEX "calls_org_contact_idx" ON "calls"("org_id", "contact_id");
