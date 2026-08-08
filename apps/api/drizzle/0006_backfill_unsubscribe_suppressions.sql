-- Contacts flagged `unsubscribed` but missing from the suppression list.
--
-- The send path consults `suppressions`, not `contacts.status`: resolveAudience
-- only excludes 'archived' and 'non_subscribed', and /internal/contacts/batch
-- filtered nothing at all. So the four paths that set the status alone — the
-- contacts API, Resend-compat, the SMS keyword handler and importers — left
-- people who had asked to leave still reachable by campaigns.
--
-- unsubscribeContact writes both from now on. This closes the ones already in
-- the table. It only ever adds a block, never removes one, and ON CONFLICT
-- makes it safe to re-run.
--
-- The reverse direction is deliberately not backfilled: a suppression can also
-- be a hard bounce or a complaint, where `status` should stay 'bounced' or
-- 'complained' rather than become 'unsubscribed'.
INSERT INTO "suppressions" ("org_id", "email", "reason", "notes")
SELECT c."org_id", lower(c."email"), 'unsubscribe',
       'backfilled 0006: contacts.status was unsubscribed with no suppression'
FROM "contacts" c
WHERE c."status" = 'unsubscribed'
  AND c."email" IS NOT NULL
  AND c."deleted_at" IS NULL
ON CONFLICT DO NOTHING;
