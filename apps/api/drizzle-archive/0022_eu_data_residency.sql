-- data_region enum
DO $$ BEGIN
  CREATE TYPE data_region AS ENUM ('us', 'eu', 'ap');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Add data_region + ip_restrictions_enabled to organizations
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS data_region data_region NOT NULL DEFAULT 'us',
  ADD COLUMN IF NOT EXISTS ip_restrictions_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- IP restrictions table
CREATE TABLE IF NOT EXISTS ip_restrictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  cidr VARCHAR(50) NOT NULL,
  label VARCHAR(100),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ip_restrictions_org_idx ON ip_restrictions(org_id);
CREATE INDEX IF NOT EXISTS ip_restrictions_org_enabled_idx ON ip_restrictions(org_id, enabled);
