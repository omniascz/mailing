-- #217 Custom objects, #219 BotSense (email_events.is_bot/bot_score/bot_reason),
-- #225 Salesforce integration, #229 App Studio.

-- ─── #217 Custom objects ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS custom_object_definitions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key                VARCHAR(64) NOT NULL,
  singular_label     TEXT NOT NULL,
  plural_label       TEXT NOT NULL,
  description        TEXT,
  fields             JSONB NOT NULL DEFAULT '[]'::jsonb,
  primary_field_key  VARCHAR(64),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS custom_object_defs_org_key_idx ON custom_object_definitions (org_id, key);

CREATE TABLE IF NOT EXISTS custom_object_records (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL,
  object_def_id UUID NOT NULL REFERENCES custom_object_definitions(id) ON DELETE CASCADE,
  object_key    VARCHAR(64) NOT NULL,
  external_id   VARCHAR(255),
  data          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS custom_object_records_org_idx ON custom_object_records (org_id);
CREATE INDEX IF NOT EXISTS custom_object_records_def_idx ON custom_object_records (object_def_id);
CREATE UNIQUE INDEX IF NOT EXISTS custom_object_records_external_idx ON custom_object_records (org_id, object_key, external_id);

CREATE TABLE IF NOT EXISTS custom_object_relations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL,
  record_id           UUID NOT NULL REFERENCES custom_object_records(id) ON DELETE CASCADE,
  entity_type         VARCHAR(32) NOT NULL,
  entity_id           UUID NOT NULL,
  entity_custom_key   VARCHAR(64),
  role                VARCHAR(64),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS custom_object_rel_record_idx ON custom_object_relations (record_id);
CREATE INDEX IF NOT EXISTS custom_object_rel_entity_idx ON custom_object_relations (org_id, entity_type, entity_id);

-- ─── #219 BotSense — bot detection columns on email_events ───────────────────

ALTER TABLE email_events ADD COLUMN IF NOT EXISTS is_bot     BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE email_events ADD COLUMN IF NOT EXISTS bot_score  REAL;
ALTER TABLE email_events ADD COLUMN IF NOT EXISTS bot_reason VARCHAR(255);
CREATE INDEX IF NOT EXISTS email_events_is_bot_idx ON email_events (is_bot) WHERE is_bot = TRUE;

-- ─── #225 Salesforce ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS salesforce_connections (
  org_id              UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  instance_url        TEXT NOT NULL,
  access_token        TEXT NOT NULL,
  refresh_token       TEXT,
  token_issued_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  salesforce_user_id  TEXT,
  salesforce_org_id   TEXT,
  api_version         VARCHAR(8) NOT NULL DEFAULT 'v59.0',
  sync_contacts       BOOLEAN NOT NULL DEFAULT TRUE,
  sync_accounts       BOOLEAN NOT NULL DEFAULT TRUE,
  sync_deals          BOOLEAN NOT NULL DEFAULT TRUE,
  field_map           JSONB,
  last_sync_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS salesforce_id_map (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL,
  entity_type       VARCHAR(16) NOT NULL,
  local_id          UUID NOT NULL,
  salesforce_id     VARCHAR(32) NOT NULL,
  last_synced_hash  VARCHAR(64),
  last_synced_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS sf_idmap_local_idx ON salesforce_id_map (org_id, entity_type, local_id);
CREATE UNIQUE INDEX IF NOT EXISTS sf_idmap_sfdc_idx  ON salesforce_id_map (org_id, entity_type, salesforce_id);

CREATE TABLE IF NOT EXISTS salesforce_sync_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL,
  direction     VARCHAR(8) NOT NULL,
  entity_type   VARCHAR(16) NOT NULL,
  inserted      JSONB,
  updated       JSONB,
  failed        JSONB,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS sf_sync_runs_org_idx ON salesforce_sync_runs (org_id, started_at);

-- ─── #229 App Studio ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS app_studio_apps (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  slug                VARCHAR(64) NOT NULL,
  name                VARCHAR(255) NOT NULL,
  description         TEXT,
  icon_url            VARCHAR(1024),
  settings_schema     JSONB,
  settings            JSONB NOT NULL DEFAULT '{}'::jsonb,
  access_token_hash   VARCHAR(128),
  enabled             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS app_studio_apps_org_slug_idx ON app_studio_apps (org_id, slug);

CREATE TABLE IF NOT EXISTS app_studio_webhook_subscribers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL,
  app_id          UUID NOT NULL REFERENCES app_studio_apps(id) ON DELETE CASCADE,
  event           VARCHAR(100) NOT NULL,
  target_url      VARCHAR(2048) NOT NULL,
  secret          VARCHAR(128) NOT NULL,
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  delivery_count  INTEGER NOT NULL DEFAULT 0,
  failure_count   INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS app_studio_subs_app_idx   ON app_studio_webhook_subscribers (app_id);
CREATE INDEX IF NOT EXISTS app_studio_subs_event_idx ON app_studio_webhook_subscribers (org_id, event);

CREATE TABLE IF NOT EXISTS app_studio_actions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL,
  app_id        UUID NOT NULL REFERENCES app_studio_apps(id) ON DELETE CASCADE,
  key           VARCHAR(64) NOT NULL,
  name          VARCHAR(255) NOT NULL,
  description   TEXT,
  method        VARCHAR(8) NOT NULL DEFAULT 'POST',
  url_template  VARCHAR(2048) NOT NULL,
  headers       JSONB NOT NULL DEFAULT '{}'::jsonb,
  body_template TEXT,
  param_schema  JSONB,
  response_path VARCHAR(255),
  enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS app_studio_actions_app_key_idx ON app_studio_actions (app_id, key);

CREATE TABLE IF NOT EXISTS app_studio_triggers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL,
  app_id          UUID NOT NULL REFERENCES app_studio_apps(id) ON DELETE CASCADE,
  key             VARCHAR(64) NOT NULL,
  name            VARCHAR(255) NOT NULL,
  event_name      VARCHAR(100) NOT NULL,
  payload_schema  JSONB,
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS app_studio_triggers_app_key_idx ON app_studio_triggers (app_id, key);
