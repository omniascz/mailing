-- Sandbox / test mode for API keys (Resend parity).
--
-- A `test` key validates + persists email events normally but never
-- hands off to the MTA. Useful for CI pipelines and for verifying the
-- Resend SDK integration without burning real send volume.
--
-- Default is `live` so existing rows keep their production behaviour.

ALTER TABLE "api_keys"
  ADD COLUMN IF NOT EXISTS "mode" varchar(8) NOT NULL DEFAULT 'live';

-- Enforce just the two values; cheaper than a Postgres enum we'd have to
-- migrate later if we add a third mode.
ALTER TABLE "api_keys"
  ADD CONSTRAINT "api_keys_mode_check"
  CHECK ("mode" IN ('live', 'test'));
