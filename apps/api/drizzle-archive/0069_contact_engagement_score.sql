-- Engagement Score proprietary (§9 P1).
--
-- Cross-channel composite 0-100 score per contact, distinct from:
--   • RFM (commerce-only)
--   • Channel Score (per-channel)
--   • Predictive scores (CLV/churn — predictive, not reactive)
--
-- Combines email + SMS + voice + push + web + commerce signals into one
-- number plus a coarse band ('highly_engaged' | 'engaged' | 'at_risk' |
-- 'dormant' | 'cold'). Used by segment builder + auto-suppression rules.

ALTER TABLE "contact_engagement"
  ADD COLUMN IF NOT EXISTS "engagement_score" integer,
  ADD COLUMN IF NOT EXISTS "engagement_band" varchar(20),
  ADD COLUMN IF NOT EXISTS "engagement_scored_at" timestamptz;

CREATE INDEX IF NOT EXISTS "contact_engagement_band_idx"
  ON "contact_engagement" ("org_id", "engagement_band");
CREATE INDEX IF NOT EXISTS "contact_engagement_score_idx"
  ON "contact_engagement" ("org_id", "engagement_score");
