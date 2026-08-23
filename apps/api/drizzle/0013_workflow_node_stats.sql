CREATE TABLE "workflow_node_stats" (
	"org_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"node_id" varchar(255) NOT NULL,
	"entered" bigint DEFAULT 0 NOT NULL,
	"advanced" bigint DEFAULT 0 NOT NULL,
	"branched_true" bigint DEFAULT 0 NOT NULL,
	"branched_false" bigint DEFAULT 0 NOT NULL,
	"waited" bigint DEFAULT 0 NOT NULL,
	"resumed" bigint DEFAULT 0 NOT NULL,
	"ended_here" bigint DEFAULT 0 NOT NULL,
	"failed_here" bigint DEFAULT 0 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_node_stats_workflow_id_node_id_pk" PRIMARY KEY("workflow_id","node_id")
);
--> statement-breakpoint
ALTER TABLE "workflows" ADD COLUMN "node_stats_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workflow_node_stats" ADD CONSTRAINT "workflow_node_stats_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_node_stats" ADD CONSTRAINT "workflow_node_stats_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workflow_node_stats_org_idx" ON "workflow_node_stats" USING btree ("org_id","workflow_id");