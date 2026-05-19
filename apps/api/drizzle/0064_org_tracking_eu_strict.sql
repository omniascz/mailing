-- Sprint D.8 — Per-org ePrivacy strict mode toggle.
-- When ON: batch-sender pulls per-contact 'tracking' consent before applying
-- wrapLinks + injectOpenPixel. Contacts without explicit consent receive
-- emails without rewritten links or open pixels.
-- When OFF (default): every non-transactional send is tracked under the
-- org's legitimate-interest claim. Suitable for B2B and CZ/SK senders that
-- treat tracking as part of the basic service contract.

ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "tracking_eu_strict" boolean NOT NULL DEFAULT false;
