CREATE TABLE "event_attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"external_event_id" uuid NOT NULL,
	"status" varchar(24) NOT NULL,
	"order_id" varchar(128),
	"amount" integer,
	"currency" varchar(3) DEFAULT 'CZK',
	"seats" integer DEFAULT 1,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attended_at" timestamp with time zone,
	"metadata" jsonb,
	CONSTRAINT "event_attendance_uq" UNIQUE("org_id","contact_id","external_event_id","status")
);
--> statement-breakpoint
CREATE TABLE "external_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"external_id" varchar(128) NOT NULL,
	"title" varchar(500) NOT NULL,
	"category" varchar(80),
	"subcategory" varchar(80),
	"venue_name" varchar(255),
	"venue_city" varchar(120),
	"currency" varchar(3) DEFAULT 'CZK',
	"starts_at" timestamp with time zone,
	"status" varchar(32) DEFAULT 'on_sale' NOT NULL,
	"unsold_seats" integer,
	"unsold_by_tier" jsonb,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "external_events_org_ext_uq" UNIQUE("org_id","external_id")
);
--> statement-breakpoint
ALTER TABLE "event_attendance" ADD CONSTRAINT "event_attendance_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_attendance" ADD CONSTRAINT "event_attendance_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_attendance" ADD CONSTRAINT "event_attendance_external_event_id_external_events_id_fk" FOREIGN KEY ("external_event_id") REFERENCES "public"."external_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_events" ADD CONSTRAINT "external_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_attendance_org_contact_idx" ON "event_attendance" USING btree ("org_id","contact_id");--> statement-breakpoint
CREATE INDEX "event_attendance_org_event_idx" ON "event_attendance" USING btree ("org_id","external_event_id");--> statement-breakpoint
CREATE INDEX "event_attendance_org_status_idx" ON "event_attendance" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "external_events_org_starts_idx" ON "external_events" USING btree ("org_id","starts_at");--> statement-breakpoint
CREATE INDEX "external_events_org_cat_idx" ON "external_events" USING btree ("org_id","category");