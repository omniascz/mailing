-- Migration 0038 — Universal inbox, VoIP routing, calendar sync, identity graph
-- Tasks: #244 (universal inbox), #249 (SIP/WebRTC), #251 (call routing),
--        #258 (calendar sync), #262 (migration), #264 (identity graph)

-- ─── #244 Universal inbox — extend helpdesk ──────────────────────────────────

ALTER TABLE helpdesk_tickets
  ADD COLUMN IF NOT EXISTS external_thread_id varchar(255),
  ADD COLUMN IF NOT EXISTS external_identity varchar(255),
  ADD COLUMN IF NOT EXISTS channel_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS helpdesk_tickets_org_channel_thread_uq
  ON helpdesk_tickets(org_id, channel, external_thread_id)
  WHERE external_thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS helpdesk_tickets_org_channel_identity_idx
  ON helpdesk_tickets(org_id, channel, external_identity);

ALTER TABLE ticket_messages
  ADD COLUMN IF NOT EXISTS direction varchar(16) NOT NULL DEFAULT 'inbound',
  ADD COLUMN IF NOT EXISTS external_message_id varchar(255);

CREATE UNIQUE INDEX IF NOT EXISTS ticket_messages_ext_uq
  ON ticket_messages(ticket_id, external_message_id)
  WHERE external_message_id IS NOT NULL;

-- ─── #251 Call routing ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS hunt_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name varchar(255) NOT NULL,
  strategy varchar(32) NOT NULL DEFAULT 'ring-all',
  member_user_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  ring_timeout_seconds integer NOT NULL DEFAULT 30,
  overflow_target varchar(32) NOT NULL DEFAULT 'voicemail',
  overflow_target_id uuid,
  rr_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hunt_groups_org_idx ON hunt_groups(org_id);

CREATE TABLE IF NOT EXISTS ivr_menus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name varchar(255) NOT NULL,
  greeting varchar(2000) NOT NULL,
  did_number varchar(64),
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  timeout_seconds integer NOT NULL DEFAULT 10,
  invalid_target varchar(32) NOT NULL DEFAULT 'repeat',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ivr_menus_org_idx ON ivr_menus(org_id);
CREATE UNIQUE INDEX IF NOT EXISTS ivr_menus_org_did_uq ON ivr_menus(org_id, did_number);

CREATE TABLE IF NOT EXISTS business_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  timezone varchar(64) NOT NULL DEFAULT 'UTC',
  schedule jsonb NOT NULL DEFAULT '[]'::jsonb,
  holidays jsonb NOT NULL DEFAULT '[]'::jsonb,
  after_hours_target varchar(32) NOT NULL DEFAULT 'voicemail',
  after_hours_target_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS business_hours_org_uq ON business_hours(org_id);

CREATE TABLE IF NOT EXISTS agent_presence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status varchar(32) NOT NULL DEFAULT 'offline',
  last_active_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS agent_presence_user_uq ON agent_presence(org_id, user_id);

-- ─── #258 Calendar sync ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS calendar_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider varchar(32) NOT NULL,
  external_account_id varchar(255) NOT NULL,
  external_account_email varchar(255),
  access_token text NOT NULL,
  refresh_token text,
  token_expires_at timestamptz,
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  primary_calendar_id varchar(255),
  sync_token text,
  last_synced_at timestamptz,
  caldav_url varchar(512),
  caldav_username varchar(255),
  status varchar(32) NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS cal_int_user_provider_acct_uq
  ON calendar_integrations(user_id, provider, external_account_id);
CREATE INDEX IF NOT EXISTS cal_int_org_idx ON calendar_integrations(org_id);

CREATE TABLE IF NOT EXISTS calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL REFERENCES calendar_integrations(id) ON DELETE CASCADE,
  external_event_id varchar(255) NOT NULL,
  calendar_id varchar(255),
  title varchar(1024),
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  all_day boolean NOT NULL DEFAULT false,
  status varchar(32) NOT NULL DEFAULT 'confirmed',
  busy boolean NOT NULL DEFAULT true,
  attendees jsonb NOT NULL DEFAULT '[]'::jsonb,
  internal_booking_id uuid,
  raw_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS cal_events_integration_ext_uq
  ON calendar_events(integration_id, external_event_id);
CREATE INDEX IF NOT EXISTS cal_events_integration_start_idx
  ON calendar_events(integration_id, start_at);
CREATE INDEX IF NOT EXISTS cal_events_org_start_idx
  ON calendar_events(org_id, start_at);

CREATE TABLE IF NOT EXISTS bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  host_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitee_email varchar(255) NOT NULL,
  invitee_name varchar(255),
  title varchar(1024) NOT NULL,
  description text,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  timezone varchar(64),
  location varchar(512),
  meeting_url varchar(1024),
  status varchar(32) NOT NULL DEFAULT 'confirmed',
  external_event_id varchar(255),
  integration_id uuid REFERENCES calendar_integrations(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bookings_org_host_idx ON bookings(org_id, host_user_id);
CREATE INDEX IF NOT EXISTS bookings_org_start_idx ON bookings(org_id, start_at);

-- ─── #264 Identity graph ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS identity_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  signal_type varchar(32) NOT NULL,
  signal_value varchar(512) NOT NULL,
  confidence integer NOT NULL DEFAULT 50,
  source varchar(64),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE UNIQUE INDEX IF NOT EXISTS identity_signals_org_type_value_uq
  ON identity_signals(org_id, signal_type, signal_value);
CREATE INDEX IF NOT EXISTS identity_signals_contact_idx
  ON identity_signals(contact_id);
CREATE INDEX IF NOT EXISTS identity_signals_last_seen_idx
  ON identity_signals(last_seen_at);

CREATE TABLE IF NOT EXISTS identity_merges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  winner_contact_id uuid NOT NULL,
  loser_contact_id uuid NOT NULL,
  moved_signals integer NOT NULL DEFAULT 0,
  reason varchar(255),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS identity_merges_org_idx ON identity_merges(org_id);
CREATE INDEX IF NOT EXISTS identity_merges_winner_idx ON identity_merges(winner_contact_id);
