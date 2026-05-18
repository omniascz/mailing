-- #336/#340/#412 Blog platform + CTA widgets

DO $$ BEGIN
  CREATE TYPE "blog_post_status" AS ENUM ('draft', 'published', 'scheduled', 'archived');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "cta_type" AS ENUM ('button', 'banner', 'popup', 'inline', 'exit_intent');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Blog categories
CREATE TABLE IF NOT EXISTS "blog_categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "slug" varchar(128) NOT NULL,
  "name" varchar(255) NOT NULL,
  "description" text,
  "parent_id" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "blog_categories_org_slug_uq" ON "blog_categories" ("org_id", "slug");
CREATE INDEX IF NOT EXISTS "blog_categories_org_idx" ON "blog_categories" ("org_id");

-- Blog authors
CREATE TABLE IF NOT EXISTS "blog_authors" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "slug" varchar(128) NOT NULL,
  "display_name" varchar(255) NOT NULL,
  "bio" text,
  "avatar_url" text,
  "social_links" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "blog_authors_org_slug_uq" ON "blog_authors" ("org_id", "slug");
CREATE INDEX IF NOT EXISTS "blog_authors_user_idx" ON "blog_authors" ("user_id");

-- Blog posts
CREATE TABLE IF NOT EXISTS "blog_posts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "author_id" uuid REFERENCES "blog_authors"("id") ON DELETE SET NULL,
  "category_id" uuid REFERENCES "blog_categories"("id") ON DELETE SET NULL,
  "slug" varchar(255) NOT NULL,
  "title" varchar(255) NOT NULL,
  "excerpt" text,
  "body" text NOT NULL,
  "hero_image_url" text,
  "translation_group_id" uuid,
  "locale" varchar(16) NOT NULL DEFAULT 'en',
  "status" "blog_post_status" NOT NULL DEFAULT 'draft',
  "meta_title" varchar(255),
  "meta_description" varchar(512),
  "canonical_url" text,
  "tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "published_at" timestamp with time zone,
  "scheduled_publish_at" timestamp with time zone,
  "version" varchar(16) NOT NULL DEFAULT '1',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "deleted_at" timestamp with time zone
);
CREATE UNIQUE INDEX IF NOT EXISTS "blog_posts_org_slug_locale_uq" ON "blog_posts" ("org_id", "slug", "locale");
CREATE INDEX IF NOT EXISTS "blog_posts_org_status_idx" ON "blog_posts" ("org_id", "status");
CREATE INDEX IF NOT EXISTS "blog_posts_org_category_idx" ON "blog_posts" ("org_id", "category_id");
CREATE INDEX IF NOT EXISTS "blog_posts_org_published_at_idx" ON "blog_posts" ("org_id", "published_at");
CREATE INDEX IF NOT EXISTS "blog_posts_translation_group_idx" ON "blog_posts" ("translation_group_id");

-- Blog post revisions
CREATE TABLE IF NOT EXISTS "blog_post_revisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "post_id" uuid NOT NULL REFERENCES "blog_posts"("id") ON DELETE CASCADE,
  "version" varchar(16) NOT NULL,
  "title" varchar(255) NOT NULL,
  "body" text NOT NULL,
  "excerpt" text,
  "saved_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "blog_post_revisions_post_version_uq" ON "blog_post_revisions" ("post_id", "version");
CREATE INDEX IF NOT EXISTS "blog_post_revisions_post_idx" ON "blog_post_revisions" ("post_id");

-- CTAs
CREATE TABLE IF NOT EXISTS "ctas" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "type" "cta_type" NOT NULL DEFAULT 'button',
  "content" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "conditions" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "active" boolean NOT NULL DEFAULT false,
  "ab_rotation_mode" varchar(16),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "deleted_at" timestamp with time zone
);
CREATE INDEX IF NOT EXISTS "ctas_org_idx" ON "ctas" ("org_id");
CREATE INDEX IF NOT EXISTS "ctas_org_active_idx" ON "ctas" ("org_id", "active");

CREATE TABLE IF NOT EXISTS "cta_variants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "cta_id" uuid NOT NULL REFERENCES "ctas"("id") ON DELETE CASCADE,
  "name" varchar(128) NOT NULL,
  "weight" integer NOT NULL DEFAULT 1,
  "content" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "cta_variants_cta_idx" ON "cta_variants" ("cta_id");

CREATE TABLE IF NOT EXISTS "cta_impressions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "cta_id" uuid NOT NULL REFERENCES "ctas"("id") ON DELETE CASCADE,
  "variant_id" uuid,
  "visitor_id" varchar(128),
  "contact_id" uuid,
  "clicked" boolean NOT NULL DEFAULT false,
  "dismissed" boolean NOT NULL DEFAULT false,
  "context" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "occurred_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "cta_impressions_cta_idx" ON "cta_impressions" ("cta_id", "occurred_at");
CREATE INDEX IF NOT EXISTS "cta_impressions_variant_idx" ON "cta_impressions" ("variant_id");
CREATE INDEX IF NOT EXISTS "cta_impressions_visitor_idx" ON "cta_impressions" ("visitor_id");
