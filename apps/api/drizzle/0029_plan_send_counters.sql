CREATE TABLE "plan_send_counters" (
	"org_id" uuid NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"sends" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_send_counters_org_id_period_start_pk" PRIMARY KEY("org_id","period_start")
);
--> statement-breakpoint
ALTER TABLE "plan_send_counters" ADD CONSTRAINT "plan_send_counters_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_events_org_send_message_idx" ON "email_events" USING btree ("org_id","message_id") WHERE "email_events"."event_type" = 'send';--> statement-breakpoint
-- Z136. The plan's monthly send count, kept as a row per organisation and
-- period (plan_send_counters) instead of COUNT(*) over email_events on every
-- send. Everything below is SQL the schema files cannot express; the schema
-- file says what the table is for.
--
-- Locks, in the one order every path takes them: the organisation's advisory
-- lock (only to create a period's row), then the period's counter row. The row
-- lock is what serialises one organisation's sends; it is a row lock, so a
-- transaction that writes a million `send` rows holds one of it, not a million
-- entries in the shared lock table.
--
-- The first of the calendar month, UTC: the period of an organisation with no
-- Stripe period start. getPlanCapacity used to compute it in Node as local
-- midnight of the UTC month — the same instant on a UTC server, which is what
-- the containers run.
CREATE OR REPLACE FUNCTION plan_calendar_period_start() RETURNS timestamptz
LANGUAGE sql STABLE AS $$
  SELECT date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
$$;
--> statement-breakpoint
-- The start of the organisation's current billing period: the Stripe period
-- start when there is a subscription row with one, else the calendar month.
-- The one definition the counter's writer (the trigger below) and its reader
-- (getPlanCapacity) share, so they cannot pick different rows.
CREATE OR REPLACE FUNCTION plan_period_start(p_org uuid) RETURNS timestamptz
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT current_period_start FROM billing_subscriptions WHERE org_id = p_org LIMIT 1),
    plan_calendar_period_start()
  )
$$;
--> statement-breakpoint
-- The count the counter must equal: messages with a `send` row in the period,
-- each message once (rows without a message id each count). Used to open a
-- period's row and by the reconciliation; never on the send path.
CREATE OR REPLACE FUNCTION plan_send_truth(p_org uuid, p_start timestamptz) RETURNS integer
LANGUAGE sql STABLE AS $$
  SELECT (count(DISTINCT message_id) + count(*) FILTER (WHERE message_id IS NULL))::int
  FROM email_events
  WHERE org_id = p_org AND event_type = 'send' AND created_at >= p_start
$$;
--> statement-breakpoint
-- Create the row for the organisation's current period when the period start
-- moved — a subscription created, or Stripe starting a new period: `send` rows
-- written between the new start and the webhook were counted under the old
-- start, so the new row is counted from email_events. Under the
-- organisation's advisory lock, as the first send of a period is. An existing
-- row is never lowered: the events behind it may have been archived since
-- (archive-email-events deletes rows older than 30 days, and a period can be
-- 31).
CREATE OR REPLACE FUNCTION plan_send_counter_open(p_org uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  ps timestamptz;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('plan_send_counters ' || p_org::text, 0));
  ps := plan_period_start(p_org);
  INSERT INTO plan_send_counters (org_id, period_start, sends)
  VALUES (p_org, ps, plan_send_truth(p_org, ps))
  ON CONFLICT (org_id, period_start) DO UPDATE
    SET sends = GREATEST(plan_send_counters.sends, EXCLUDED.sends), updated_at = now();
