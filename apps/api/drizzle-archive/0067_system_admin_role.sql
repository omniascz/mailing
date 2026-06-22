-- Sprint T.1 — add system_admin to user_role enum.
--
-- This role is platform-wide, not org-scoped. A user with role=system_admin
-- on their (single, sentinel) row sees and acts across all tenants via the
-- /superadmin/* routes. The role is assigned only via direct DB intervention
-- (psql or seed); no UI promotion exists.

ALTER TYPE "user_role" ADD VALUE IF NOT EXISTS 'system_admin';
