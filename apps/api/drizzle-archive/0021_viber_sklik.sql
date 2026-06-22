-- Migration: Viber templates table + campaign_type enum extension
-- 0021_viber_sklik.sql

-- Viber campaign type (safe — no-op if already present)
ALTER TYPE campaign_type ADD VALUE IF NOT EXISTS 'viber';

-- Viber templates table
CREATE TABLE IF NOT EXISTS viber_templates (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name                 VARCHAR(100) NOT NULL,
  type                 VARCHAR(20)  NOT NULL DEFAULT 'text',
  body                 TEXT         NOT NULL,
  media_url            VARCHAR(2048),
  action_url           VARCHAR(2048),
  action_text          VARCHAR(255),
  status               VARCHAR(20)  NOT NULL DEFAULT 'pending',
  provider             VARCHAR(20),
  provider_template_id VARCHAR(255),
  metadata             JSONB        DEFAULT '{}',
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS viber_templates_org_name_idx   ON viber_templates(org_id, name);
CREATE INDEX IF NOT EXISTS viber_templates_org_status_idx ON viber_templates(org_id, status);
