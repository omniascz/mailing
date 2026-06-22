-- Migration 0039 — CDP event ingestion, computed traits, activation (reverse-ETL)
-- Tasks: #267 (event ingestion), #268 (trait computation), #266 (data activation)

-- ─── #267 CDP event store ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cdp_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_id varchar(128),
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  anonymous_id varchar(128),
  event_type varchar(64) NOT NULL,
  name varchar(255) NOT NULL,
  source varchar(64),
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS cdp_events_org_event_id_uq
  ON cdp_events(org_id, event_id)
  WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS cdp_events_org_name_idx ON cdp_events(org_id, name);
CREATE INDEX IF NOT EXISTS cdp_events_contact_idx ON cdp_events(contact_id);
CREATE INDEX IF NOT EXISTS cdp_events_anon_idx ON cdp_events(anonymous_id);
CREATE INDEX IF NOT EXISTS cdp_events_occurred_idx ON cdp_events(occurred_at);

-- ─── #268 Computed traits ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS contact_traits (
  contact_id uuid PRIMARY KEY REFERENCES contacts(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  values jsonb NOT NULL DEFAULT '{}'::jsonb,
  version varchar(32) NOT NULL DEFAULT '0',
  computed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contact_traits_org_idx ON contact_traits(org_id);
CREATE INDEX IF NOT EXISTS contact_traits_computed_idx ON contact_traits(computed_at);

-- ─── #266 Activation destinations (reverse-ETL) ──────────────────────────────

CREATE TABLE IF NOT EXISTS activation_destinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name varchar(255) NOT NULL,
  kind varchar(32) NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  status varchar(16) NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activation_destinations_org_idx
  ON activation_destinations(org_id);

CREATE TABLE IF NOT EXISTS activation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  destination_id uuid NOT NULL REFERENCES activation_destinations(id) ON DELETE CASCADE,
  segment_id uuid,
  mode varchar(16) NOT NULL DEFAULT 'upsert',
  status varchar(16) NOT NULL DEFAULT 'pending',
  rows_processed varchar(32) NOT NULL DEFAULT '0',
  rows_succeeded varchar(32) NOT NULL DEFAULT '0',
  rows_failed varchar(32) NOT NULL DEFAULT '0',
  error varchar(2000),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS activation_runs_org_idx ON activation_runs(org_id);
CREATE INDEX IF NOT EXISTS activation_runs_dest_idx ON activation_runs(destination_id);
