-- Customer subscriptions (Commerce Hub #313)
-- NOTE: distinct from `billing_subscriptions` which tracks each org's own
-- ForgeMsg plan. These rows represent recurring products an org sells to
-- its own customers.

CREATE TABLE IF NOT EXISTS "subscriptions" (
  "id"                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"                  uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "contact_id"              uuid REFERENCES "contacts"("id") ON DELETE SET NULL,
  "deal_id"                 uuid REFERENCES "deals"("id") ON DELETE SET NULL,

  "subscription_number"     varchar(64) NOT NULL,
  "status"                  varchar(32) NOT NULL DEFAULT 'active',
  "currency"                varchar(3)  NOT NULL DEFAULT 'USD',

  "line_items"              jsonb       NOT NULL DEFAULT '[]'::jsonb,
  "mrr"                     numeric(18, 2) NOT NULL DEFAULT 0,

  "billing_interval"        varchar(16) NOT NULL DEFAULT 'month',
  "billing_interval_count"  integer     NOT NULL DEFAULT 1,
  "billing_anchor"          integer,

  "start_date"              timestamptz NOT NULL DEFAULT now(),
  "trial_ends_at"           timestamptz,
  "ends_at"                 timestamptz,
  "current_period_start"    timestamptz NOT NULL DEFAULT now(),
  "current_period_end"      timestamptz NOT NULL,
  "next_invoice_at"         timestamptz NOT NULL,

  "cancel_at"               timestamptz,
  "canceled_at"             timestamptz,
  "cancel_reason"           text,

  "past_due_since"          timestamptz,
  "dunning_attempts"        integer     NOT NULL DEFAULT 0,

  "stripe_subscription_id"  varchar(255),
  "metadata"                jsonb       NOT NULL DEFAULT '{}'::jsonb,

  "created_at"              timestamptz NOT NULL DEFAULT now(),
  "updated_at"              timestamptz NOT NULL DEFAULT now(),
  "deleted_at"              timestamptz
);

CREATE INDEX IF NOT EXISTS "subscriptions_org_idx"         ON "subscriptions" ("org_id");
CREATE INDEX IF NOT EXISTS "subscriptions_contact_idx"     ON "subscriptions" ("contact_id");
CREATE INDEX IF NOT EXISTS "subscriptions_org_status_idx"  ON "subscriptions" ("org_id", "status");
CREATE INDEX IF NOT EXISTS "subscriptions_next_invoice_idx" ON "subscriptions" ("next_invoice_at");
CREATE INDEX IF NOT EXISTS "subscriptions_stripe_idx"      ON "subscriptions" ("stripe_subscription_id");

CREATE TABLE IF NOT EXISTS "subscription_changes" (
  "id"                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"                 uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "subscription_id"        uuid NOT NULL REFERENCES "subscriptions"("id") ON DELETE CASCADE,

  "change_type"            varchar(32) NOT NULL,
  "previous_line_items"    jsonb       NOT NULL DEFAULT '[]'::jsonb,
  "new_line_items"         jsonb       NOT NULL DEFAULT '[]'::jsonb,
  "previous_mrr"           numeric(18, 2) NOT NULL DEFAULT 0,
  "new_mrr"                numeric(18, 2) NOT NULL DEFAULT 0,
  "proration_amount"       numeric(18, 2) NOT NULL DEFAULT 0,
  "proration_invoice_id"   uuid,

  "effective_at"           timestamptz NOT NULL DEFAULT now(),
  "changed_by_user_id"     uuid,

  "metadata"               jsonb       NOT NULL DEFAULT '{}'::jsonb,
  "created_at"             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "subscription_changes_sub_idx" ON "subscription_changes" ("subscription_id");
CREATE INDEX IF NOT EXISTS "subscription_changes_org_idx" ON "subscription_changes" ("org_id");
