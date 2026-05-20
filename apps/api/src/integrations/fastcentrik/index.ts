/**
 * FastCentrik integration (#368/#392).
 *
 * FastCentrik is a CZ e-shop platform that exports order data as XML feeds.
 * Unlike Shoptet/Upgates there's no REST API on the tenant side — we poll
 * the feed URL on a schedule (typically once per hour) and ingest any new
 * orders. Authentication (if any) is per-tenant Basic auth configured by
 * the feed owner.
 */

import { AppError } from '../../lib/app-error.js';
import { createConnection, ingestOrder, getConnection } from '../../services/ecommerce/index.js';
import type {
  FastCentrikCredentials,
  EcommerceConnection,
} from '../../db/schema/ecommerce-integrations.js';
import { parseFastCentrikOrdersFeed } from './pure.js';

export { parseFastCentrikOrdersFeed } from './pure.js';
export { normalizeFastCentrikOrder } from './pure.js';

// ─── Connection install ──────────────────────────────────────────────────────

export async function registerConnection(
  orgId: string,
  input: {
    eshopUrl: string;
    feedUrl: string;
    feedUsername?: string;
    feedPassword?: string;
    webhookSecret?: string;
    name?: string;
  },
): Promise<{ connectionId: string }> {
  // Validate feed URL by fetching head — FastCentrik feeds can be large so we
  // just confirm reachability with a HEAD/GET that returns text/xml.
  const res = await fetch(input.feedUrl, {
    method: 'GET',
    headers: authHeaders(input.feedUsername, input.feedPassword),
  });
  if (!res.ok) {
    throw new AppError({
      code: 'FASTCENTRIK_FEED_UNREACHABLE',
      message: `Feed returned ${res.status}`,
      statusCode: 400,
    });
  }

  const credentials: FastCentrikCredentials = {
    eshopUrl: input.eshopUrl,
    feedUrl: input.feedUrl,
    ...(input.feedUsername ? { feedUsername: input.feedUsername } : {}),
    ...(input.feedPassword ? { feedPassword: input.feedPassword } : {}),
    ...(input.webhookSecret ? { webhookSecret: input.webhookSecret } : {}),
  };
  const conn = await createConnection(orgId, {
    platform: 'fastcentrik',
    name: input.name ?? new URL(input.eshopUrl).hostname,
    credentials,
  });
  return { connectionId: conn.id };
}

// ─── Ingestion ──────────────────────────────────────────────────────────────

/**
 * Pull the feed, parse it, and ingest every order. Deduplication happens at
 * the `ingestOrder` layer via the external-id guard on `ecommerce_orders`.
 */
export async function ingestFeed(connection: EcommerceConnection): Promise<{ ingested: number }> {
  const creds = connection.credentials as FastCentrikCredentials;
  const res = await fetch(creds.feedUrl, {
    headers: {
      Accept: 'application/xml, text/xml',
      ...authHeaders(creds.feedUsername, creds.feedPassword),
    },
  });
  if (!res.ok) {
    throw new AppError({
      code: 'FASTCENTRIK_FEED_ERROR',
      message: `Feed returned ${res.status}`,
      statusCode: 502,
    });
  }
  const xml = await res.text();
  const orders = parseFastCentrikOrdersFeed(xml);

  let ingested = 0;
  for (const order of orders) {
    await ingestOrder(connection, order);
    ingested++;
  }
  return { ingested };
}

// ─── Utilities ──────────────────────────────────────────────────────────────

function authHeaders(username?: string, password?: string): Record<string, string> {
  if (!username) return {};
  const token = Buffer.from(`${username}:${password ?? ''}`).toString('base64');
  return { Authorization: `Basic ${token}` };
}

export async function getFastCentrikConnection(
  orgId: string,
  connectionId: string,
): Promise<EcommerceConnection & { credentials: FastCentrikCredentials }> {
  const conn = await getConnection(orgId, connectionId);
  if (conn.platform !== 'fastcentrik') {
    throw new Error(`Connection ${connectionId} is not a FastCentrik connection`);
  }
  return conn as EcommerceConnection & { credentials: FastCentrikCredentials };
}
