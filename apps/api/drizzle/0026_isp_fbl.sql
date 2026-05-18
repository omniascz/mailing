-- ISP Feedback Loop registrations — #25

DO $$ BEGIN
  CREATE TYPE isp_provider AS ENUM ('gmail', 'microsoft', 'yahoo', 'aol', 'comcast', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS isp_fbl_registrations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  isp           isp_provider NOT NULL,
  fbl_email     VARCHAR(255),
  webhook_url   VARCHAR(2048),
  notes         VARCHAR(1024),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS isp_fbl_org_idx ON isp_fbl_registrations(org_id);
CREATE INDEX IF NOT EXISTS isp_fbl_isp_idx ON isp_fbl_registrations(isp);
