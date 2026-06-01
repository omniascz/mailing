-- Reviews collection module (§9 P1).
--
-- `reviews` stores customer-submitted product feedback with rating,
-- title, body, optional sentiment analysis, and a moderation state
-- machine. `review_requests` holds the per-order tokens we hand out
-- so the public submit endpoint can authenticate without a session.

CREATE TYPE "review_status" AS ENUM ('pending', 'approved', 'rejected', 'spam');

CREATE TABLE IF NOT EXISTS "reviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "contact_id" uuid REFERENCES "contacts"("id") ON DELETE SET NULL,
  "product_sku" varchar(128),
  "product_name" varchar(255),
  "order_id" varchar(128),
  "rating" smallint NOT NULL,
  "title" varchar(255),
  "body" text NOT NULL,
  "status" review_status NOT NULL DEFAULT 'pending',
  "sentiment" varchar(16),
  "sentiment_score" numeric(4, 3),
  "source" varchar(32) NOT NULL DEFAULT 'public_form',
  "moderation_reason" varchar(255),
  "moderated_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "moderated_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz,
  CONSTRAINT "reviews_rating_check" CHECK ("rating" BETWEEN 1 AND 5)
);

CREATE INDEX IF NOT EXISTS "reviews_org_status_idx"
  ON "reviews" ("org_id", "status");
CREATE INDEX IF NOT EXISTS "reviews_org_product_idx"
  ON "reviews" ("org_id", "product_sku");
CREATE INDEX IF NOT EXISTS "reviews_org_created_idx"
  ON "reviews" ("org_id", "created_at");

CREATE TABLE IF NOT EXISTS "review_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "contact_id" uuid REFERENCES "contacts"("id") ON DELETE CASCADE,
  "order_id" varchar(128),
  "product_sku" varchar(128),
  "token" varchar(64) NOT NULL UNIQUE,
  "review_id" uuid REFERENCES "reviews"("id") ON DELETE SET NULL,
  "requested_at" timestamptz NOT NULL DEFAULT now(),
  "responded_at" timestamptz,
  "expires_at" timestamptz NOT NULL DEFAULT (now() + interval '60 days')
);

CREATE INDEX IF NOT EXISTS "review_requests_org_contact_idx"
  ON "review_requests" ("org_id", "contact_id");
CREATE INDEX IF NOT EXISTS "review_requests_token_idx"
  ON "review_requests" ("token");
