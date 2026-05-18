-- Migration: Ad management extensions + Commerce Hub
-- Tasks: #303, #304, #305, #306, #307, #308, #309, #310, #311, #312

-- ─── Ad performance snapshots (#305) ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "ad_performance_snapshots" (
  "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"        UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "ad_account_id" UUID NOT NULL REFERENCES "ad_accounts"("id") ON DELETE CASCADE,
  "date"          VARCHAR(10) NOT NULL,
  "platform"      VARCHAR(32) NOT NULL,
  "campaign_id"   VARCHAR(255),
  "campaign_name" VARCHAR(255),
  "ad_set_id"     VARCHAR(255),
  "impressions"   INTEGER NOT NULL DEFAULT 0,
  "clicks"        INTEGER NOT NULL DEFAULT 0,
  "spend"         NUMERIC(14,4) NOT NULL DEFAULT 0,
  "conversions"   INTEGER NOT NULL DEFAULT 0,
  "revenue"       NUMERIC(14,2) NOT NULL DEFAULT 0,
  "raw_data"      JSONB DEFAULT '{}',
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "ad_perf_org_date_idx"
  ON "ad_performance_snapshots"("org_id", "date");

CREATE INDEX IF NOT EXISTS "ad_perf_account_date_idx"
  ON "ad_performance_snapshots"("ad_account_id", "date");

-- ─── Quotes (#308, #309) ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "quotes" (
  "id"                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"            UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "deal_id"           UUID REFERENCES "deals"("id") ON DELETE SET NULL,
  "contact_id"        UUID,
  "quote_number"      VARCHAR(64) NOT NULL,
  "title"             VARCHAR(255) NOT NULL,
  "status"            VARCHAR(32) NOT NULL DEFAULT 'draft',
  "currency"          VARCHAR(3) NOT NULL DEFAULT 'USD',
  "line_items"        JSONB NOT NULL DEFAULT '[]',
  "subtotal"          NUMERIC(18,2) NOT NULL DEFAULT 0,
  "discount_total"    NUMERIC(18,2) NOT NULL DEFAULT 0,
  "tax_total"         NUMERIC(18,2) NOT NULL DEFAULT 0,
  "total"             NUMERIC(18,2) NOT NULL DEFAULT 0,
  "valid_until"       TIMESTAMPTZ,
  "notes"             TEXT,
  "terms"             TEXT,
  "signature_token"   VARCHAR(128),
  "signed_at"         TIMESTAMPTZ,
  "signed_by_name"    VARCHAR(255),
  "signed_by_ip"      VARCHAR(64),
  "esign_provider"    VARCHAR(32),
  "esign_envelope_id" VARCHAR(255),
  "esign_status"      VARCHAR(32),
  "pdf_url"           TEXT,
  "metadata"          JSONB DEFAULT '{}',
  "sent_at"           TIMESTAMPTZ,
  "viewed_at"         TIMESTAMPTZ,
  "accepted_at"       TIMESTAMPTZ,
  "created_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "quotes_org_idx"
  ON "quotes"("org_id");

CREATE INDEX IF NOT EXISTS "quotes_deal_idx"
  ON "quotes"("deal_id");

CREATE INDEX IF NOT EXISTS "quotes_token_idx"
  ON "quotes"("signature_token") WHERE signature_token IS NOT NULL;

-- ─── Invoices (#311) ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "invoices" (
  "id"                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"                   UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "deal_id"                  UUID REFERENCES "deals"("id") ON DELETE SET NULL,
  "contact_id"               UUID,
  "invoice_number"           VARCHAR(64) NOT NULL,
  "status"                   VARCHAR(32) NOT NULL DEFAULT 'draft',
  "currency"                 VARCHAR(3) NOT NULL DEFAULT 'USD',
  "line_items"               JSONB NOT NULL DEFAULT '[]',
  "subtotal"                 NUMERIC(18,2) NOT NULL DEFAULT 0,
  "tax_total"                NUMERIC(18,2) NOT NULL DEFAULT 0,
  "total"                    NUMERIC(18,2) NOT NULL DEFAULT 0,
  "amount_paid"              NUMERIC(18,2) NOT NULL DEFAULT 0,
  "amount_due"               NUMERIC(18,2) NOT NULL DEFAULT 0,
  "due_date"                 TIMESTAMPTZ,
  "notes"                    TEXT,
  "stripe_payment_intent_id" VARCHAR(255),
  "stripe_invoice_id"        VARCHAR(255),
  "paid_at"                  TIMESTAMPTZ,
  "pdf_url"                  TEXT,
  "reminders_sent"           INTEGER NOT NULL DEFAULT 0,
  "last_reminder_at"         TIMESTAMPTZ,
  "metadata"                 JSONB DEFAULT '{}',
  "sent_at"                  TIMESTAMPTZ,
  "voided_at"                TIMESTAMPTZ,
  "created_at"               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "invoices_org_idx"
  ON "invoices"("org_id");

CREATE INDEX IF NOT EXISTS "invoices_deal_idx"
  ON "invoices"("deal_id");

CREATE INDEX IF NOT EXISTS "invoices_org_status_idx"
  ON "invoices"("org_id", "status");

CREATE INDEX IF NOT EXISTS "invoices_due_date_idx"
  ON "invoices"("due_date") WHERE status IN ('sent', 'overdue');

CREATE INDEX IF NOT EXISTS "invoices_stripe_pi_idx"
  ON "invoices"("stripe_payment_intent_id") WHERE stripe_payment_intent_id IS NOT NULL;

-- ─── Workflow: sync_to_ad_audience trigger type (#307) ────────────────────────
-- NodeType is a TypeScript union, no DB change needed.

-- ─── Revenue events: ad attribution columns (#306) ────────────────────────────
-- utm_source / utm_medium / utm_campaign already exist on revenue_events from 0000.
-- No additional columns needed; attributionModel accepts 'view_through' as string.
