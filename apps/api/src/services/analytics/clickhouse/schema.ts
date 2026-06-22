/**
 * ClickHouse schema for the email-events analytics warehouse.
 *
 * - email_events: the wide fact table (MergeTree), partitioned by month,
 *   ordered for the common (org, campaign, time) access pattern.
 * - email_events_daily + its materialized view: a SummingMergeTree rollup of
 *   per-(org, campaign, day, event_type) counts that backs org/campaign
 *   dashboards in milliseconds instead of scanning the fact table.
 *
 * All DDL is idempotent (IF NOT EXISTS) so ensureSchema() is safe to re-run.
 */
import { chExec, clickHouseConfig } from './client.js';

export const EMAIL_EVENTS_DDL = (db: string) => `
CREATE TABLE IF NOT EXISTS ${db}.email_events (
  id           String,
  org_id       String,
  campaign_id  String,
  contact_id   String,
  stream       LowCardinality(String),
  event_type   LowCardinality(String),
  bounce_type  LowCardinality(String),
  message_id   String,
  link_url     String,
  device_type  LowCardinality(String),
  email_client LowCardinality(String),
  ab_variant_id String,
  is_bot       UInt8,
  created_at   DateTime64(3)
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(created_at)
ORDER BY (org_id, campaign_id, created_at)
SETTINGS index_granularity = 8192`;

export const EMAIL_EVENTS_DAILY_DDL = (db: string) => `
CREATE TABLE IF NOT EXISTS ${db}.email_events_daily (
  org_id      String,
  campaign_id String,
  day         Date,
  event_type  LowCardinality(String),
  bounce_type LowCardinality(String),
  events      UInt64,
  unique_contacts AggregateFunction(uniq, String)
)
ENGINE = SummingMergeTree
PARTITION BY toYYYYMM(day)
ORDER BY (org_id, campaign_id, day, event_type, bounce_type)`;

export const EMAIL_EVENTS_DAILY_MV_DDL = (db: string) => `
CREATE MATERIALIZED VIEW IF NOT EXISTS ${db}.email_events_daily_mv
TO ${db}.email_events_daily AS
SELECT
  org_id,
  campaign_id,
  toDate(created_at) AS day,
  event_type,
  bounce_type,
  count() AS events,
  uniqState(contact_id) AS unique_contacts
FROM ${db}.email_events
GROUP BY org_id, campaign_id, day, event_type, bounce_type`;

/** Create the database + tables + materialized view. Idempotent. */
export async function ensureClickHouseSchema(): Promise<void> {
  const cfg = clickHouseConfig();
  await chExec(`CREATE DATABASE IF NOT EXISTS ${cfg.database}`, { ...cfg, database: 'default' });
  await chExec(EMAIL_EVENTS_DDL(cfg.database));
  await chExec(EMAIL_EVENTS_DAILY_DDL(cfg.database));
  await chExec(EMAIL_EVENTS_DAILY_MV_DDL(cfg.database));
}
