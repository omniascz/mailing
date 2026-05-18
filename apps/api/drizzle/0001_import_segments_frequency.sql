CREATE TYPE "public"."import_job_status" AS ENUM('uploaded', 'mapped', 'processing', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."import_job_format" AS ENUM('csv', 'xlsx');--> statement-breakpoint
CREATE TYPE "public"."frequency_channel" AS ENUM('email', 'sms', 'push', 'whatsapp', 'voice', 'all');--> statement-breakpoint
CREATE TABLE "import_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"created_by" uuid,
	"filename" varchar(255) NOT NULL,
	"format" "import_job_format" NOT NULL,
	"file_size" integer NOT NULL,
	"storage_path" varchar(512) NOT NULL,
	"status" "import_job_status" DEFAULT 'uploaded' NOT NULL,
	"detected_columns" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sample_rows" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"column_mapping" jsonb,
	"default_list_id" uuid,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"processed_rows" integer DEFAULT 0 NOT NULL,
	"inserted_rows" integer DEFAULT 0 NOT NULL,
	"updated_rows" integer DEFAULT 0 NOT NULL,
	"skipped_rows" integer DEFAULT 0 NOT NULL,
	"error_rows" integer DEFAULT 0 NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" varchar(1000),
	"conditions" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "org_frequency_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"channel" "frequency_channel" NOT NULL,
	"max_count" integer NOT NULL,
	"period_hours" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segments" ADD CONSTRAINT "segments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_frequency_rules" ADD CONSTRAINT "org_frequency_rules_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "import_jobs_org_id_idx" ON "import_jobs" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "import_jobs_org_status_idx" ON "import_jobs" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "segments_org_id_idx" ON "segments" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "org_frequency_rules_org_idx" ON "org_frequency_rules" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "org_frequency_rules_org_channel_idx" ON "org_frequency_rules" USING btree ("org_id","channel");
