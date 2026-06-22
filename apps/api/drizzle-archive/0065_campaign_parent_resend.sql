-- Sprint E.1 — Auto-resend to non-openers.
-- parent_campaign_id links the resend child to its parent so the splitter
-- can pull "received-parent AND did-not-open-parent" at send time. The
-- audience-criteria columns (list_id, segment_id) stay null on the child
-- because the audience is event-derived.
--
-- auto_resend_config carries the operator's intent (delay, optional subject
-- override, bot-inclusion flag) without packing it into separate columns
-- since the field set is likely to grow with subsequent iterations.

ALTER TABLE "campaigns"
  ADD COLUMN IF NOT EXISTS "parent_campaign_id" uuid;

ALTER TABLE "campaigns"
  ADD COLUMN IF NOT EXISTS "auto_resend_config" jsonb;

DO $$ BEGIN
  ALTER TABLE "campaigns"
    ADD CONSTRAINT "campaigns_parent_campaign_fk"
    FOREIGN KEY ("parent_campaign_id")
    REFERENCES "campaigns"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "campaigns_parent_idx"
  ON "campaigns" ("parent_campaign_id");