END
$$;
--> statement-breakpoint
-- The sends a statement adds, counted in that statement — and so in its
-- transaction: if the insert fails or rolls back, so does the count.
--
-- Per statement, not per row, with the inserted rows as a transition table:
-- one UPDATE of the counter row per organisation per statement. Per row, a
-- statement inserting n `send` rows updated the same row n times in one
-- transaction, each update one more version to walk past, which is quadratic
-- — measured: 500,000 rows in one INSERT had not finished after ten minutes.
--
-- Per organisation in the statement, in org_id order (so two statements never
-- take two organisations' rows in opposite orders):
--  1. Lock the period's row. Every send of the organisation waits here for the
--     previous one to commit. If the period moved while this waited (a
--     subscription change locks the old period's row before it opens the new
--     one, see below), go round again and lock the new period's row.
--  2. No row: this is the period's first send. Under the organisation's lock,
--     create the row counted from email_events — this statement's rows
--     included, so nothing is added to it.
--  3. Otherwise add the messages of this statement that are in the period and
--     were not already sent in it by another statement. The question is asked
--     holding the row, so a concurrent second row for the same message —
--     a job that ran twice — waits for the first to commit, and then sees it.
--     "Already sent" is: the period holds more `send` rows for the message
--     than this statement inserted. (Not "a row whose id is not one of
--     ours": as a NOT IN over a million ids it outgrew work_mem and went
--     quadratic.) Two rows for one message in one INSERT count once.
--
-- A row dated before the current period is not counted: the plan never counted
-- it (created_at >= period start), and it is not this period's send.
CREATE OR REPLACE FUNCTION plan_send_counter_count() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  o uuid;
  ps timestamptz;
  opened boolean;
  added integer;
BEGIN
  FOR o IN
    SELECT DISTINCT org_id FROM new_rows WHERE event_type = 'send' ORDER BY org_id
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
    FROM (
      SELECT n.message_id, count(*) AS mine
      FROM new_rows n
      WHERE n.org_id = o AND n.event_type = 'send' AND n.created_at >= ps
        AND n.message_id IS NOT NULL
      GROUP BY n.message_id
    ) m
    WHERE (
      SELECT count(*) FROM email_events e
      WHERE e.org_id = o AND e.message_id = m.message_id
        AND e.event_type = 'send' AND e.created_at >= ps
    ) = m.mine;
    added := added + (
      SELECT count(*) FROM new_rows n
      WHERE n.org_id = o AND n.event_type = 'send' AND n.created_at >= ps
        AND n.message_id IS NULL
    );
    IF added > 0 THEN
      UPDATE plan_send_counters SET sends = sends + added, updated_at = now()
      WHERE org_id = o AND period_start = ps;
    END IF;
  END LOOP;
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE TRIGGER email_events_plan_send_counter
AFTER INSERT ON email_events
REFERENCING NEW TABLE AS new_rows
FOR EACH STATEMENT
EXECUTE FUNCTION plan_send_counter_count();
--> statement-breakpoint
-- The period start moved. Take the organisation's lock, then the old period's
-- row: a send already counting there holds that row, so this waits for it to
-- commit and the count below includes it; a send that arrives later waits for
-- this transaction, then finds the new start and counts there.
CREATE OR REPLACE FUNCTION plan_send_counter_period_moved() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  old_start timestamptz := plan_calendar_period_start();
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.current_period_start IS NOT NULL THEN
    old_start := OLD.current_period_start;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('plan_send_counters ' || NEW.org_id::text, 0));
  PERFORM 1 FROM plan_send_counters
  WHERE org_id = NEW.org_id AND period_start = old_start
  FOR UPDATE;
  PERFORM plan_send_counter_open(NEW.org_id);
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE TRIGGER billing_subscriptions_plan_send_counter_insert
AFTER INSERT ON billing_subscriptions
FOR EACH ROW EXECUTE FUNCTION plan_send_counter_period_moved();
--> statement-breakpoint
CREATE TRIGGER billing_subscriptions_plan_send_counter_update
AFTER UPDATE OF current_period_start ON billing_subscriptions
FOR EACH ROW WHEN (NEW.current_period_start IS DISTINCT FROM OLD.current_period_start)
EXECUTE FUNCTION plan_send_counter_period_moved();
--> statement-breakpoint
-- Backfill: every organisation with sends in its current period gets its row,
-- so the first period after this migration reads what the old COUNT read
-- (each message once). Inside the migration's transaction, after the index
-- and the trigger have locked email_events against writes, so no send lands
-- between the count and the trigger.
INSERT INTO plan_send_counters (org_id, period_start, sends)
SELECT o.id, p.ps, plan_send_truth(o.id, p.ps)
FROM organizations o
CROSS JOIN LATERAL (SELECT plan_period_start(o.id) AS ps) p
WHERE EXISTS (
  SELECT 1 FROM email_events e
  WHERE e.org_id = o.id AND e.event_type = 'send' AND e.created_at >= p.ps
);
