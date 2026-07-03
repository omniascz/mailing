-- Delegate a dedicated IP to a subaccount (child org) for per-subaccount
-- reputation isolation, while the parent org keeps ownership/billing.
ALTER TABLE "dedicated_ips" ADD COLUMN IF NOT EXISTS "subaccount_id" uuid
  REFERENCES "organizations"("id") ON DELETE set null;
CREATE INDEX IF NOT EXISTS "dedicated_ips_subaccount_idx" ON "dedicated_ips" ("subaccount_id");
