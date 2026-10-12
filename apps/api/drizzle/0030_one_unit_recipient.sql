-- Z137. One unit everywhere: the recipient. A `send` row is one recipient on
-- every path; the plan limit, the plan send counter and the invoice count
-- those rows, and a sandboxed send is in none of them.
ALTER TABLE "email_events" ADD COLUMN "recipient" varchar(320);--> statement-breakpoint
ALTER TABLE "email_events" ADD COLUMN "sandbox" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Sandboxed `send` rows written before this column: the transactional path
-- marked them metadata.sandbox, the Resend-compatible routes metadata.testMode.
UPDATE "email_events" SET "sandbox" = true
WHERE "event_type" = 'send'
  AND ("metadata"->>'sandbox' = 'true' OR "metadata"->>'testMode' = 'true');--> statement-breakpoint
-- A `send` row written twice for one message — mta-sender run again on a
-- stalled job posted the same campaign message's `send` a second time. Keep the
-- first, delete the rest, so the unique index below can be built and every
-- reader of `send` rows (campaign stats included) counts the message once.
-- Rows before this migration have no recipient, so a message is the key. Uses
-- email_events_org_send_message_idx (0029), dropped right after.
DELETE FROM "email_events" e
USING "email_events" k
WHERE e."event_type" = 'send' AND k."event_type" = 'send'
  AND e."org_id" = k."org_id" AND e."message_id" = k."message_id"
  AND e."recipient" IS NULL AND k."recipient" IS NULL
  AND (k."created_at", k."id") < (e."created_at", e."id");--> statement-breakpoint
DROP INDEX "email_events_org_send_message_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "email_events_send_recipient_uq" ON "email_events" USING btree ("org_id","message_id","recipient") WHERE "email_events"."event_type" = 'send';--> statement-breakpoint
-- The count the plan send counter must equal: `send` rows in the period that
-- are not sandboxed. One row is one recipient, and the unique index above
-- keeps a delivery from having two, so the count is of rows — no
-- de-duplication at read time.
CREATE OR REPLACE FUNCTION plan_send_truth(p_org uuid, p_start timestamptz) RETURNS integer
LANGUAGE sql STABLE AS $$
  SELECT count(*)::int
  FROM email_events
  WHERE org_id = p_org AND event_type = 'send' AND NOT sandbox AND created_at >= p_start
$$;--> statement-breakpoint
-- The counter's trigger, as in 0029 (per statement, org_id order, the period's
-- row locked, the period's first send opening it from email_events), with the
-- one change of unit: it adds the statement's non-sandboxed `send` rows in the
-- period. The transition table holds only rows actually inserted, so a
-- duplicate dropped by ON CONFLICT DO NOTHING adds nothing.
CREATE OR REPLACE FUNCTION plan_send_counter_count() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  o uuid;
  ps timestamptz;
  opened boolean;
  added integer;
BEGIN
  FOR o IN
    SELECT DISTINCT org_id FROM new_rows
    WHERE event_type = 'send' AND NOT sandbox
    ORDER BY org_id
  LOOP
    opened := false;
    LOOP
      ps := plan_period_start(o);
      PERFORM 1 FROM plan_send_counters WHERE org_id = o AND period_start = ps FOR UPDATE;
      IF NOT FOUND THEN
        PERFORM pg_advisory_xact_lock(hashtextextended('plan_send_counters ' || o::text, 0));
        ps := plan_period_start(o);
        PERFORM 1 FROM plan_send_counters WHERE org_id = o AND period_start = ps FOR UPDATE;
        IF NOT FOUND THEN
          INSERT INTO plan_send_counters (org_id, period_start, sends)
          VALUES (o, ps, plan_send_truth(o, ps));
          opened := true;
          EXIT;
        END IF;
      END IF;
      EXIT WHEN ps = plan_period_start(o);
    END LOOP;
    CONTINUE WHEN opened;

    SELECT count(*) INTO added
    FROM new_rows n
    WHERE n.org_id = o AND n.event_type = 'send' AND NOT n.sandbox AND n.created_at >= ps;
    IF added > 0 THEN
      UPDATE plan_send_counters SET sends = sends + added, updated_at = now()
      WHERE org_id = o AND period_start = ps;
    END IF;
  END LOOP;
  RETURN NULL;
END
$$;--> statement-breakpoint
-- Recount every current period under the new unit: sandboxed rows out, the
-- duplicates deleted above out. This lowers counters on purpose. Inside the
-- migration's transaction, with email_events locked against writes by the
-- index build, so no send lands between the count and the trigger.
INSERT INTO plan_send_counters (org_id, period_start, sends)
SELECT o.id, p.ps, plan_send_truth(o.id, p.ps)
FROM organizations o
CROSS JOIN LATERAL (SELECT plan_period_start(o.id) AS ps) p
WHERE EXISTS (
  SELECT 1 FROM email_events e
  WHERE e.org_id = o.id AND e.event_type = 'send' AND e.created_at >= p.ps
) OR EXISTS (
  SELECT 1 FROM plan_send_counters c WHERE c.org_id = o.id AND c.period_start = p.ps
)
ON CONFLICT (org_id, period_start) DO UPDATE
  SET sends = EXCLUDED.sends, updated_at = now();
