-- Multivariate testing (#39): 3+ variants per campaign, deterministic assignment,
-- automated winner selection on a configurable window/metric.

DO $$ BEGIN
  CREATE TYPE mv_test_status AS ENUM (
    'draft', 'running', 'selecting_winner', 'winner_selected', 'completed', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE mv_winner_metric AS ENUM (
    'open_rate', 'click_rate', 'click_to_open_rate', 'conversion_rate', 'revenue_per_email'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE mv_variant_element AS ENUM (
    'subject', 'preheader', 'from_name', 'content', 'send_time'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS multivariate_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status mv_test_status NOT NULL DEFAULT 'draft',
  winner_metric mv_winner_metric NOT NULL DEFAULT 'open_rate',
  test_audience_percent INTEGER NOT NULL DEFAULT 30,
  test_window_hours INTEGER NOT NULL DEFAULT 4,
  winner_select_at TIMESTAMPTZ,
  winner_variant_id UUID,
  auto_send_winner BOOLEAN NOT NULL DEFAULT TRUE,
  confidence_threshold NUMERIC(5,2) NOT NULL DEFAULT 95,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS mv_tests_org_idx ON multivariate_tests(org_id);
CREATE INDEX IF NOT EXISTS mv_tests_campaign_idx ON multivariate_tests(campaign_id);
CREATE INDEX IF NOT EXISTS mv_tests_status_idx ON multivariate_tests(status);

CREATE TABLE IF NOT EXISTS mv_test_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID NOT NULL REFERENCES multivariate_tests(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  is_control BOOLEAN NOT NULL DEFAULT FALSE,
  element mv_variant_element NOT NULL DEFAULT 'subject',
  value JSONB NOT NULL,
  allocation_percent NUMERIC(5,2) NOT NULL DEFAULT 50,
  total_sent INTEGER NOT NULL DEFAULT 0,
  total_delivered INTEGER NOT NULL DEFAULT 0,
  total_opens INTEGER NOT NULL DEFAULT 0,
  unique_opens INTEGER NOT NULL DEFAULT 0,
  total_clicks INTEGER NOT NULL DEFAULT 0,
  unique_clicks INTEGER NOT NULL DEFAULT 0,
  total_conversions INTEGER NOT NULL DEFAULT 0,
  total_revenue NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS mv_variants_test_idx ON mv_test_variants(test_id);
CREATE INDEX IF NOT EXISTS mv_variants_org_idx ON mv_test_variants(org_id);

CREATE TABLE IF NOT EXISTS mv_variant_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID NOT NULL REFERENCES multivariate_tests(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES mv_test_variants(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS mv_assignments_test_contact_idx
  ON mv_variant_assignments(test_id, contact_id);
CREATE INDEX IF NOT EXISTS mv_assignments_variant_idx
  ON mv_variant_assignments(variant_id);
