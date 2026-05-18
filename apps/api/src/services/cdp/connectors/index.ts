/**
 * CDP connector registry & sync orchestration (#263).
 *
 * runSync(source) dispatches to the correct connector based on source.kind,
 * records a cdp_sync_runs row, and updates source metadata.
 */

import { eq } from 'drizzle-orm';
import { db } from '../../../db/client.js';
import { cdpSources, cdpSyncRuns } from '../../../db/schema/cdp-sources.js';
import { pullHubSpotContacts } from './hubspot.js';
import { pullShopifyCustomers } from './shopify.js';
import { pullStripeCustomers } from './stripe.js';

export type ConnectorKind =
  | 'hubspot' | 'salesforce' | 'pipedrive'
  | 'shopify' | 'woocommerce' | 'bigcommerce' | 'stripe'
  | 'zendesk' | 'intercom' | 'freshdesk'
  | 'meta_ads' | 'google_ads' | 'tiktok_ads'
  | 'google_analytics' | 'segment' | 'mixpanel'
  | 'webhook' | 'http_pull';

export interface SyncResult {
  rowsPulled: number;
  rowsUpserted: number;
  rowsSkipped: number;
  rowsFailed: number;
  cursor: string;
}

export async function runSync(sourceId: string): Promise<SyncResult> {
  const [source] = await db.select().from(cdpSources).where(eq(cdpSources.id, sourceId)).limit(1);
  if (!source) throw new Error(`CDP source not found: ${sourceId}`);

  const [run] = await db.insert(cdpSyncRuns).values({
    orgId: source.orgId,
    sourceId: source.id,
    status: 'running',
  }).returning();
  if (!run) throw new Error('Failed to create CDP sync run');

  try {
    const result = await dispatch(source.orgId, source.kind as ConnectorKind, source.config, source.lastCursor ?? undefined);

    await db.update(cdpSyncRuns).set({
      status: 'completed',
      rowsPulled: result.rowsPulled,
      rowsUpserted: result.rowsUpserted,
      rowsSkipped: result.rowsSkipped,
      rowsFailed: result.rowsFailed,
      finishedAt: new Date(),
    }).where(eq(cdpSyncRuns.id, run.id));

    await db.update(cdpSources).set({
      lastCursor: result.cursor,
      lastSyncAt: new Date(),
      lastError: null,
      status: 'active',
      updatedAt: new Date(),
    }).where(eq(cdpSources.id, sourceId));

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    await db.update(cdpSyncRuns).set({
      status: 'failed',
      error: message,
      finishedAt: new Date(),
    }).where(eq(cdpSyncRuns.id, run.id));

    await db.update(cdpSources).set({
      lastError: message,
      status: 'error',
      updatedAt: new Date(),
    }).where(eq(cdpSources.id, sourceId));

    throw err;
  }
}

async function dispatch(
  orgId: string,
  kind: ConnectorKind,
  config: Record<string, unknown>,
  since?: string,
): Promise<SyncResult> {
  const base: SyncResult = { rowsPulled: 0, rowsUpserted: 0, rowsSkipped: 0, rowsFailed: 0, cursor: new Date().toISOString() };

  switch (kind) {
    case 'hubspot': {
      const r = await pullHubSpotContacts(orgId, config as never, since);
      return { ...base, ...r };
    }
    case 'shopify': {
      const r = await pullShopifyCustomers(orgId, config as never, since);
      return { ...base, ...r };
    }
    case 'stripe': {
      const r = await pullStripeCustomers(orgId, config as never, since);
      return { ...base, ...r };
    }
    case 'webhook':
    case 'http_pull':
      // Push sources don't need explicit pull — data arrives via webhook
      return { ...base, cursor: new Date().toISOString() };
    default:
      throw new Error(`Connector kind '${kind}' not yet implemented`);
  }
}
