-- #145 Audit logging
CREATE TABLE IF NOT EXISTS audit_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL,
  user_id       UUID,
  action        TEXT NOT NULL,
  resource      TEXT NOT NULL,
  resource_id   TEXT,
  changes       JSONB,
  metadata      JSONB,
  ip_address    TEXT,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_logs_org_idx        ON audit_logs (org_id);
CREATE INDEX IF NOT EXISTS audit_logs_user_idx       ON audit_logs (user_id);
CREATE INDEX IF NOT EXISTS audit_logs_org_created_idx ON audit_logs (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_resource_idx   ON audit_logs (org_id, resource);

-- #137 Stripe billing subscriptions
CREATE TABLE IF NOT EXISTS billing_subscriptions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 UUID NOT NULL UNIQUE,
  plan                   plan NOT NULL DEFAULT 'free',
  stripe_customer_id     TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  stripe_status          TEXT,
  current_period_start   TIMESTAMPTZ,
  current_period_end     TIMESTAMPTZ,
  cancel_at_period_end   BOOLEAN NOT NULL DEFAULT FALSE,
  trial_ends_at          TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS billing_subscriptions_customer_idx ON billing_subscriptions (stripe_customer_id);
