CREATE TYPE "public"."data_set_kind" AS ENUM('sql', 'segment', 'aggregate');--> statement-breakpoint
CREATE TABLE "data_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"owner_user_id" uuid,
	"name" varchar(255) NOT NULL,
	"description" text,
	"kind" "data_set_kind" DEFAULT 'sql' NOT NULL,
	"parameters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"definition" text NOT NULL,
	"columns" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cache_ttl_seconds" integer DEFAULT 300 NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "permission_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" varchar(128) NOT NULL,
	"description" text,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user_permission_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"permission_set_id" uuid NOT NULL,
	"granted_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "data_sets" ADD CONSTRAINT "data_sets_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_sets" ADD CONSTRAINT "data_sets_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_sets" ADD CONSTRAINT "permission_sets_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permission_sets" ADD CONSTRAINT "user_permission_sets_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permission_sets" ADD CONSTRAINT "user_permission_sets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permission_sets" ADD CONSTRAINT "user_permission_sets_permission_set_id_permission_sets_id_fk" FOREIGN KEY ("permission_set_id") REFERENCES "public"."permission_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permission_sets" ADD CONSTRAINT "user_permission_sets_granted_by_user_id_users_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "data_sets_org_name_uq" ON "data_sets" USING btree ("org_id","name");--> statement-breakpoint
CREATE INDEX "data_sets_org_idx" ON "data_sets" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "permission_sets_org_name_uq" ON "permission_sets" USING btree ("org_id","name");--> statement-breakpoint
CREATE INDEX "permission_sets_org_idx" ON "permission_sets" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_permission_sets_user_set_uq" ON "user_permission_sets" USING btree ("user_id","permission_set_id");--> statement-breakpoint
CREATE INDEX "user_permission_sets_org_user_idx" ON "user_permission_sets" USING btree ("org_id","user_id");