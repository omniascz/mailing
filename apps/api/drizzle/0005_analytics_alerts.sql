-- Migration 0005: campaign_alerts table for anomaly detection (task 4.4)

DO $$ BEGIN
  CREATE TYPE "alert_severity" AS ENUM ('info', 'warning', 'critical');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "alert_type" AS ENUM (
    'bounce_rate_spike',
    'complaint_rate_spike',
    'open_rate_drop',
    'unsub_spike'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "campaign_alerts" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"           uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "campaign_id"      uuid REFERENCES "campaigns"("id") ON DELETE SET NULL,
  "alert_type"       "alert_type" NOT NULL,
  "severity"         "alert_severity" NOT NULL DEFAULT 'warning',
  "message"          varchar(1024) NOT NULL,
  "details"          jsonb NOT NULL DEFAULT '{}',
  "acknowledged"     boolean NOT NULL DEFAULT false,
  "acknowledged_at"  timestamptz,
  "created_at"       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "campaign_alerts_org_id_idx"       ON "campaign_alerts" ("org_id");
CREATE INDEX IF NOT EXISTS "campaign_alerts_campaign_id_idx"  ON "campaign_alerts" ("campaign_id");
CREATE INDEX IF NOT EXISTS "campaign_alerts_created_at_idx"   ON "campaign_alerts" ("created_at");
CREATE INDEX IF NOT EXISTS "campaign_alerts_acknowledged_idx" ON "campaign_alerts" ("acknowledged");
