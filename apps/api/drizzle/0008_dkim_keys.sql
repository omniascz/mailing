CREATE TABLE "dkim_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"domain_id" uuid NOT NULL,
	"selector" varchar(63) NOT NULL,
	"private_key" text NOT NULL,
	"public_key" text NOT NULL,
	"key_type" varchar(16) DEFAULT 'rsa' NOT NULL,
	"status" varchar(16) NOT NULL,
	"is_byo" varchar(5) DEFAULT 'false' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"activated_at" timestamp with time zone,
	"retiring_at" timestamp with time zone,
	"retired_at" timestamp with time zone,
	"dns_verified_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dkim_keys" ADD CONSTRAINT "dkim_keys_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dkim_keys" ADD CONSTRAINT "dkim_keys_domain_id_sending_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."sending_domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dkim_keys_domain_selector_uq" ON "dkim_keys" USING btree ("domain_id","selector");--> statement-breakpoint
CREATE UNIQUE INDEX "dkim_keys_one_active_uq" ON "dkim_keys" USING btree ("domain_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "dkim_keys_one_pending_uq" ON "dkim_keys" USING btree ("domain_id") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "dkim_keys_domain_status_idx" ON "dkim_keys" USING btree ("domain_id","status");--> statement-breakpoint
CREATE INDEX "dkim_keys_org_idx" ON "dkim_keys" USING btree ("org_id");--> statement-breakpoint
-- Backfill: every sending_domains row that already holds a DKIM key becomes one
-- dkim_keys row. A domain whose key is verified in DNS (dkim_verified or the
-- overall is_verified flag) is `active` — it is what mail is signed with today;
-- otherwise it is `pending` (generated, DNS not yet confirmed). The partial
-- unique indexes hold because there is exactly one key per domain before this.
INSERT INTO "dkim_keys" (
  "org_id", "domain_id", "selector", "private_key", "public_key", "key_type",
  "status", "is_byo", "created_at", "activated_at", "dns_verified_at", "updated_at"
)
SELECT
  d."org_id",
  d."id",
  d."dkim_selector",
  d."dkim_private_key",
  COALESCE(d."dkim_public_key", ''),
  COALESCE(d."dkim_key_type", 'rsa'),
  CASE WHEN d."dkim_verified" OR d."is_verified" THEN 'active' ELSE 'pending' END,
  CASE WHEN COALESCE(d."dkim_byo", false) THEN 'true' ELSE 'false' END,
  COALESCE(d."created_at", now()),
  CASE WHEN d."dkim_verified" OR d."is_verified" THEN COALESCE(d."dkim_verified_at", now()) END,
  CASE WHEN d."dkim_verified" OR d."is_verified" THEN d."dkim_verified_at" END,
  now()
FROM "sending_domains" d
WHERE d."dkim_private_key" IS NOT NULL AND d."dkim_private_key" <> '';
