-- Sprint D.4 — Per-channel consent audit table.
-- Authoritative answer to "may we contact this person on channel X?".
-- Composite PK (contact_id, channel) so the hot-path read is O(1).
-- Existing channel-specific tables (contact_emails.consent, sms_consents,
-- whatsapp opt-in) stay; this is the unified GDPR audit ledger.

CREATE TABLE IF NOT EXISTS "contact_channel_consents" (
  "org_id"          uuid          NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "contact_id"      uuid          NOT NULL REFERENCES "contacts"("id") ON DELETE CASCADE,
  "channel"         varchar(32)   NOT NULL,
  "opted_in"        boolean       NOT NULL DEFAULT false,
  "source"          varchar(64)   NOT NULL,
  "consent_text"    text,
  "ip_address"      varchar(45),
  "user_agent"      varchar(1024),
  "consented_at"    timestamp with time zone NOT NULL DEFAULT now(),
  "revoked_at"      timestamp with time zone,
  "revoke_reason"   varchar(255),
  "imported_from"   varchar(64),
  "updated_at"      timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("contact_id", "channel")
);

CREATE INDEX IF NOT EXISTS "contact_channel_consents_org_idx"
  ON "contact_channel_consents" ("org_id");
CREATE INDEX IF NOT EXISTS "contact_channel_consents_channel_idx"
  ON "contact_channel_consents" ("channel");
CREATE INDEX IF NOT EXISTS "contact_channel_consents_opted_in_idx"
  ON "contact_channel_consents" ("opted_in");
