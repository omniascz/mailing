-- Migration 0035: site tracking, sales sequences, site messages, web personalization, live chat

-- ─── Sales sequences ──────────────────────────────────────────────────────────

CREATE TYPE sequence_step_type AS ENUM (
  'email',
  'personal_email',
  'wait',
  'task',
  'sms',
  'linkedin'
);

CREATE TYPE sequence_enrollment_status AS ENUM (
  'active',
  'paused',
  'completed',
  'replied',
  'unsubscribed',
  'bounced',
  'cancelled'
);

CREATE TABLE sales_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  steps JSONB NOT NULL DEFAULT '[]',
  exit_on_reply BOOLEAN NOT NULL DEFAULT TRUE,
  exit_on_unsubscribe BOOLEAN NOT NULL DEFAULT TRUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX sales_sequences_org_idx ON sales_sequences(org_id);

CREATE TABLE sequence_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  sequence_id UUID NOT NULL REFERENCES sales_sequences(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL,
  deal_id UUID,
  enrolled_by_user_id UUID,
  sender_email VARCHAR(255),
  sender_name VARCHAR(255),
  status sequence_enrollment_status NOT NULL DEFAULT 'active',
  current_step_index INTEGER NOT NULL DEFAULT 0,
  next_step_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX seq_enrollments_org_idx ON sequence_enrollments(org_id);
CREATE INDEX seq_enrollments_contact_idx ON sequence_enrollments(contact_id);
CREATE INDEX seq_enrollments_next_step_idx ON sequence_enrollments(next_step_at);
CREATE INDEX seq_enrollments_sequence_idx ON sequence_enrollments(sequence_id);
CREATE UNIQUE INDEX seq_enrollments_unique_active_idx ON sequence_enrollments(sequence_id, contact_id);

CREATE TABLE sequence_step_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  enrollment_id UUID NOT NULL REFERENCES sequence_enrollments(id) ON DELETE CASCADE,
  sequence_id UUID NOT NULL,
  contact_id UUID NOT NULL,
  step_index INTEGER NOT NULL,
  step_type sequence_step_type NOT NULL,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  result JSONB
);

CREATE INDEX seq_step_logs_enrollment_idx ON sequence_step_logs(enrollment_id);
CREATE INDEX seq_step_logs_contact_idx ON sequence_step_logs(contact_id);

-- ─── Site tracking ────────────────────────────────────────────────────────────

CREATE TABLE tracked_sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  site_token VARCHAR(64) NOT NULL UNIQUE,
  domain VARCHAR(253) NOT NULL,
  name VARCHAR(255),
  tracking_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  cross_domain_sync BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX tracked_sites_org_idx ON tracked_sites(org_id);
CREATE UNIQUE INDEX tracked_sites_org_domain_idx ON tracked_sites(org_id, domain);

CREATE TABLE site_page_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  site_id UUID NOT NULL REFERENCES tracked_sites(id) ON DELETE CASCADE,
  visitor_id VARCHAR(128) NOT NULL,
  contact_id UUID,
  url TEXT NOT NULL,
  path VARCHAR(2048),
  referrer TEXT,
  title TEXT,
  utm_source VARCHAR(255),
  utm_medium VARCHAR(255),
  utm_campaign VARCHAR(255),
  utm_content VARCHAR(255),
  session_id VARCHAR(128),
  duration_seconds INTEGER,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX site_page_views_org_idx ON site_page_views(org_id);
CREATE INDEX site_page_views_site_idx ON site_page_views(site_id);
CREATE INDEX site_page_views_visitor_idx ON site_page_views(visitor_id);
CREATE INDEX site_page_views_contact_idx ON site_page_views(contact_id);
CREATE INDEX site_page_views_occurred_idx ON site_page_views(occurred_at);

CREATE TABLE site_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  site_id UUID NOT NULL REFERENCES tracked_sites(id) ON DELETE CASCADE,
  visitor_id VARCHAR(128) NOT NULL,
  contact_id UUID,
  event_name VARCHAR(255) NOT NULL,
  properties JSONB DEFAULT '{}',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX site_events_org_idx ON site_events(org_id);
CREATE INDEX site_events_visitor_idx ON site_events(visitor_id);
CREATE INDEX site_events_name_idx ON site_events(org_id, event_name);
CREATE INDEX site_events_contact_idx ON site_events(contact_id);

-- ─── Site messages (on-site overlays) ────────────────────────────────────────

CREATE TYPE site_message_type AS ENUM ('popup', 'banner', 'slide_in', 'full_screen');

CREATE TYPE site_message_trigger AS ENUM (
  'page_visit',
  'time_on_site',
  'exit_intent',
  'scroll_depth',
  'cart_value',
  'returning_visitor',
  'segment_match',
  'custom_event'
);

CREATE TABLE site_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  site_id UUID,
  name VARCHAR(255) NOT NULL,
  type site_message_type NOT NULL DEFAULT 'popup',
  trigger site_message_trigger NOT NULL DEFAULT 'page_visit',
  conditions JSONB NOT NULL DEFAULT '[]',
  headline VARCHAR(255),
  body TEXT,
  cta_text VARCHAR(100),
  cta_url VARCHAR(2048),
  style JSONB DEFAULT '{}',
  show_once_per_visitor BOOLEAN NOT NULL DEFAULT TRUE,
  show_once_per_session BOOLEAN NOT NULL DEFAULT FALSE,
  delay_seconds INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX site_messages_org_idx ON site_messages(org_id);
CREATE INDEX site_messages_site_idx ON site_messages(site_id);

CREATE TABLE site_message_impressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  message_id UUID NOT NULL REFERENCES site_messages(id) ON DELETE CASCADE,
  visitor_id VARCHAR(128) NOT NULL,
  contact_id UUID,
  clicked BOOLEAN NOT NULL DEFAULT FALSE,
  dismissed BOOLEAN NOT NULL DEFAULT FALSE,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX site_msg_imp_message_idx ON site_message_impressions(message_id);
CREATE INDEX site_msg_imp_visitor_idx ON site_message_impressions(visitor_id);

-- ─── Web personalization rules ────────────────────────────────────────────────

CREATE TYPE web_personalization_action AS ENUM (
  'hide',
  'show',
  'swap_text',
  'swap_html',
  'add_class',
  'remove_class',
  'set_attr'
);

CREATE TABLE web_personalization_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  site_id UUID,
  name VARCHAR(255) NOT NULL,
  selector TEXT NOT NULL,
  action web_personalization_action NOT NULL DEFAULT 'swap_text',
  value TEXT,
  url_pattern VARCHAR(2048),
  audience JSONB NOT NULL DEFAULT '{"type":"all"}',
  priority VARCHAR(10) NOT NULL DEFAULT '10',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX web_pers_rules_org_idx ON web_personalization_rules(org_id);
CREATE INDEX web_pers_rules_site_idx ON web_personalization_rules(site_id);
