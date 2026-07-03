-- Template version history (SendGrid dynamic-template versions parity).
CREATE TABLE IF NOT EXISTS "template_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "template_id" uuid NOT NULL REFERENCES "templates"("id") ON DELETE cascade,
  "version" integer NOT NULL,
  "name" varchar(255),
  "subject" varchar(255),
  "preheader" varchar(255),
  "blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "global_styles" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by" uuid,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "template_versions_org_idx" ON "template_versions" ("org_id");
CREATE INDEX IF NOT EXISTS "template_versions_template_idx" ON "template_versions" ("template_id", "version");
CREATE UNIQUE INDEX IF NOT EXISTS "template_versions_template_version_uq" ON "template_versions" ("template_id", "version");
