-- Channel Scoring per recipient (§9 P1).
--
-- Adds per-channel engagement scores 0–100 to contact_engagement, computed
-- nightly by services/channel-scoring/index.ts and consumed by the
-- smart_channel workflow node when picking the best channel for a contact.
--
-- preferred_channel is the cached argmax across the five score columns
-- (null when no channel has any signal at all).

ALTER TABLE "contact_engagement"
  ADD COLUMN IF NOT EXISTS "email_score" integer,
  ADD COLUMN IF NOT EXISTS "sms_score" integer,
  ADD COLUMN IF NOT EXISTS "whatsapp_score" integer,
  ADD COLUMN IF NOT EXISTS "voice_score" integer,
  ADD COLUMN IF NOT EXISTS "push_score" integer,
  ADD COLUMN IF NOT EXISTS "preferred_channel" varchar(16),
  ADD COLUMN IF NOT EXISTS "channel_scored_at" timestamptz;

CREATE INDEX IF NOT EXISTS "contact_engagement_preferred_channel_idx"
  ON "contact_engagement" ("org_id", "preferred_channel");
