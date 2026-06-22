-- E-commerce integrations — #79 Shopify, #80 WooCommerce, #81 BigCommerce / Magento / PrestaShop

DO $$ BEGIN
  CREATE TYPE ecommerce_platform AS ENUM ('shopify', 'woocommerce', 'bigcommerce', 'magento', 'prestashop');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ecommerce_connection_status AS ENUM ('pending', 'active', 'paused', 'error', 'revoked');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS ecommerce_connections (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  platform             ecommerce_platform NOT NULL,
  name                 VARCHAR(255) NOT NULL,
  status               ecommerce_connection_status NOT NULL DEFAULT 'pending',
  credentials          JSONB NOT NULL DEFAULT '{}',
  sync_state           JSONB NOT NULL DEFAULT '{}',
  webhooks_enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  oauth_state          VARCHAR(256),
  last_error_at        TIMESTAMPTZ,
  last_error_message   VARCHAR(1024),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ecommerce_connections_org_idx      ON ecommerce_connections(org_id);
CREATE INDEX IF NOT EXISTS ecommerce_connections_platform_idx ON ecommerce_connections(platform);
CREATE INDEX IF NOT EXISTS ecommerce_connections_status_idx   ON ecommerce_connections(status);

CREATE TABLE IF NOT EXISTS ecommerce_orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id     UUID NOT NULL REFERENCES ecommerce_connections(id) ON DELETE CASCADE,
  org_id            UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  external_order_id VARCHAR(128) NOT NULL,
  contact_id        UUID,
  customer_email    VARCHAR(255),
  status            VARCHAR(64),
  total_amount      VARCHAR(32),
  currency          CHAR(3) NOT NULL DEFAULT 'USD',
  items             JSONB NOT NULL DEFAULT '[]',
  ordered_at        TIMESTAMPTZ,
  synced_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ecommerce_orders_external_uq    ON ecommerce_orders(connection_id, external_order_id);
CREATE INDEX IF NOT EXISTS ecommerce_orders_org_idx               ON ecommerce_orders(org_id);
CREATE INDEX IF NOT EXISTS ecommerce_orders_contact_idx           ON ecommerce_orders(contact_id);
CREATE INDEX IF NOT EXISTS ecommerce_orders_ordered_at_idx        ON ecommerce_orders(ordered_at);

CREATE TABLE IF NOT EXISTS ecommerce_webhook_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES ecommerce_connections(id) ON DELETE CASCADE,
  org_id        UUID NOT NULL,
  topic         VARCHAR(128) NOT NULL,
  external_id   VARCHAR(128),
  processed     BOOLEAN NOT NULL DEFAULT FALSE,
  error         VARCHAR(1024),
  received_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ecommerce_webhook_events_conn_idx      ON ecommerce_webhook_events(connection_id);
CREATE INDEX IF NOT EXISTS ecommerce_webhook_events_processed_idx ON ecommerce_webhook_events(processed);
