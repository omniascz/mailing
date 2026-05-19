-- Sprint D.1 + D.9 — per-list opt-out columns on contact_lists.
-- Backs the preference center's "unsubscribe from this list only" affordance
-- and the per-list opt-out toggle in the public center. batch-sender will
-- skip (contact, list) pairs with unsubscribed_at set, separately from the
-- global suppressions check.

ALTER TABLE "contact_lists"
  ADD COLUMN IF NOT EXISTS "unsubscribed_at" timestamp with time zone;

ALTER TABLE "contact_lists"
  ADD COLUMN IF NOT EXISTS "unsubscribed_reason" varchar(255);
