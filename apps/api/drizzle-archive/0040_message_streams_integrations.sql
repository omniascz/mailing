-- Migration 0040: Message streams (#222) + integration schemas (#226 HubSpot, #227 Calendly)

-- ─── #222 Message streams ──────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE message_stream AS ENUM ('broadcast', 'transactional', 'triggered');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE email_events
  ADD COLUMN IF NOT EXISTS stream message_stream NOT NULL DEFAULT 'broadcast';

CREATE INDEX IF NOT EXISTS email_events_stream_idx ON email_events (org_id, stream);

-- ─── #226 HubSpot connections ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS hubspot_connections (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  hub_id              VARCHAR(64),
  hub_domain          VARCHAR(255),
  access_token        TEXT NOT NULL,
  refresh_token       TEXT,
  token_expires_at    TIMESTAMPTZ,
  portal_id           VARCHAR(64),
  scopes              JSONB NOT NULL DEFAULT '[]',
  sync_contacts       BOOLEAN NOT NULL DEFAULT TRUE,
  sync_deals          BOOLEAN NOT NULL DEFAULT TRUE,
  last_synced_at      TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id)
);

CREATE INDEX IF NOT EXISTS hubspot_connections_org_id_idx ON hubspot_connections (org_id);

-- Mapping table: ForgeMsg contact ↔ HubSpot contact
CREATE TABLE IF NOT EXISTS hubspot_contact_map (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  contact_id          UUID NOT NULL REFERENCES contacts (id) ON DELETE CASCADE,
  hubspot_vid         BIGINT NOT NULL,
  synced_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, contact_id),
  UNIQUE (org_id, hubspot_vid)
);

CREATE INDEX IF NOT EXISTS hubspot_contact_map_org_idx ON hubspot_contact_map (org_id);

-- Mapping table: ForgeMsg deal ↔ HubSpot deal
CREATE TABLE IF NOT EXISTS hubspot_deal_map (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  deal_id             UUID NOT NULL REFERENCES deals (id) ON DELETE CASCADE,
  hubspot_deal_id     BIGINT NOT NULL,
  synced_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, deal_id),
  UNIQUE (org_id, hubspot_deal_id)
);

CREATE INDEX IF NOT EXISTS hubspot_deal_map_org_idx ON hubspot_deal_map (org_id);

-- ─── #227 Calendly connections ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS calendly_connections (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  user_uri            VARCHAR(512),
  organization_uri    VARCHAR(512),
  access_token        TEXT NOT NULL,
  refresh_token       TEXT,
  token_expires_at    TIMESTAMPTZ,
  webhook_signing_key TEXT,
  create_deal         BOOLEAN NOT NULL DEFAULT FALSE,
  workflow_trigger    VARCHAR(255),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id)
);

CREATE INDEX IF NOT EXISTS calendly_connections_org_id_idx ON calendly_connections (org_id);
