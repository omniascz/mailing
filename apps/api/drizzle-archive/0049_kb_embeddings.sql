-- RAG vector store (#335) + multi-language content (#338) + sandboxes (#342)
-- Requires pgvector extension.

CREATE EXTENSION IF NOT EXISTS vector;

-- ─── kb_documents ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "kb_documents" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"        uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "source_type"   varchar(32) NOT NULL,
  "source_id"     varchar(255),
  "external_ref"  varchar(1024),
  "title"         text NOT NULL,
  "url"           text,
  "language"      varchar(8) NOT NULL DEFAULT 'en',
  "body"          text NOT NULL,
  "content_hash"  varchar(64) NOT NULL,
  "status"        varchar(16) NOT NULL DEFAULT 'pending',
  "error"         text,
  "metadata"      jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  "updated_at"    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "kb_documents_org_idx"    ON "kb_documents" ("org_id");
CREATE INDEX IF NOT EXISTS "kb_documents_source_idx" ON "kb_documents" ("org_id", "source_type", "source_id");
CREATE INDEX IF NOT EXISTS "kb_documents_ref_idx"    ON "kb_documents" ("org_id", "external_ref");
CREATE INDEX IF NOT EXISTS "kb_documents_status_idx" ON "kb_documents" ("status");

-- ─── kb_chunks ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "kb_chunks" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"       uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "document_id"  uuid NOT NULL REFERENCES "kb_documents"("id") ON DELETE CASCADE,
  "chunk_index"  integer NOT NULL,
  "chunk_text"   text NOT NULL,
  "token_count"  integer NOT NULL DEFAULT 0,
  "embedding"    vector(1024),
  "metadata"     jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at"   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "kb_chunks_org_idx" ON "kb_chunks" ("org_id");
CREATE INDEX IF NOT EXISTS "kb_chunks_doc_idx" ON "kb_chunks" ("document_id");

-- Cosine ANN index. Dimensionality 1024 — Voyage voyage-3 / OpenAI
-- text-embedding-3-small (truncated). ivfflat works on first load; for
-- very large orgs, rebuild as HNSW later.
CREATE INDEX IF NOT EXISTS "kb_chunks_embedding_cos_idx"
  ON "kb_chunks" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);

-- ─── multi-language content (#338) ───────────────────────────────────────────
-- Editor-side entities gain a locale + translations map.
ALTER TABLE "templates"
  ADD COLUMN IF NOT EXISTS "locale"       varchar(8) NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS "translation_group_id" uuid;

ALTER TABLE "campaigns"
  ADD COLUMN IF NOT EXISTS "locale" varchar(8) NOT NULL DEFAULT 'en';

ALTER TABLE "saved_blocks"
  ADD COLUMN IF NOT EXISTS "locale"       varchar(8) NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS "translation_group_id" uuid;

CREATE INDEX IF NOT EXISTS "templates_locale_idx"     ON "templates" ("org_id", "locale");
CREATE INDEX IF NOT EXISTS "templates_tgroup_idx"     ON "templates" ("translation_group_id");
CREATE INDEX IF NOT EXISTS "saved_blocks_tgroup_idx"  ON "saved_blocks" ("translation_group_id");

-- Contact preferred locale (used for auto-selecting the correct template).
ALTER TABLE "contacts"
  ADD COLUMN IF NOT EXISTS "preferred_locale" varchar(8);

-- ─── sandboxes (#342) ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "org_sandboxes" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"          uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "sandbox_org_id"  uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name"            varchar(128) NOT NULL,
  "purpose"         varchar(32) NOT NULL DEFAULT 'dev',
  "status"          varchar(16) NOT NULL DEFAULT 'provisioning',
  "seed_config"     jsonb NOT NULL DEFAULT '{}'::jsonb,
  "no_op_mode"      boolean NOT NULL DEFAULT true,
  "created_by"      uuid,
  "created_at"      timestamptz NOT NULL DEFAULT now(),
  "expires_at"      timestamptz,
  "deleted_at"      timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "org_sandboxes_sandbox_uniq" ON "org_sandboxes" ("sandbox_org_id");
CREATE INDEX IF NOT EXISTS "org_sandboxes_parent_idx"        ON "org_sandboxes" ("org_id");

-- Mark organisations with their sandbox role so guardrails can kick in.
ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "sandbox_of_org_id" uuid REFERENCES "organizations"("id") ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS "sandbox_mode"      varchar(16) NOT NULL DEFAULT 'none';

CREATE INDEX IF NOT EXISTS "organizations_sandbox_parent_idx" ON "organizations" ("sandbox_of_org_id");
