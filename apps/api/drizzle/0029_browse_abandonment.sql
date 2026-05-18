-- Browse abandonment / retargeting — #85

CREATE TABLE IF NOT EXISTS product_page_views (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id       UUID REFERENCES contacts(id) ON DELETE CASCADE,
  visitor_token    VARCHAR(128),
  sku              VARCHAR(128),
  product_name     VARCHAR(512),
  product_url      VARCHAR(2048),
  view_count       INTEGER NOT NULL DEFAULT 1,
  first_viewed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_viewed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  meta             JSONB NOT NULL DEFAULT '{}'
);

-- Unique per (org, contact, sku) — allows upsert on repeat visits.
-- contact_id can be NULL for anonymous visitors so the unique constraint
-- only applies when contact_id IS NOT NULL.
CREATE UNIQUE INDEX IF NOT EXISTS product_page_views_contact_sku_uq
  ON product_page_views(org_id, contact_id, sku)
  WHERE contact_id IS NOT NULL AND sku IS NOT NULL;

CREATE INDEX IF NOT EXISTS product_page_views_org_idx         ON product_page_views(org_id);
CREATE INDEX IF NOT EXISTS product_page_views_contact_idx     ON product_page_views(contact_id);
CREATE INDEX IF NOT EXISTS product_page_views_last_viewed_idx ON product_page_views(last_viewed_at);
CREATE INDEX IF NOT EXISTS product_page_views_visitor_idx     ON product_page_views(visitor_token);

CREATE TABLE IF NOT EXISTS browse_abandonment_fires (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL,
  contact_id   UUID NOT NULL,
  sku          VARCHAR(128),
  fired_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  converted    BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS browse_abandonment_fires_org_contact_idx ON browse_abandonment_fires(org_id, contact_id);
CREATE INDEX IF NOT EXISTS browse_abandonment_fires_fired_at_idx    ON browse_abandonment_fires(fired_at);
