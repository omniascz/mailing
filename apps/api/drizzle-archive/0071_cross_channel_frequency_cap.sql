-- Cross-channel frequency cap upgrade (§9 P1).
--
-- 1. Extend org_frequency_rules with optional quiet-hours + band scope.
--    Existing rows keep their previous behaviour (no quiet hours, all bands).
-- 2. New frequency_suppressions table records every time a send was
--    blocked by a rule so the org can audit + dashboard the impact.

ALTER TABLE "org_frequency_rules"
  ADD COLUMN IF NOT EXISTS "quiet_hours_start" smallint,    -- 0..23
  ADD COLUMN IF NOT EXISTS "quiet_hours_end" smallint,      -- 0..23 (end exclusive)
  ADD COLUMN IF NOT EXISTS "timezone" varchar(64),          -- IANA, e.g. Europe/Prague
  ADD COLUMN IF NOT EXISTS "engagement_band" varchar(20),   -- highly_engaged|engaged|at_risk|dormant|cold|null=all
  ADD COLUMN IF NOT EXISTS "priority_floor" varchar(16);    -- transactional bypasses caps; null=no bypass

CREATE TABLE IF NOT EXISTS "frequency_suppressions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "contact_id" uuid REFERENCES "contacts"("id") ON DELETE CASCADE,
  "channel" varchar(16) NOT NULL,
  "reason" varchar(32) NOT NULL,         -- 'cap_exceeded' | 'quiet_hours' | 'band_locked'
  "rule_id" uuid,
  "priority" varchar(16),
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "suppressed_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "frequency_suppressions_org_at_idx"
  ON "frequency_suppressions" ("org_id", "suppressed_at");
CREATE INDEX IF NOT EXISTS "frequency_suppressions_contact_idx"
  ON "frequency_suppressions" ("contact_id", "suppressed_at");
CREATE INDEX IF NOT EXISTS "frequency_suppressions_reason_idx"
  ON "frequency_suppressions" ("org_id", "reason");
