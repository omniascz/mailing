-- Identity Resolution L3 (§9 P1).
--
-- Adds non-PII fingerprint columns to anonymous_profiles so we can match
-- visitors across devices without storing raw PII. ip_prefix is the
-- first 24 bits of IPv4 (or first 48 of IPv6) — coarse enough to dedupe
-- a household / office without uniquely identifying a person.
-- user_agent_hash + accept_language_hash are SHA-256 over the raw
-- header, never the raw value. screen_sig is "{w}x{h}@{dpr}".

ALTER TABLE "anonymous_profiles"
  ADD COLUMN IF NOT EXISTS "ip_prefix" varchar(16),
  ADD COLUMN IF NOT EXISTS "user_agent_hash" varchar(64),
  ADD COLUMN IF NOT EXISTS "accept_language_hash" varchar(64),
  ADD COLUMN IF NOT EXISTS "locale" varchar(16),
  ADD COLUMN IF NOT EXISTS "screen_sig" varchar(32);

CREATE INDEX IF NOT EXISTS "anon_profiles_ip_ua_idx"
  ON "anonymous_profiles" ("org_id", "ip_prefix", "user_agent_hash");
CREATE INDEX IF NOT EXISTS "anon_profiles_last_seen_idx"
  ON "anonymous_profiles" ("org_id", "last_seen_at");
