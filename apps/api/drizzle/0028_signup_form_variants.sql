-- Signup form A/B variants — #76

CREATE TABLE IF NOT EXISTS signup_form_variants (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id        UUID NOT NULL REFERENCES signup_forms(id) ON DELETE CASCADE,
  org_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name           VARCHAR(255) NOT NULL,
  traffic_split  INTEGER NOT NULL DEFAULT 50 CHECK (traffic_split BETWEEN 0 AND 100),
  fields         JSONB,
  config         JSONB,
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  view_count     INTEGER NOT NULL DEFAULT 0,
  submit_count   INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS signup_form_variants_form_id_idx ON signup_form_variants(form_id);
CREATE INDEX IF NOT EXISTS signup_form_variants_org_id_idx  ON signup_form_variants(org_id);
