-- Migration: SEO modules — topic clusters, keyword research, on-page audit,
--            rank tracking (#287, #288, #289, #292)

-- ─── Topic clusters ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "seo_topic_clusters" (
  "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"      UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name"        VARCHAR(255) NOT NULL,
  "description" TEXT,
  "status"      VARCHAR(32) NOT NULL DEFAULT 'draft',
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "seo_clusters_org_idx"
  ON "seo_topic_clusters"("org_id");

-- ─── Cluster pages (pillar + spokes) ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "seo_cluster_pages" (
  "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"         UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "cluster_id"     UUID NOT NULL REFERENCES "seo_topic_clusters"("id") ON DELETE CASCADE,
  "page_type"      VARCHAR(16) NOT NULL DEFAULT 'spoke',
  "title"          VARCHAR(500) NOT NULL,
  "url"            TEXT,
  "target_keyword" VARCHAR(255),
  "status"         VARCHAR(32) NOT NULL DEFAULT 'idea',
  "word_count"     INTEGER,
  "notes"          TEXT,
  "metadata"       JSONB DEFAULT '{}',
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "seo_cluster_pages_cluster_idx"
  ON "seo_cluster_pages"("cluster_id");

CREATE INDEX IF NOT EXISTS "seo_cluster_pages_org_type_idx"
  ON "seo_cluster_pages"("org_id", "page_type");

-- ─── Keywords ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "seo_keywords" (
  "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"        UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "keyword"       VARCHAR(500) NOT NULL,
  "language"      VARCHAR(8) NOT NULL DEFAULT 'en',
  "country"       VARCHAR(4) NOT NULL DEFAULT 'US',
  "search_volume" INTEGER,
  "difficulty"    INTEGER,
  "cpc"           TEXT,
  "intent"        VARCHAR(32),
  "enriched_at"   TIMESTAMPTZ,
  "raw_data"      JSONB DEFAULT '{}',
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "seo_keywords_org_kw_uq"
  ON "seo_keywords"("org_id", "keyword", "language", "country");

CREATE INDEX IF NOT EXISTS "seo_keywords_org_volume_idx"
  ON "seo_keywords"("org_id", "search_volume");

-- ─── Rank tracking ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "seo_rank_tracking" (
  "id"        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"    UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "keyword"   VARCHAR(500) NOT NULL,
  "url"       TEXT NOT NULL,
  "language"  VARCHAR(8) NOT NULL DEFAULT 'en',
  "country"   VARCHAR(4) NOT NULL DEFAULT 'US',
  "active"    BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "seo_rank_tracking_uq"
  ON "seo_rank_tracking"("org_id", "keyword", "url", "country");

CREATE INDEX IF NOT EXISTS "seo_rank_tracking_active_idx"
  ON "seo_rank_tracking"("org_id", "active");

-- ─── Rank snapshots ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "seo_rank_snapshots" (
  "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"      UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "tracking_id" UUID NOT NULL REFERENCES "seo_rank_tracking"("id") ON DELETE CASCADE,
  "date"        VARCHAR(10) NOT NULL,
  "position"    INTEGER,
  "url"         TEXT,
  "title"       TEXT,
  "raw_data"    JSONB DEFAULT '{}',
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "seo_rank_snapshots_uq"
  ON "seo_rank_snapshots"("tracking_id", "date");

CREATE INDEX IF NOT EXISTS "seo_rank_snapshots_org_date_idx"
  ON "seo_rank_snapshots"("org_id", "date");

-- ─── On-page audit results ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "seo_audit_results" (
  "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"         UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "url"            TEXT NOT NULL,
  "title"          TEXT,
  "meta_desc"      TEXT,
  "h1"             TEXT,
  "word_count"     INTEGER,
  "readability"    TEXT,
  "score"          INTEGER,
  "issues"         JSONB DEFAULT '[]',
  "headings"       JSONB DEFAULT '{}',
  "internal_links" JSONB DEFAULT '[]',
  "images"         JSONB DEFAULT '[]',
  "raw_data"       JSONB DEFAULT '{}',
  "audited_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "seo_audit_results_org_url_idx"
  ON "seo_audit_results"("org_id", "url");

CREATE INDEX IF NOT EXISTS "seo_audit_results_org_date_idx"
  ON "seo_audit_results"("org_id", "audited_at");
