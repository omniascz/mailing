-- #185 Deal stage automation (stale deal trigger fires via api_event — no schema changes)
-- #187 CRM task management
-- #188 assign_task workflow action (NodeType extension — no schema changes)
-- #189 CRM notes
-- #190 Activity feed (read-only — no schema changes)

-- ─── #187 CRM Tasks ──────────────────────────────────────────────────────────

CREATE TYPE crm_task_type     AS ENUM ('call', 'email', 'meeting', 'todo');
CREATE TYPE crm_task_status   AS ENUM ('open', 'completed', 'cancelled');
CREATE TYPE crm_task_priority AS ENUM ('low', 'medium', 'high', 'urgent');

CREATE TABLE IF NOT EXISTS crm_tasks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL,
  type              crm_task_type     NOT NULL DEFAULT 'todo',
  status            crm_task_status   NOT NULL DEFAULT 'open',
  priority          crm_task_priority NOT NULL DEFAULT 'medium',
  title             TEXT NOT NULL,
  description       TEXT,
  contact_id        UUID,
  deal_id           UUID REFERENCES deals(id)    ON DELETE SET NULL,
  account_id        UUID REFERENCES accounts(id) ON DELETE SET NULL,
  assigned_user_id  UUID REFERENCES users(id)    ON DELETE SET NULL,
  created_by_user_id UUID REFERENCES users(id)   ON DELETE SET NULL,
  due_at            TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS crm_tasks_org_idx      ON crm_tasks (org_id);
CREATE INDEX IF NOT EXISTS crm_tasks_contact_idx  ON crm_tasks (contact_id);
CREATE INDEX IF NOT EXISTS crm_tasks_deal_idx     ON crm_tasks (deal_id);
CREATE INDEX IF NOT EXISTS crm_tasks_assigned_idx ON crm_tasks (assigned_user_id);
CREATE INDEX IF NOT EXISTS crm_tasks_due_idx      ON crm_tasks (due_at);
CREATE INDEX IF NOT EXISTS crm_tasks_status_idx   ON crm_tasks (org_id, status);

-- ─── #189 CRM Notes ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_notes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL,
  body            TEXT NOT NULL,
  contact_id      UUID,
  deal_id         UUID REFERENCES deals(id)    ON DELETE CASCADE,
  account_id      UUID REFERENCES accounts(id) ON DELETE CASCADE,
  author_user_id  UUID REFERENCES users(id)    ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS crm_notes_org_idx     ON crm_notes (org_id);
CREATE INDEX IF NOT EXISTS crm_notes_contact_idx ON crm_notes (contact_id);
CREATE INDEX IF NOT EXISTS crm_notes_deal_idx    ON crm_notes (deal_id);
CREATE INDEX IF NOT EXISTS crm_notes_account_idx ON crm_notes (account_id);
