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
  | 'hubspot'
  | 'salesforce'
  | 'pipedrive'
  | 'shopify'
  | 'woocommerce'
  | 'bigcommerce'
  | 'stripe'
  | 'zendesk'
  | 'intercom'
  | 'freshdesk'
  | 'meta_ads'
  | 'google_ads'
  | 'tiktok_ads'
  | 'google_analytics'
  | 'segment'
  | 'mixpanel'
  | 'webhook'
  | 'http_pull';

/**
 * Connector availability:
 *   'implemented' — has a working pull connector (dispatch handles it).
 *   'push'        — receives data via webhook/HTTP push (no pull needed).
 *   'planned'     — declared but not yet built; source creation is rejected
 *                   up front so users don't create a source that silently
 *                   fails on first sync.
 */
export type ConnectorStatus = 'implemented' | 'push' | 'planned';

export interface ConnectorInfo {
  kind: ConnectorKind;
  label: string;
  mode: 'pull' | 'push';
  status: ConnectorStatus;
}

export const CONNECTOR_CATALOG: Record<ConnectorKind, ConnectorInfo> = {
  hubspot: { kind: 'hubspot', label: 'HubSpot', mode: 'pull', status: 'implemented' },
  shopify: { kind: 'shopify', label: 'Shopify', mode: 'pull', status: 'implemented' },
  stripe: { kind: 'stripe', label: 'Stripe', mode: 'pull', status: 'implemented' },
  webhook: { kind: 'webhook', label: 'Webhook (push)', mode: 'push', status: 'push' },
  http_pull: { kind: 'http_pull', label: 'Generic HTTP (push)', mode: 'push', status: 'push' },
  salesforce: { kind: 'salesforce', label: 'Salesforce', mode: 'pull', status: 'planned' },
  pipedrive: { kind: 'pipedrive', label: 'Pipedrive', mode: 'pull', status: 'planned' },
  woocommerce: { kind: 'woocommerce', label: 'WooCommerce', mode: 'pull', status: 'planned' },
  bigcommerce: { kind: 'bigcommerce', label: 'BigCommerce', mode: 'pull', status: 'planned' },
  zendesk: { kind: 'zendesk', label: 'Zendesk', mode: 'pull', status: 'planned' },
  intercom: { kind: 'intercom', label: 'Intercom', mode: 'pull', status: 'planned' },
  freshdesk: { kind: 'freshdesk', label: 'Freshdesk', mode: 'pull', status: 'planned' },
  meta_ads: { kind: 'meta_ads', label: 'Meta Ads', mode: 'pull', status: 'planned' },
  google_ads: { kind: 'google_ads', label: 'Google Ads', mode: 'pull', status: 'planned' },
  tiktok_ads: { kind: 'tiktok_ads', label: 'TikTok Ads', mode: 'pull', status: 'planned' },
  google_analytics: {
    kind: 'google_analytics',
    label: 'Google Analytics',
    mode: 'pull',
    status: 'planned',
  },
  segment: { kind: 'segment', label: 'Segment', mode: 'pull', status: 'planned' },
  mixpanel: { kind: 'mixpanel', label: 'Mixpanel', mode: 'pull', status: 'planned' },
};

/** All connectors + their availability — used by the API/UI to offer choices. */
export function listConnectors(): ConnectorInfo[] {
  return Object.values(CONNECTOR_CATALOG);
}

/** True when a source of this kind can actually be created + synced today. */
export function isConnectorAvailable(kind: string): boolean {
  const info = CONNECTOR_CATALOG[kind as ConnectorKind];
  return !!info && info.status !== 'planned';
}

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

  const [run] = await db
    .insert(cdpSyncRuns)
    .values({
      orgId: source.orgId,
      sourceId: source.id,
      status: 'running',
    })
    .returning();
  if (!run) throw new Error('Failed to create CDP sync run');

  try {
    const result = await dispatch(
      source.orgId,
      source.kind as ConnectorKind,
      source.config,
      source.lastCursor ?? undefined,
    );

    await db
      .update(cdpSyncRuns)
      .set({
        status: 'completed',
        rowsPulled: result.rowsPulled,
        rowsUpserted: result.rowsUpserted,
        rowsSkipped: result.rowsSkipped,
        rowsFailed: result.rowsFailed,
        finishedAt: new Date(),
      })
      .where(eq(cdpSyncRuns.id, run.id));

    await db
      .update(cdpSources)
      .set({
        lastCursor: result.cursor,
        lastSyncAt: new Date(),
        lastError: null,
        status: 'active',
        updatedAt: new Date(),
      })
      .where(eq(cdpSources.id, sourceId));

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    await db
      .update(cdpSyncRuns)
      .set({
        status: 'failed',
        error: message,
        finishedAt: new Date(),
      })
      .where(eq(cdpSyncRuns.id, run.id));

    await db
      .update(cdpSources)
      .set({
        lastError: message,
        status: 'error',
        updatedAt: new Date(),
      })
      .where(eq(cdpSources.id, sourceId));

    throw err;
  }
}

async function dispatch(
  orgId: string,
  kind: ConnectorKind,
  config: Record<string, unknown>,
  since?: string,
): Promise<SyncResult> {
  const base: SyncResult = {
    rowsPulled: 0,
    rowsUpserted: 0,
    rowsSkipped: 0,
    rowsFailed: 0,
    cursor: new Date().toISOString(),
  };

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
    default: {
      const info = CONNECTOR_CATALOG[kind];
      const label = info?.label ?? kind;
      throw new Error(
        info?.status === 'planned'
          ? `Connector '${label}' is not yet available (planned) — pull sync is not implemented`
          : `Connector kind '${kind}' is not supported`,
      );
    }
  }
}
