-- #384 Jmeniny (name-day) workflow trigger — adds name_day_today trigger type
-- and enables the `unaccent` extension used by the trigger's contact-matching SQL.

CREATE EXTENSION IF NOT EXISTS unaccent;

ALTER TYPE "workflow_trigger_type" ADD VALUE IF NOT EXISTS 'name_day_today';
