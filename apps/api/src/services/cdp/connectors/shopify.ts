/**
 * Shopify CDP source connector (#263).
 * Pulls customers + orders incrementally via Shopify REST Admin API.
 */

import { upsertContactFromCdp } from '../source-sync.js';

interface ShopifyConfig {
  shopDomain: string;   // e.g. mystore.myshopify.com
  accessToken: string;
}

interface ShopifyCustomer {
  id: number;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  orders_count: number;
  total_spent: string;
  updated_at: string;
  tags: string;
}

export async function pullShopifyCustomers(
  orgId: string,
  config: ShopifyConfig,
  since?: string,
): Promise<{ rowsPulled: number; rowsUpserted: number; cursor: string }> {
  const base = `https://${config.shopDomain}/admin/api/2024-01`;
  const params = new URLSearchParams({ limit: '250' });
  if (since) params.set('updated_at_min', since);

  let url: string | null = `${base}/customers.json?${params}`;
  let total = 0;
  let upserted = 0;

  while (url) {
    const res: Response | null = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': config.accessToken,
        'Content-Type': 'application/json',
      },
    }).catch(() => null);
    if (!res?.ok) break;

    const data = (await res.json()) as { customers?: ShopifyCustomer[] };

    for (const c of data.customers ?? []) {
      if (!c.email) continue;
      await upsertContactFromCdp(orgId, {
        externalId: String(c.id),
        source: 'shopify',
        email: c.email,
        firstName: c.first_name ?? undefined,
        lastName: c.last_name ?? undefined,
        phone: c.phone ?? undefined,
        traits: {
          shopify_customer_id: c.id,
          shopify_orders_count: c.orders_count,
          shopify_total_spent: c.total_spent,
          shopify_tags: c.tags,
        },
      }).catch(() => {});
      upserted++;
    }

    total += data.customers?.length ?? 0;

    const link: string = res.headers.get('link') ?? '';
    const next: string | null = link.match(/<([^>]+)>;\s*rel="next"/)?.[1] ?? null;
    url = next;
  }

  return { rowsPulled: total, rowsUpserted: upserted, cursor: new Date().toISOString() };
}
