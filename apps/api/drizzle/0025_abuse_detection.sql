-- Abuse detection (#56).
-- Rules → signal evaluation → abuse_events → sanctions.
-- Plus spam trap registry and hit log.

DO $$ BEGIN
  CREATE TYPE abuse_signal_type AS ENUM (
    'high_bounce_rate', 'high_complaint_rate', 'spam_trap_hit', 'honeypot_hit',
    'volume_spike', 'list_quality_low', 'new_account_high_volume', 'blacklist_hit',
    'content_spam_score', 'suspicious_login', 'api_abuse', 'credential_stuffing',
    'stale_list_send'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE abuse_severity AS ENUM ('info', 'low', 'medium', 'high', 'critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE abuse_action AS ENUM (
    'none', 'alert', 'throttle', 'pause_campaigns', 'suspend_sending',
    'suspend_account', 'require_review'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE abuse_event_status AS ENUM (
    'open', 'acknowledged', 'investigating', 'resolved', 'false_positive'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS abuse_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  signal_type abuse_signal_type NOT NULL,
  threshold NUMERIC(12,4) NOT NULL,
  window_minutes INTEGER NOT NULL DEFAULT 60,
  min_sample_size INTEGER NOT NULL DEFAULT 100,
  severity abuse_severity NOT NULL DEFAULT 'medium',
  action abuse_action NOT NULL DEFAULT 'alert',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS abuse_rules_org_idx ON abuse_rules(org_id);
CREATE INDEX IF NOT EXISTS abuse_rules_signal_idx ON abuse_rules(signal_type);
CREATE INDEX IF NOT EXISTS abuse_rules_enabled_idx ON abuse_rules(enabled);

CREATE TABLE IF NOT EXISTS abuse_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES abuse_rules(id) ON DELETE SET NULL,
  signal_type abuse_signal_type NOT NULL,
  severity abuse_severity NOT NULL,
  observed_value NUMERIC(12,4) NOT NULL,
  threshold NUMERIC(12,4) NOT NULL,
  sample_size INTEGER NOT NULL DEFAULT 0,
  summary VARCHAR(500) NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  ip_address VARCHAR(45),
  status abuse_event_status NOT NULL DEFAULT 'open',
  action_taken abuse_action NOT NULL DEFAULT 'none',
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS abuse_events_org_idx ON abuse_events(org_id);
CREATE INDEX IF NOT EXISTS abuse_events_status_idx ON abuse_events(status);
CREATE INDEX IF NOT EXISTS abuse_events_severity_idx ON abuse_events(severity);
CREATE INDEX IF NOT EXISTS abuse_events_signal_idx ON abuse_events(signal_type);
CREATE INDEX IF NOT EXISTS abuse_events_created_idx ON abuse_events(created_at);

CREATE TABLE IF NOT EXISTS abuse_sanctions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_id UUID REFERENCES abuse_events(id) ON DELETE SET NULL,
  action abuse_action NOT NULL,
  reason VARCHAR(500) NOT NULL,
  throttle_rate_per_hour INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID,
  lifted_by UUID,
  lifted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS abuse_sanctions_org_idx ON abuse_sanctions(org_id);
CREATE INDEX IF NOT EXISTS abuse_sanctions_active_idx ON abuse_sanctions(org_id, active);
CREATE INDEX IF NOT EXISTS abuse_sanctions_expires_idx ON abuse_sanctions(expires_at);

CREATE TABLE IF NOT EXISTS spam_traps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_hash VARCHAR(64) NOT NULL,
  trap_type VARCHAR(20) NOT NULL,
  source VARCHAR(50) NOT NULL DEFAULT 'internal',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS spam_traps_hash_idx ON spam_traps(email_hash);
CREATE INDEX IF NOT EXISTS spam_traps_active_idx ON spam_traps(active);

CREATE TABLE IF NOT EXISTS spam_trap_hits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  trap_id UUID NOT NULL REFERENCES spam_traps(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  email_hash VARCHAR(64) NOT NULL,
  hit_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS spam_trap_hits_org_idx ON spam_trap_hits(org_id);
CREATE INDEX IF NOT EXISTS spam_trap_hits_campaign_idx ON spam_trap_hits(campaign_id);
CREATE INDEX IF NOT EXISTS spam_trap_hits_time_idx ON spam_trap_hits(hit_at);
