-- #183 Sales pipelines, #184 Deal management, #186 Account records,
-- #191 Pipeline reports, #192 Win/loss analysis, #193 Revenue forecasting

-- Accounts (B2B companies)
CREATE TABLE IF NOT EXISTS accounts (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               UUID NOT NULL,
  name                 TEXT NOT NULL,
  domain               TEXT,
  industry             TEXT,
  annual_revenue_usd   BIGINT,
  employee_count       INTEGER,
  parent_account_id    UUID,
  owner_user_id        UUID,
  custom_fields        JSONB,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at           TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS accounts_org_idx    ON accounts (org_id);
CREATE INDEX IF NOT EXISTS accounts_parent_idx ON accounts (parent_account_id);
CREATE INDEX IF NOT EXISTS accounts_owner_idx  ON accounts (owner_user_id);

-- Pipelines (each org typically has 1 default + 0..N custom)
CREATE TABLE IF NOT EXISTS pipelines (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT,
  is_default   BOOLEAN NOT NULL DEFAULT FALSE,
  stages       JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pipelines_org_idx ON pipelines (org_id);

-- Deal status enum
DO $$ BEGIN
  CREATE TYPE deal_status AS ENUM ('open', 'won', 'lost');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS deals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL,
  pipeline_id         UUID NOT NULL,
  stage_id            TEXT NOT NULL,
  name                TEXT NOT NULL,
  description         TEXT,
  contact_id          UUID,
  account_id          UUID,
  value               NUMERIC(18, 2) NOT NULL DEFAULT 0,
  currency            TEXT NOT NULL DEFAULT 'USD',
  expected_close_date TIMESTAMPTZ,
  actual_close_date   TIMESTAMPTZ,
  owner_user_id       UUID,
  status              deal_status NOT NULL DEFAULT 'open',
  lost_reason         TEXT,
  source              TEXT,
  custom_fields       JSONB,
  stage_changed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS deals_org_idx         ON deals (org_id);
CREATE INDEX IF NOT EXISTS deals_pipeline_idx    ON deals (pipeline_id);
CREATE INDEX IF NOT EXISTS deals_contact_idx     ON deals (contact_id);
CREATE INDEX IF NOT EXISTS deals_account_idx     ON deals (account_id);
CREATE INDEX IF NOT EXISTS deals_owner_idx       ON deals (owner_user_id);
CREATE INDEX IF NOT EXISTS deals_org_status_idx  ON deals (org_id, status);
CREATE INDEX IF NOT EXISTS deals_stage_idx       ON deals (pipeline_id, stage_id);

-- Audit trail of stage transitions (powers velocity + conversion reports)
CREATE TABLE IF NOT EXISTS deal_stage_history (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL,
  deal_id             UUID NOT NULL,
  from_stage_id       TEXT,
  to_stage_id         TEXT NOT NULL,
  duration_seconds    INTEGER,
  changed_by_user_id  UUID,
  changed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS deal_stage_history_deal_idx ON deal_stage_history (deal_id);
CREATE INDEX IF NOT EXISTS deal_stage_history_org_idx  ON deal_stage_history (org_id);
