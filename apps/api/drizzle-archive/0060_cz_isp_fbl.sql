-- Sprint B.4 — Extend isp_provider enum with CZ ISPs.
-- See ACTION_PLAN.md §2 Sprint B + EMAIL_DEEP_ANALYSIS Část 5 P0 #14.
--
-- ALTER TYPE ... ADD VALUE is Postgres-native; cannot run inside a transaction
-- block when adding multiple values in one statement, so each is its own DO
-- block to stay idempotent and avoid duplicate-value errors on re-runs.

DO $$ BEGIN
  ALTER TYPE "isp_provider" ADD VALUE IF NOT EXISTS 'seznam' BEFORE 'other';
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TYPE "isp_provider" ADD VALUE IF NOT EXISTS 'volny' BEFORE 'other';
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TYPE "isp_provider" ADD VALUE IF NOT EXISTS 'centrum' BEFORE 'other';
EXCEPTION WHEN duplicate_object THEN null; END $$;
