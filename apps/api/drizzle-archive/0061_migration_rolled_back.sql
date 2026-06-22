-- Sprint C.9 — add 'rolled_back' to migration_job_status enum.
-- Allows /api/v1/migrations/:id/rollback to mark a completed/failed job
-- whose imported contacts have been soft-deleted. The job row stays so
-- the rollback decision is audit-traceable.

DO $$ BEGIN
  ALTER TYPE "migration_job_status" ADD VALUE IF NOT EXISTS 'rolled_back';
EXCEPTION WHEN duplicate_object THEN null; END $$;
