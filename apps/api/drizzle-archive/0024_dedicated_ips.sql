-- Dedicated IPs + IP pools (#51).
-- Pools group IPs by traffic class; dedicated_ips is allocated per-org.

DO $$ BEGIN
  CREATE TYPE dedicated_ip_status AS ENUM (
    'pending', 'provisioning', 'active', 'warming', 'warm', 'suspended', 'retired'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ip_pool_type AS ENUM (
    'marketing', 'transactional', 'cold_outreach', 'warming', 'shared', 'dedicated'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS ip_pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  type ip_pool_type NOT NULL DEFAULT 'marketing',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  allowed_campaign_types VARCHAR(255) NOT NULL DEFAULT 'email',
  per_ip_daily_limit INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ip_pools_org_idx ON ip_pools(org_id);
CREATE UNIQUE INDEX IF NOT EXISTS ip_pools_org_name_idx ON ip_pools(org_id, name);

CREATE TABLE IF NOT EXISTS dedicated_ips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address VARCHAR(45) NOT NULL,
  ptr_record VARCHAR(253),
  org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  pool_id UUID REFERENCES ip_pools(id) ON DELETE SET NULL,
  status dedicated_ip_status NOT NULL DEFAULT 'pending',
  warmup_day INTEGER NOT NULL DEFAULT 0,
  warmup_sent INTEGER NOT NULL DEFAULT 0,
  warmup_started_at TIMESTAMPTZ,
  warmup_completed_at TIMESTAMPTZ,
  today_sent INTEGER NOT NULL DEFAULT 0,
  total_sent INTEGER NOT NULL DEFAULT 0,
  reputation_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  reputation_updated_at TIMESTAMPTZ,
  blacklist_count INTEGER NOT NULL DEFAULT 0,
  bounce_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  complaint_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  region VARCHAR(20) NOT NULL DEFAULT 'us-east',
  notes TEXT,
  allocated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS dedicated_ips_address_idx ON dedicated_ips(ip_address);
CREATE INDEX IF NOT EXISTS dedicated_ips_org_idx ON dedicated_ips(org_id);
CREATE INDEX IF NOT EXISTS dedicated_ips_pool_idx ON dedicated_ips(pool_id);
CREATE INDEX IF NOT EXISTS dedicated_ips_status_idx ON dedicated_ips(status);

CREATE TABLE IF NOT EXISTS ip_warmup_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id UUID NOT NULL REFERENCES ip_pools(id) ON DELETE CASCADE,
  day INTEGER NOT NULL,
  max_volume INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS ip_warmup_schedules_pool_day_idx
  ON ip_warmup_schedules(pool_id, day);
